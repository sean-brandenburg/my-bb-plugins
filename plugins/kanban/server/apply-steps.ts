/** How an apply thread finishes: commit, then push and record it, or stop at a local commit for the user to push. */
export function finishSteps(push: boolean, headRef: string, recordCommand: string, subject: string): string[] {
  return push
    ? [
        "When the skill reports done and verification passed:",
        `1. \`git add -A && git commit -m "${subject}"\` (use a more specific message if the changes are narrow). Do not amend or rewrite existing commits.`,
        `2. \`git push origin HEAD:refs/heads/${headRef}\``,
        `3. \`${recordCommand} --commit "$(git rev-parse HEAD)" --pushed\` so the board records the push.`,
      ]
    : [
        "When the skill reports done and verification passed:",
        `1. \`git add -A && git commit -m "${subject}"\` (use a more specific message if the changes are narrow). Do not amend or rewrite existing commits.`,
        "2. Do NOT push. The user chose to review the commit first: report the worktree path, the commit sha, and the exact push command (`git push origin HEAD:refs/heads/<branch>`) so they can push or ask you to.",
        `3. \`${recordCommand} --commit "$(git rev-parse HEAD)"\` so the board records the local commit.`,
      ];
}
