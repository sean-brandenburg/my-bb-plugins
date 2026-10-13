"""Archive the threads of bb worktrees whose work is finished and idle.

bb's worktree plugin tears a worktree down five minutes after its last thread
is archived and keeps the branch, so archiving is the only action taken here.

A worktree qualifies when every guard below passes and its work is finished:
a linked kanban card is in Done or its PR is merged or closed, or the branch's
commits are all patch-equivalent to commits on the default branch.

Environment:
  DRY_RUN=1                 report what would be archived without archiving
  IDLE_DAYS=3               days since any of its threads last changed
  INCLUDE_UNTOUCHED=1       also clean worktrees with no commits and no card
"""

import json
import os
import re
import subprocess
import time

BB = os.environ.get("BB_CLI") or "bb"
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"
IDLE_DAYS = float(os.environ.get("IDLE_DAYS", "3"))
INCLUDE_UNTOUCHED = os.environ.get("INCLUDE_UNTOUCHED", "0") == "1"


class Skip(Exception):
    pass


def run(args, cwd=None, check=True):
    proc = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=120)
    if check and proc.returncode != 0:
        raise RuntimeError(f"{' '.join(args)}: {(proc.stderr or proc.stdout).strip()}")
    return proc


def bb_json(*args):
    return json.loads(run([BB, *args, "--json"]).stdout)


def git(path, *args, check=True):
    return run(["git", "-C", path, *args], check=check)


def processes_by_cwd():
    out = run(["lsof", "-a", "-d", "cwd", "-Fpcn"], check=False).stdout
    procs, pid, cmd = [], None, None
    for line in out.splitlines():
        if not line:
            continue
        tag, value = line[0], line[1:]
        if tag == "p":
            pid = value
        elif tag == "c":
            cmd = value
        elif tag == "n":
            procs.append((pid, cmd, value))
    return procs


def card_index(cards):
    by_thread, by_pr = {}, {}
    for card in cards:
        review = card.get("latestReview") or {}
        ids = [
            card.get("threadId"),
            card.get("reviewThreadId"),
            review.get("threadId"),
            (review.get("apply") or {}).get("threadId"),
        ]
        for thread_id in filter(None, ids):
            by_thread[thread_id] = card
        pr = card.get("pr")
        if pr:
            by_pr[(pr["repo"].split("/")[-1], pr["number"])] = card
    return by_thread, by_pr


# Review, tour, and apply threads aren't always linked to their card by id, but
# their titles name the PR, e.g. "Review edge-multiplexer#175: ...".
PR_REF = re.compile(r"([\w.-]+)#(\d+)")


def linked_cards(threads, by_thread, by_pr):
    cards = {}
    for thread in threads:
        card = by_thread.get(thread["id"])
        if card:
            cards[card["id"]] = card
        for repo, number in PR_REF.findall(thread.get("title") or ""):
            card = by_pr.get((repo, int(number)))
            if card:
                cards[card["id"]] = card
    return list(cards.values())


def card_finished(card):
    state = (card.get("pr") or {}).get("state")
    return card["columnId"] == "done" or state in ("merged", "closed")


def check_in_use(env, threads, procs):
    for thread in threads:
        activity = thread.get("activity") or {}
        if (
            thread["status"] != "idle"
            or thread.get("hasPendingInteraction")
            or thread.get("queuedWork", "none") != "none"
            or any(activity.values())
        ):
            raise Skip(f"thread {thread['id']} is {thread['status']} or has pending work")
    idle_days = (time.time() * 1000 - max(t["updatedAt"] for t in threads)) / 86_400_000
    if idle_days < IDLE_DAYS:
        raise Skip(None)
    path = env["path"]
    for pid, cmd, cwd in procs:
        if cwd == path or cwd.startswith(path + "/"):
            raise Skip(f"process {cmd} ({pid}) is running in it")


