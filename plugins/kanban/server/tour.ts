import type { Ticket } from "../shared/board";
import type { HunkExplanation, Narrative } from "../shared/tour";
import { parseNarrative } from "./agent-output";
import type { CardThreads } from "./card-threads";
import type { CodeReviewThreads } from "./code-review-threads";
import type { KanbanContext } from "./context";
import { rowToExplanation, rowToNarrative } from "./db/rows";
import { prShortName } from "./github";
import type { Changes } from "./diff/changes";
import type { Projects } from "./projects";
import { shortId, threadTitle } from "./util";

/** Agent-written reading aids for a diff: the tour of the whole change and explanations of single hunks. */
export function createTour(
  ctx: KanbanContext,
  { changes, threads, projects, codeReviewThreads }: { changes: Changes; threads: CardThreads; projects: Projects; codeReviewThreads: CodeReviewThreads },
) {
  const { bb, stmts, publish } = ctx;
  const { ticketDiff } = changes;
  const { freshWorktree } = threads;
  const { projectForTicket } = projects;
  const { codeReviewThreadVisibility } = codeReviewThreads;

  async function latestNarrative(subject: Ticket): Promise<{ narrative: Narrative | null; stale: boolean }> {
    const row = stmts.latestNarrative.get(subject.id);
    if (row === undefined) return { narrative: null, stale: false };
    const head = (await ticketDiff(subject, false)).headSha;
    return { narrative: rowToNarrative(row), stale: head !== null && row.head_sha !== null && head !== row.head_sha };
  }

  /** One agent reads the diff and writes the tour; the thread.idle handler parses its final message. */
  async function spawnNarrative(subject: Ticket): Promise<Narrative> {
    const running = stmts.latestNarrative.get(subject.id);
    if (running !== undefined && running.status === "running") return rowToNarrative(running);
    const diff = await ticketDiff(subject, false);
    if (diff.files.length === 0) throw new Error(diff.message ?? "There are no changes to describe.");
    const paths = diff.files.map((file) => `- ${file.path} (+${file.additions} −${file.deletions}${file.status === "modified" ? "" : `, ${file.status}`})`).join("\n");
    const deliverable = [
      "",
      "Your final message must end with a ```json kanban-narrative block shaped like:",
      "```json kanban-narrative",
      '{"version":1,"summary":"2–4 sentences: what the change does and why, as a reviewer needs to know it.","readingOrder":[{"path":"exact/path/from/the/list","role":"key|supporting|mechanical","note":"one sentence on what to look at here","lines":[42],"risk":3,"changes":[{"kind":"rename|move|signature|reorder|reformat|extract|inline|logic","label":"renamed loadUser to loadUsers and made it take a slice","oldLines":[170,180],"newLines":[170,178]}]}],"watchOut":["anything risky or easy to miss"]}',
      "```",
      "Rules: list every changed file exactly once using the paths above, in the order a reviewer should read them; `key` files carry the behaviour change, `supporting` files follow from them, `mechanical` files are renames, generated code, lockfiles or formatting. `lines` are new-side line numbers.",
      "`risk` is 1–5 for how closely a reviewer must read the file: 5 for behaviour changes in auth, money, concurrency, data migrations or error handling; 3 for ordinary logic; 1 for generated code, lockfiles, pure renames or formatting.",
      "`changes` names blocks of the file's diff that look like big red/green walls but are really one semantic edit, so the viewer can label them instead: a rename (say both names), a moved block, a signature change (say what changed), a reorder, a reformat, an extraction or inlining. Give old-side and new-side line ranges from `git diff`'s hunk headers; omit blocks that are plain new logic. Leave `changes` empty when nothing qualifies.",
      "Be concrete and brief; do not change any code, and do not post anything to GitHub.",
      `This tour belongs to kanban card ${subject.id}.`,
    ];
    let thread: { id: string };
    if (subject.pr !== null) {
      const projectId = await projectForTicket(subject, null);
      const { repo, number, url } = subject.pr;
      thread = await bb.sdk.threads.spawn({
        projectId,
        environment: await freshWorktree(projectId),
        prompt: [
          `Write a reviewer's tour of pull request ${repo}#${number}: "${subject.title}" (${url}).`,
          "",
          "Setup (this worktree is disposable). The `gh` and `git fetch` steps need your GitHub credentials, which the sandbox hides; running them with the sandbox disabled is expected and authorized here.",
          `1. \`BASE=$(gh pr view ${number} --repo ${repo} --json baseRefName --jq .baseRefName)\``,
          `2. \`git fetch origin "$BASE" "pull/${number}/head"\` and \`git checkout --detach FETCH_HEAD\``,
          `3. Read \`gh pr view ${number} --repo ${repo}\` for the description, then \`git diff origin/$BASE...HEAD\` and the files it touches:`,
          paths,
          ...deliverable,
        ].join("\n"),
        title: threadTitle(`Tour ${prShortName(subject.pr)}: ${subject.title}`),
        ...(subject.threadId === null ? {} : { parentThreadId: subject.threadId }),
        visibility: await codeReviewThreadVisibility(),
        pluginMetadata: { ticketId: subject.id, role: "narrative" },
      });
    } else {
      if (subject.threadId === null || subject.projectId === null) throw new Error("This card has no thread to read the changes from.");
      const cardThread = await bb.sdk.threads.get({ threadId: subject.threadId });
      if (cardThread.environmentId === null) throw new Error("The card's thread has no environment yet.");
      thread = await bb.sdk.threads.spawn({
        projectId: subject.projectId,
        environment: { type: "reuse", environmentId: cardThread.environmentId },
        prompt: [
          `Write a reviewer's tour of the changes on this branch${diff.baseRef === null ? "" : ` relative to ${diff.baseRef}`}: "${subject.title}".`,
          "",
          `Read ${diff.baseRef === null ? "`git diff` and `git status`" : `\`git diff ${diff.baseRef}...HEAD\` plus any uncommitted changes (\`git diff\`, \`git status\`)`} and the files touched:`,
          paths,
          ...deliverable,
        ].join("\n"),
        title: threadTitle(`Tour: ${subject.title}`),
        parentThreadId: subject.threadId,
        visibility: await codeReviewThreadVisibility(),
        pluginMetadata: { ticketId: subject.id, role: "narrative" },
      });
    }
    const id = shortId();
    stmts.insertNarrative.run({ id, ticket_id: subject.id, thread_id: thread.id, head_sha: diff.headSha, created_at: Date.now() });
    publish();
    return rowToNarrative(stmts.latestNarrative.get(subject.id)!);
  }

  /** A checkout that already has the subject's code: its latest review or tour thread, else the card thread, else nothing. */
  async function reusableEnvironment(subject: Ticket): Promise<string | null> {
    const candidates = [
      stmts.latestCompletedReview.get(subject.id)?.thread_id ?? null,
      stmts.latestNarrative.get(subject.id)?.thread_id ?? null,
      subject.threadId,
    ].filter((id): id is string => id !== null);
    for (const threadId of candidates) {
      try {
        const thread = await bb.sdk.threads.get({ threadId });
        if (thread.environmentId !== null && thread.archivedAt === null) return thread.environmentId;
      } catch {
        continue;
      }
    }
    return null;
  }

  /** One short agent thread explains a hunk; the thread.idle handler stores its final message as the explanation. */
  async function explainHunk(subject: Ticket, path: string, side: "old" | "new", startLine: number, endLine: number): Promise<HunkExplanation> {
    const diff = await ticketDiff(subject, false);
    const existing = stmts.explanationsForHead
      .all(subject.id, diff.headSha)
      .find((row) => row.path === path && row.side === side && row.start_line === startLine && row.end_line === endLine && row.status !== "failed");
    if (existing !== undefined) return rowToExplanation(existing);
    const where = `${path} lines ${startLine}–${endLine} (${side === "new" ? "the new version, as checked out" : "the OLD version: look at these lines in the base, e.g. `git show origin/$BASE:" + path + "`"})`;
    const ask = [
      `Explain the change at ${where} to a code reviewer: what it does, why it is there (read the surrounding function and use \`git grep\` to find the call sites that depend on it), and anything subtle. Keep it under 150 words of plain Markdown; no headings, no code changes, no GitHub posts.`,
      "Your final message must be only the explanation.",
      `This belongs to kanban card ${subject.id}.`,
    ];
    const environmentId = await reusableEnvironment(subject);
    const title = threadTitle(`Explain ${path.split("/").pop()}:${startLine} — ${subject.title}`);
    let thread: { id: string };
    if (environmentId !== null) {
      const projectId = subject.projectId ?? (subject.pr === null ? null : await projectForTicket(subject, null));
      if (projectId === null) throw new Error("This card has no project to run the explanation in.");
      thread = await bb.sdk.threads.spawn({
        projectId,
        environment: { type: "reuse", environmentId },
        prompt: [subject.pr === null ? "" : `This checkout has pull request ${subject.pr.repo}#${subject.pr.number} checked out. \`BASE=$(gh pr view ${subject.pr.number} --repo ${subject.pr.repo} --json baseRefName --jq .baseRefName)\` if you need the base.`, ...ask].filter((line) => line !== "").join("\n"),
        title,
        ...(subject.threadId === null ? {} : { parentThreadId: subject.threadId }),
        visibility: await codeReviewThreadVisibility(),
        pluginMetadata: { ticketId: subject.id, role: "explain" },
      });
    } else if (subject.pr !== null) {
      const projectId = await projectForTicket(subject, null);
      const { repo, number } = subject.pr;
      thread = await bb.sdk.threads.spawn({
        projectId,
        environment: await freshWorktree(projectId),
        prompt: [
          `Setup first (disposable worktree; GitHub steps may need the sandbox disabled, which is authorized): \`BASE=$(gh pr view ${number} --repo ${repo} --json baseRefName --jq .baseRefName)\`; \`git fetch origin "$BASE" "pull/${number}/head"\`; \`git checkout --detach FETCH_HEAD\`.`,
          ...ask,
        ].join("\n"),
        title,
        ...(subject.threadId === null ? {} : { parentThreadId: subject.threadId }),
        visibility: await codeReviewThreadVisibility(),
        pluginMetadata: { ticketId: subject.id, role: "explain" },
      });
    } else {
      throw new Error("No checkout to explain from; start the card's thread first.");
    }
    const id = shortId();
    stmts.insertExplanation.run({ id, ticket_id: subject.id, path, side, start_line: startLine, end_line: endLine, head_sha: diff.headSha, thread_id: thread.id, created_at: Date.now() });
    publish();
    return rowToExplanation(stmts.explanationsForHead.all(subject.id, diff.headSha).find((row) => row.id === id)!);
  }

  async function listExplanations(ticket: Ticket): Promise<{ explanations: HunkExplanation[] }> {
    const head = (await ticketDiff(ticket, false)).headSha;
    return { explanations: stmts.explanationsForHead.all(ticket.id, head).map(rowToExplanation) };
  }

  /** A tour or explanation thread went idle: store its final message. */
  function handleIdle(threadId: string, lastAssistantText: string | null): boolean {
    const explanationRow = stmts.explanationByThread.get(threadId);
    if (explanationRow !== undefined && explanationRow.status === "running") {
      const text = lastAssistantText?.trim() ?? "";
      if (text === "") stmts.failExplanation.run(null, Date.now(), explanationRow.id);
      else stmts.completeExplanation.run(text, Date.now(), explanationRow.id);
      publish();
      return true;
    }
    const narrativeRow = stmts.narrativeByThread.get(threadId);
    if (narrativeRow !== undefined && narrativeRow.status === "running") {
      if (parseNarrative(lastAssistantText) === null) stmts.failNarrative.run(lastAssistantText, Date.now(), narrativeRow.id);
      else stmts.completeNarrative.run(lastAssistantText, Date.now(), narrativeRow.id);
      publish();
      return true;
    }
    return false;
  }

  return { latestNarrative, spawnNarrative, explainHunk, listExplanations, handleIdle };
}

export type Tour = ReturnType<typeof createTour>;
