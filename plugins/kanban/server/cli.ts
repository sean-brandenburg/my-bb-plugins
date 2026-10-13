import { PluginCliError, cliCommand, defineCli } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { locationLabel } from "bb-diff-view/line-range";
import { dueDateSchema, tagSchema, type Column, type Ticket } from "../shared/board";
import { initialColumn } from "./board";
import type { KanbanContext } from "./context";
import { rowToComment, rowToDiffComment, rowToReview } from "./db/rows";
import { countSeverities } from "./reviews/findings";
import type { Services } from "./services";
import { normalizeTags, shortId } from "./util";

/** `bb kanban …`: the commands agents and users run against the board. */
export function registerCli(ctx: KanbanContext, services: Services): void {
  const { bb, stmts, sync, publish } = ctx;
  const { getTicket, hydrate, getColumns, getSources, createTicket, moveTicket, setParent, setTags, setDueDate } = services.board;
  const { spawnThreadForTicket, linkThread } = services.threads;
  const { projectForTicket, fallbackProject } = services.projects;
  const { spawnReviewForTicket, spawnApplyForReview, completeApply: completeReviewApply } = services.reviews;
  const { spawnApplyForComments, completeApply } = services.prComments;
  const { diffThreadRoot } = services.diffComments;
  const { startChildren } = services.subtasks;
  const { runSync } = services.sourceSync;

  function formatTicket(ticket: Ticket, columns: Column[]): string {
    const column = columns.find((candidate) => candidate.id === ticket.columnId)?.name ?? ticket.columnId;
    const pr =
      ticket.pr !== null
        ? `  ${ticket.pr.repo}#${ticket.pr.number} (${ticket.pr.state})`
        : ticket.jira !== null
          ? `  ${ticket.jira.key} (${ticket.jira.status})`
          : "";
    const tags = ticket.tags.length === 0 ? "" : `  ${ticket.tags.map((tag) => `#${tag}`).join(" ")}`;
    const due = ticket.dueDate === null ? "" : `  due ${ticket.dueDate}`;
    const thread = ticket.threadId === null ? "" : `  @thread:${ticket.threadId}`;
    const review = ticket.reviewThreadId === null ? "" : `  review:@thread:${ticket.reviewThreadId}`;
    const nesting = ticket.parentId !== null ? `  ↳ ${ticket.parentId}` : ticket.children.total > 0 ? `  (${ticket.children.done}/${ticket.children.total} subtasks)` : "";
    return `${ticket.id}  [${column}]  ${ticket.title}${tags}${due}${pr}${thread}${review}${nesting}`;
  }

  function ticketForContext(ticketOption: string | undefined, threadId: string | undefined): Ticket {
    if (ticketOption !== undefined) return getTicket(ticketOption);
    if (threadId !== undefined) {
      const row = stmts.byThread.get(threadId);
      if (row !== undefined) return hydrate(row);
      throw new PluginCliError("This thread has no kanban card.", {
        code: "no_ticket_for_thread",
        hint: 'Create one with `bb kanban add "<title>"` or pass --ticket <id>.',
      });
    }
    throw new PluginCliError("No ticket given.", {
      code: "ticket_required",
      hint: "Pass --ticket <id>; run `bb kanban list` to see ids.",
    });
  }

  function parseDueDate(raw: string): string {
    const parsed = dueDateSchema.safeParse(raw);
    if (!parsed.success) {
      throw new PluginCliError(`Invalid due date "${raw}": ${parsed.error.issues[0]?.message ?? "expected YYYY-MM-DD"}`, {
        code: "invalid_due_date",
        hint: "Pass a date as YYYY-MM-DD, e.g. 2026-10-31.",
      });
    }
    return parsed.data;
  }

  const ticketOption = {
    ticket: {
      type: "string",
      description: "Ticket id. Defaults to the card linked to the current thread.",
      aliases: ["id", "card"],
    },
  } as const;

  bb.cli.register(
    defineCli({
      name: "kanban",
      summary: "Kanban board where each card is a thread",
      commands: {
        list: cliCommand({
          summary: "List cards, grouped by column",
          options: {
            column: { type: "string", description: "Only this column id" },
            tag: { type: "string", repeatable: true, split: ",", description: "Only cards with this tag (repeatable)" },
            parent: { type: "string", description: "Only subtasks of this ticket id; `none` for top-level cards only" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run({ options }) {
            const columns = await getColumns();
            const wanted = normalizeTags(options.tag);
            const tickets = stmts.all
              .all()
              .map(hydrate)
              .filter((ticket) => options.parent === undefined || (options.parent === "none" ? ticket.parentId === null : ticket.parentId === options.parent))
              .filter((ticket) => options.column === undefined || ticket.columnId === options.column)
              .filter((ticket) => wanted.every((tag) => ticket.tags.includes(tag)));
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(tickets) };
            const lines: string[] = [];
            for (const column of columns) {
              if (options.column !== undefined && column.id !== options.column) continue;
              const inColumn = tickets.filter((ticket) => ticket.columnId === column.id);
              lines.push(`${column.name} (${column.id}) — ${inColumn.length}`);
              for (const ticket of inColumn) lines.push(`  ${formatTicket(ticket, columns)}`);
            }
            return { exitCode: 0, stdout: lines.join("\n") };
          },
        }),
        columns: cliCommand({
          summary: "List column ids and names",
          options: { json: { type: "boolean", description: "Emit JSON" } },
          async run({ options }) {
            const columns = await getColumns();
            return {
              exitCode: 0,
              stdout: options.json
                ? JSON.stringify(columns)
                : columns.map((column) => `${column.id}  ${column.name}`).join("\n"),
            };
          },
        }),
        show: cliCommand({
          summary: "Show one card",
          options: { ...ticketOption, json: { type: "boolean", description: "Emit JSON" } },
          async run({ options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(ticket) };
            const columns = await getColumns();
            const lines = [formatTicket(ticket, columns)];
            if (ticket.description !== "") lines.push("", ticket.description);
            if (ticket.pr !== null) lines.push("", ticket.pr.url);
            return { exitCode: 0, stdout: lines.join("\n") };
          },
        }),
        add: cliCommand({
          summary: "Add an ad hoc card; inside a thread, the card is linked to that thread",
          positionals: [{ name: "title", description: "Card title", required: true }],
          options: {
            description: { type: "string", description: "Longer description (markdown)", aliases: ["body"] },
            column: { type: "string", description: "Column id; defaults to backlog" },
            tag: { type: "string", repeatable: true, split: ",", description: "Tag to add (repeatable)" },
            due: { type: "string", description: "Due date, YYYY-MM-DD" },
            parent: { type: "string", description: "Create the card as a subtask of this ticket id (implies --no-link)" },
            project: { type: "string", description: "Project id for a new thread; implies --start-thread" },
            "start-thread": {
              type: "boolean",
              description: "Spawn a thread for the card (needs --project or a fallback project setting)",
            },
            "no-link": { type: "boolean", description: "Do not link the card to the current thread" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run({ positionals, options }, ctx) {
            const columns = await getColumns();
            const columnId =
              options.column !== undefined && columns.some((column) => column.id === options.column)
                ? options.column
                : initialColumn(columns, null);
            if (options.column !== undefined && columnId !== options.column) {
              throw new PluginCliError(`No column with id ${options.column}`, {
                code: "unknown_column",
                hint: "Run `bb kanban columns`.",
              });
            }
            const dueDate = options.due === undefined ? null : parseDueDate(options.due);
            const parentRow = options.parent === undefined ? undefined : stmts.byId.get(options.parent);
            if (options.parent !== undefined && parentRow === undefined) {
              throw new PluginCliError(`No ticket with id ${options.parent}`, { code: "unknown_parent", hint: "Run `bb kanban list`." });
            }
            let ticket = createTicket({
              title: positionals.title,
              description: options.description ?? "",
              columnId,
              kind: "adhoc",
              tags: options.tag,
              threadId: null,
              projectId: options.project ?? parentRow?.project_id ?? null,
              pr: null,
              parentId: options.parent ?? null,
              dueDate,
            });
            publish();
            if (ctx.threadId !== undefined && options.parent === undefined && !options["no-link"] && !options["start-thread"] && options.project === undefined) {
              ticket = await linkThread(ticket.id, ctx.threadId);
            } else if (options.project !== undefined || options["start-thread"]) {
              const projectId = options.project ?? (await fallbackProject(null));
              if (projectId === null) {
                throw new PluginCliError("No project to start the thread in.", {
                  code: "project_required",
                  hint: "Pass --project <id> or set the fallback project in the plugin settings.",
                });
              }
              ticket = await spawnThreadForTicket(ticket.id, projectId);
            }
            return {
              exitCode: 0,
              stdout: options.json ? JSON.stringify(ticket) : `Added ${formatTicket(ticket, columns)}`,
            };
          },
        }),
        move: cliCommand({
          summary: "Move a card to a column (defaults to the current thread's card)",
          positionals: [{ name: "column", description: "Target column id", required: true }],
          options: { ...ticketOption, json: { type: "boolean", description: "Emit JSON" } },
          async run({ positionals, options }, ctx) {
            const columns = await getColumns();
            const target = columns.find(
              (column) =>
                column.id === positionals.column ||
                column.name.toLowerCase() === positionals.column.toLowerCase(),
            );
            if (target === undefined) {
              throw new PluginCliError(`No column "${positionals.column}"`, {
                code: "unknown_column",
                hint: `Columns: ${columns.map((column) => column.id).join(", ")}`,
              });
            }
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const moved = moveTicket(ticket.id, target.id, null);
            return {
              exitCode: 0,
              stdout: options.json ? JSON.stringify(moved) : formatTicket(moved, columns),
            };
          },
        }),
        review: cliCommand({
          summary: "Start a code-review thread for a card's pull request (defaults to the current thread's card)",
          options: {
            ...ticketOption,
            project: { type: "string", description: "Project id to run the review in; defaults to the card's project" },
            full: { type: "boolean", description: "Review the whole PR even if an earlier review exists (default: the commits since the last review, re-checking its open findings)" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run({ options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            if (ticket.pr === null) {
              throw new PluginCliError(`Ticket ${ticket.id} has no linked pull request.`, { code: "no_pull_request" });
            }
            const reviewed = await spawnReviewForTicket(
              ticket.id,
              await projectForTicket(ticket, options.project ?? null),
              options.full ? "full" : "incremental",
            );
            return {
              exitCode: 0,
              stdout: options.json ? JSON.stringify(reviewed) : `Review started in @thread:${reviewed.reviewThreadId}`,
            };
          },
        }),
        subtasks: cliCommand({
          summary: "List a card's subtasks (defaults to the current thread's card)",
          options: { ...ticketOption, json: { type: "boolean", description: "Emit JSON" } },
          async run({ options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const columns = await getColumns();
            const children = stmts.childrenOf.all(ticket.id).map(hydrate);
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(children) };
            if (children.length === 0) return { exitCode: 0, stdout: `${ticket.id} has no subtasks.` };
            return { exitCode: 0, stdout: children.map((child) => formatTicket(child, columns)).join("\n") };
          },
        }),
        "set-parent": cliCommand({
          summary: "Nest a card under another card, or `none` to make it top-level",
          positionals: [
            { name: "ticket", description: "Ticket id to move", required: true },
            { name: "parent", description: "Parent ticket id, or `none`", required: true },
          ],
          options: { json: { type: "boolean", description: "Emit JSON" } },
          async run({ positionals, options }) {
            const updated = setParent(positionals.ticket, positionals.parent === "none" ? null : positionals.parent);
            return { exitCode: 0, stdout: options.json ? JSON.stringify(updated) : formatTicket(updated, await getColumns()) };
          },
        }),
        "start-subtasks": cliCommand({
          summary: "Start agents on a card's open subtasks: one thread each, or one thread in order",
          options: {
            ...ticketOption,
            sequential: { type: "boolean", description: "One thread that works through the subtasks in order (default: one thread per subtask)" },
            project: { type: "string", description: "Project id for new threads; defaults to the card's project" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run({ options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const result = await startChildren(ticket.id, options.sequential ? "sequential" : "parallel", options.project ?? null);
            return {
              exitCode: 0,
              stdout: options.json ? JSON.stringify(result) : `Started ${result.started} subtask thread(s)${result.skipped > 0 ? `, skipped ${result.skipped}` : ""}`,
            };
          },
        }),
        "review-record": cliCommand({
          summary: "Record the commit a running review covers (run by the review thread itself)",
          options: {
            commit: { type: "string", required: true, description: "Full sha of the reviewed PR head" },
            base: { type: "string", description: "PR base branch name" },
            head: { type: "string", description: "PR head branch name" },
            review: { type: "string", description: "Review id; defaults to the review owned by the current thread" },
          },
          async run({ options }, ctx) {
            const row =
              options.review !== undefined
                ? stmts.reviewById.get(options.review)
                : ctx.threadId === undefined
                  ? undefined
                  : stmts.reviewByThread.get(ctx.threadId);
            if (row === undefined) {
              throw new PluginCliError("No review found for this thread.", {
                code: "no_review_for_thread",
                hint: "Run this from the review thread, or pass --review <id>.",
              });
            }
            if (!/^[0-9a-f]{7,40}$/iu.test(options.commit)) {
              throw new PluginCliError(`"${options.commit}" is not a commit sha.`, { code: "invalid_commit" });
            }
            stmts.recordReviewCommit.run(options.commit, options.base ?? null, options.head ?? null, row.id);
            publish();
            return { exitCode: 0, stdout: `Review ${row.id} covers ${options.commit}` };
          },
        }),
        "review-show": cliCommand({
          summary: "Print the latest persisted review of a card",
          options: { ...ticketOption, json: { type: "boolean", description: "Emit JSON" } },
          async run({ options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const row = stmts.latestCompletedReview.get(ticket.id);
            if (row === undefined) {
              throw new PluginCliError(`Ticket ${ticket.id} has no completed review.`, {
                code: "no_review",
                hint: "Start one with `bb kanban review`.",
              });
            }
            const review = rowToReview(row);
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(review) };
            const counts = countSeverities(review.report);
            return {
              exitCode: 0,
              stdout: [
                `Review ${review.id} of ${ticket.id} at commit ${review.commitSha ?? "unknown"} (${new Date(review.completedAt ?? review.createdAt).toISOString()})${counts === null ? "" : `  critical ${counts.critical} · important ${counts.important} · minor ${counts.minor}`}`,
                "",
                review.body ?? "(empty)",
              ].join("\n"),
            };
          },
        }),
        "apply-review": cliCommand({
          summary: "Start a thread that applies the latest persisted review to the PR branch and pushes it",
          options: {
            ...ticketOption,
            review: { type: "string", description: "Review id; defaults to the latest completed review" },
            "no-push": { type: "boolean", description: "Commit in the worktree but do not push to the PR branch" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run({ options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const applied = await spawnApplyForReview(ticket.id, options.review ?? null, !options["no-push"]);
            return {
              exitCode: 0,
              stdout: options.json
                ? JSON.stringify(applied)
                : `Apply started in @thread:${applied.latestReview?.apply?.threadId ?? "unknown"}`,
            };
          },
        }),
        comments: cliCommand({
          summary: "List the synced GitHub comments on a PR card (defaults to the current thread's card)",
          options: { ...ticketOption, json: { type: "boolean", description: "Emit JSON" } },
          async run({ options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const comments = stmts.commentsForTicket.all(ticket.id).map(rowToComment);
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(comments) };
            if (comments.length === 0) return { exitCode: 0, stdout: "No comments synced for this card." };
            return {
              exitCode: 0,
              stdout: comments
                .map(
                  (comment) =>
                    `${comment.selected ? "[x]" : "[ ]"} ${comment.id}  ${comment.author}${comment.path === null ? "" : `  ${comment.path}${comment.line === null ? "" : `:${comment.line}`}`}${comment.reviewState === null ? "" : `  ${comment.reviewState}`}${comment.addressedAt === null ? "" : "  (addressed)"}\n    ${comment.body.trim().split("\n")[0]?.slice(0, 160) ?? ""}`,
                )
                .join("\n"),
            };
          },
        }),
        "apply-comments": cliCommand({
          summary: "Start a thread that applies the selected PR comments with the apply-pr-comments skill and pushes",
          options: {
            ...ticketOption,
            "no-push": { type: "boolean", description: "Commit in the worktree but do not push to the PR branch" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run({ options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const result = await spawnApplyForComments(ticket.id, !options["no-push"]);
            return {
              exitCode: 0,
              stdout: options.json ? JSON.stringify(result) : `Apply started in @thread:${result.apply.threadId}`,
            };
          },
        }),
        "comments-applied": cliCommand({
          summary: "Mark the selected comments addressed after pushing (run by the apply thread itself)",
          options: {
            commit: { type: "string", description: "Sha of the resulting commit" },
            pushed: { type: "boolean", description: "The commit was pushed to the PR branch" },
            apply: { type: "string", description: "Apply run id; defaults to the run owned by the current thread" },
          },
          async run({ options }, ctx) {
            const row =
              options.apply !== undefined
                ? stmts.commentApplyById.get(options.apply)
                : ctx.threadId === undefined
                  ? undefined
                  : stmts.commentApplyByThread.get(ctx.threadId);
            if (row === undefined) {
              throw new PluginCliError("No comment apply run found for this thread.", {
                code: "no_apply_for_thread",
                hint: "Run this from the apply thread, or pass --apply <id>.",
              });
            }
            const marked = completeApply(row, options.commit ?? null, options.pushed);
            return { exitCode: 0, stdout: `Marked ${marked} comment(s) addressed${options.commit === undefined ? "" : ` at ${options.commit}`}` };
          },
        }),
        "comment-reply": cliCommand({
          summary: "Reply in an inline comment's thread on the board (run by apply threads; never posted to GitHub)",
          positionals: [
            { name: "comment", description: "Comment id: `local:<id>` or `review-comment:<n>`", required: true },
            { name: "body", description: "Reply text", required: true, variadic: true },
          ],
          options: { json: { type: "boolean", description: "Emit JSON" } },
          async run({ positionals, options }, ctx) {
            const id = positionals.comment.replace(/^local:/u, "");
            const ticketId = id.startsWith("review-comment:")
              ? (stmts.commentById.get(id)?.ticket_id ?? stmts.diffCommentByAnyGithubId.get(id)?.ticket_id)
              : stmts.diffCommentById.get(id)?.ticket_id;
            if (ticketId === undefined) {
              throw new PluginCliError(`No inline comment ${positionals.comment}`, {
                code: "unknown_comment",
                hint: "Use an id from the apply prompt: `local:<id>` for board comments or `review-comment:<n>` for GitHub inline comments.",
              });
            }
            const body = positionals.body.join(" ").trim();
            if (body === "") throw new PluginCliError("The reply is empty", { code: "empty_reply" });
            const root = diffThreadRoot(ticketId, id);
            const now = Date.now();
            const replyId = shortId();
            stmts.insertDiffComment.run({
              id: replyId, ticket_id: ticketId, path: root.path, line: root.line, side: root.side, start_line: root.startLine, start_side: root.startSide, body: body.slice(0, 10_000),
              target: "local", in_reply_to: root.id, author: "agent", author_thread_id: ctx.threadId ?? null, created_at: now, updated_at: now,
            });
            publish();
            const reply = rowToDiffComment(stmts.diffCommentById.get(replyId)!);
            return { exitCode: 0, stdout: options.json ? JSON.stringify(reply) : `Replied in the thread on ${locationLabel(root.path, root)}` };
          },
        }),
        "review-applied": cliCommand({
          summary: "Mark the review's fixes as committed (and pushed) — run by the apply thread itself",
          options: {
            commit: { type: "string", description: "Sha of the resulting commit" },
            pushed: { type: "boolean", description: "The commit was pushed to the PR branch" },
            skipped: { type: "string", description: "Comma-separated ids of handed findings that could not be applied; they stay open" },
            review: { type: "string", description: "Review id; defaults to the review being applied by the current thread" },
          },
          async run({ options }, ctx) {
            const row =
              options.review !== undefined
                ? stmts.reviewById.get(options.review)
                : ctx.threadId === undefined
                  ? undefined
                  : stmts.reviewByApplyThread.get(ctx.threadId);
            if (row === undefined) {
              throw new PluginCliError("No apply run found for this thread.", {
                code: "no_apply_for_thread",
                hint: "Run this from the apply thread, or pass --review <id>.",
              });
            }
            const skipped = (options.skipped ?? "").split(",").map((id) => id.trim()).filter((id) => id !== "");
            const fixed = completeReviewApply(row, options.commit ?? null, options.pushed, skipped);
            return {
              exitCode: 0,
              stdout: `Review ${row.id} applied${options.commit === undefined ? "" : ` at ${options.commit}`}${options.pushed ? " (pushed)" : ""}; ${fixed} finding(s) marked applied${skipped.length === 0 ? "" : `, ${skipped.length} left open`}`,
            };
          },
        }),
        tag: cliCommand({
          summary: "Add tags to a card (defaults to the current thread's card)",
          positionals: [{ name: "tags", description: "Tags to add", required: true, variadic: true }],
          options: { ...ticketOption, json: { type: "boolean", description: "Emit JSON" } },
          async run({ positionals, options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const parsed = z.array(tagSchema).safeParse(positionals.tags.map((tag) => tag.toLowerCase()));
            if (!parsed.success) {
              throw new PluginCliError(parsed.error.issues[0]?.message ?? "Invalid tag", { code: "invalid_tag" });
            }
            const updated = setTags(ticket.id, [...ticket.tags, ...parsed.data]);
            return { exitCode: 0, stdout: options.json ? JSON.stringify(updated) : formatTicket(updated, await getColumns()) };
          },
        }),
        untag: cliCommand({
          summary: "Remove tags from a card (defaults to the current thread's card)",
          positionals: [{ name: "tags", description: "Tags to remove", required: true, variadic: true }],
          options: { ...ticketOption, json: { type: "boolean", description: "Emit JSON" } },
          async run({ positionals, options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const remove = new Set(normalizeTags(positionals.tags));
            const updated = setTags(ticket.id, ticket.tags.filter((tag) => !remove.has(tag)));
            return { exitCode: 0, stdout: options.json ? JSON.stringify(updated) : formatTicket(updated, await getColumns()) };
          },
        }),
        due: cliCommand({
          summary: "Set or clear a card's due date (defaults to the current thread's card)",
          positionals: [{ name: "date", description: "Due date as YYYY-MM-DD, or `none` to clear", required: true }],
          options: { ...ticketOption, json: { type: "boolean", description: "Emit JSON" } },
          async run({ positionals, options }, ctx) {
            const ticket = ticketForContext(options.ticket, ctx.threadId);
            const dueDate = positionals.date.toLowerCase() === "none" ? null : parseDueDate(positionals.date);
            const updated = setDueDate(ticket.id, dueDate);
            return { exitCode: 0, stdout: options.json ? JSON.stringify(updated) : formatTicket(updated, await getColumns()) };
          },
        }),
        sources: cliCommand({
          summary: "List ticket sources and the tags they apply",
          options: { json: { type: "boolean", description: "Emit JSON" } },
          async run({ options }) {
            const sources = await getSources();
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(sources) };
            return {
              exitCode: 0,
              stdout: sources
                .map(
                  (source) =>
                    `${source.id}${source.enabled ? "" : " (disabled)"}  ${source.name}  [${source.kind}] ${source.kind === "github-search" ? source.query : source.jql}  → ${source.tags.map((tag) => `#${tag}`).join(" ")}${source.doneWhenGone ? "  (done when gone)" : ""}`,
                )
                .join("\n"),
            };
          },
        }),
        link: cliCommand({
          summary: "Link an existing card to a thread (defaults to the current thread)",
          positionals: [{ name: "ticket", description: "Ticket id", required: true }],
          options: {
            thread: { type: "string", description: "Thread id; defaults to the current thread" },
            json: { type: "boolean", description: "Emit JSON" },
          },
          async run({ positionals, options }, ctx) {
            const threadId = options.thread ?? ctx.threadId;
            if (threadId === undefined) {
              throw new PluginCliError("No thread to link.", {
                code: "thread_required",
                hint: "Pass --thread <id> or run this inside a thread.",
              });
            }
            const ticket = await linkThread(positionals.ticket, threadId);
            const columns = await getColumns();
            return {
              exitCode: 0,
              stdout: options.json ? JSON.stringify(ticket) : formatTicket(ticket, columns),
            };
          },
        }),
        remove: cliCommand({
          summary: "Delete a card (the thread is kept)",
          positionals: [{ name: "ticket", description: "Ticket id", required: true }],
          async run({ positionals }) {
            getTicket(positionals.ticket);
            stmts.remove.run(positionals.ticket);
            publish();
            return { exitCode: 0, stdout: `Removed ${positionals.ticket}` };
          },
        }),
        sync: cliCommand({
          summary: "Pull open GitHub PRs into the board now",
          options: { json: { type: "boolean", description: "Emit JSON" } },
          async run({ options }) {
            await runSync();
            if (options.json) return { exitCode: 0, stdout: JSON.stringify(sync) };
            if (sync.lastError !== null) return { exitCode: 1, stderr: sync.lastError };
            return {
              exitCode: 0,
              stdout: `Synced as ${sync.login ?? "unknown"} (${sync.tokenSource}) at ${new Date(sync.lastSyncAt ?? 0).toISOString()}`,
            };
          },
        }),
      },
    }),
  );
}