def check_nothing_lost(path, detached):
    if git(path, "status", "--porcelain", "--untracked-files=all").stdout.strip():
        raise Skip("it has uncommitted or untracked files")
    # The worktree's branch survives teardown, but a detached HEAD's commits
    # would be left unreachable.
    if detached and not git(path, "for-each-ref", "--contains", "HEAD").stdout.strip():
        raise Skip("its detached HEAD has commits no branch or tag contains")


def branch_merged(path, default_branch):
    """True when the branch has commits and each has landed on the default branch.

    Accepts the local or remote default branch because some repos land work by
    cherry-picking onto a local main that isn't pushed.
    """
    for base in (default_branch, f"origin/{default_branch}"):
        if git(path, "rev-parse", "--verify", "--quiet", base, check=False).returncode:
            continue
        fork = git(path, "merge-base", base, "HEAD", check=False).stdout.strip()
        if not fork:
            continue
        ahead = int(git(path, "rev-list", "--count", f"{fork}..HEAD").stdout)
        if ahead == 0:
            continue
        cherry = git(path, "cherry", base, "HEAD").stdout.splitlines()
        if not any(line.startswith("+") for line in cherry):
            return True
    return False


def has_commits(path, default_branch):
    for base in (default_branch, f"origin/{default_branch}"):
        fork = git(path, "merge-base", base, "HEAD", check=False).stdout.strip()
        if fork and int(git(path, "rev-list", "--count", f"{fork}..HEAD").stdout):
            return True
    return False


def finished_reason(env, threads, by_thread, by_pr):
    for card in linked_cards(threads, by_thread, by_pr):
        if card_finished(card):
            pr = card.get("pr")
            label = f"{pr['repo'].split('/')[-1]}#{pr['number']}" if pr else card["title"]
            return f"{label} is {pr['state'] if pr and pr.get('state') in ('merged', 'closed') else 'done'}"
    path, branch = env["path"], env.get("branchName")
    default = env.get("defaultBranch") or "main"
    if branch and branch_merged(path, default):
        return f"{branch} is merged into {default}"
    if INCLUDE_UNTOUCHED and not has_commits(path, default):
        return "it has no commits of its own"
    return None


def main():
    envs = [
        e
        for e in bb_json("environment", "list")
        if e.get("environmentProviderId") == "git-worktree"
        and e.get("status") == "ready"
        and (e.get("lifecycle") or {}).get("phase") == "active"
    ]
    threads_by_env = {}
    for thread in bb_json("thread", "list", "--include-hidden"):
        threads_by_env.setdefault(thread["environmentId"], []).append(thread)
    try:
        cards = bb_json("kanban", "list")
    except Exception:
        cards = []
    by_thread, by_pr = card_index(cards)
    procs = processes_by_cwd()

    cleaned, skipped, errors = [], [], []
    for env in envs:
        threads = threads_by_env.get(env["id"], [])
        if not threads:
            continue
        label = env.get("branchName") or env["path"]
        try:
            reason = finished_reason(env, threads, by_thread, by_pr)
            if not reason:
                continue
            check_in_use(env, threads, procs)
            detached = git(env["path"], "symbolic-ref", "-q", "HEAD", check=False).returncode != 0
            check_nothing_lost(env["path"], detached)
            if not DRY_RUN:
                run([BB, "environment", "archive-threads", env["id"]])
            cleaned.append(f"{env['id']} {label}: {reason}")
        except Skip as skip:
            if skip.args[0]:
                skipped.append(f"{env['id']} {label}: {skip.args[0]}")
        except Exception as error:
            errors.append(f"{env['id']} {label}: {error}")

    if cleaned:
        print("Would archive:" if DRY_RUN else "Archived the threads of:")
        print("\n".join(f"  {line}" for line in cleaned))
    if skipped:
        print("Kept:")
        print("\n".join(f"  {line}" for line in skipped))
    if errors:
        print("Errors:")
        print("\n".join(f"  {line}" for line in errors))


if __name__ == "__main__":
    main()
