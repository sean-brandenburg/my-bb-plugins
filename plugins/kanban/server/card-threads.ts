import type { Column, Ticket } from "../shared/board";
import type { BoardStore } from "./board";
import type { KanbanContext } from "./context";
import { prShortName } from "./github";
import { errorMessage, threadTitle } from "./util";

/** The thread behind each card: starting it, prompting it, and linking existing threads. */
export function createCardThreads(ctx: KanbanContext, { board }: { board: BoardStore }) {
  const { bb, stmts, publish } = ctx;
  const { getTicket, getColumns } = board;

  function threadPrompt(ticket: Ticket, columns: Column[]): string {
    const columnList = columns.map((column) => `\`${column.id}\` (${column.name})`).join(", ");
    const footer = [
      "",
      `This thread is kanban ticket ${ticket.id}. Columns: ${columnList}.`,
      "Move the card as the work progresses with `bb kanban move <column-id>` (it finds this thread's card automatically).",
      ...(ticket.integratesInto === null ? [] : [INTEGRATION_MEMBER_NOTE]),
      "Do not post comments or reviews on GitHub unless the user explicitly asks.",
    ].join("\n");
    if (ticket.jira !== null) {
      const body = ticket.description.trim();
      return [
        `This thread tracks Jira issue ${ticket.jira.key}: "${ticket.title}" (${ticket.jira.url}). Type: ${ticket.jira.issueType || "unknown"}; status: ${ticket.jira.status || "unknown"}.`,
        "",
        body === "" ? "(The issue has no description.)" : body,
        "",
        "Read the relevant code to understand what the issue asks for, propose a short plan, and wait for the user before changing anything. Do not update the Jira issue.",
        footer,
      ].join("\n");
    }
    if (ticket.pr === null) {
      const body = ticket.description.trim();
      const parent = ticket.parentId === null ? null : stmts.byId.get(ticket.parentId);
      const context = parent === undefined || parent === null ? "" : `\n\nThis is a subtask of "${parent.title}" (ticket ${parent.id}). Keep the change scoped to this subtask.`;
      return `${ticket.title}${body === "" ? "" : `\n\n${body}`}${context}\n${footer}`;
    }
    const { repo, number, role } = ticket.pr;
    if (role === "other") {
      return [
        `You were asked to look at pull request ${repo}#${number}: "${ticket.title}" (${ticket.pr.url}).`,
        "",
        `1. Run \`gh pr view ${number} --repo ${repo}\` and \`gh pr diff ${number} --repo ${repo}\` to read the description and the change.`,
        "2. Review it for correctness, edge cases, and anything risky. Be concise and concrete; cite file paths.",
        "3. Summarize your findings here and stop. The user decides what to post.",
        footer,
      ].join("\n");
    }
    return [
      `This thread tracks your pull request ${repo}#${number}: "${ticket.title}" (${ticket.pr.url}).`,
      "",
      `1. Run \`gh pr view ${number} --repo ${repo} --json state,isDraft,reviewDecision,mergeable,statusCheckRollup,reviews,comments\` and \`gh pr checks ${number} --repo ${repo}\`.`,
      "2. Give a short status: CI, review decision, unresolved review comments, merge conflicts.",
      "3. If something needs action (failing checks, requested changes), say what and wait for instructions before changing code.",
      footer,
    ].join("\n");
  }

  /** A card whose work merges into an integration card gets a worktree of its own, so it has a branch to merge. */
  async function spawnThreadForTicket(ticketId: string, projectId: string): Promise<Ticket> {
    const ticket = getTicket(ticketId);
    if (ticket.threadId !== null) return ticket;
    const environment: ThreadEnvironment | { type: "project-default" } = ticket.integratesInto === null ? { type: "project-default" } : await freshWorktree(projectId);
    const columns = await getColumns();
    const title =
      ticket.pr !== null
        ? `${prShortName(ticket.pr)}: ${ticket.title}`
        : ticket.jira !== null
          ? `${ticket.jira.key}: ${ticket.title}`
          : ticket.title;
    const parentThreadId = ticket.parentId === null ? null : (stmts.byId.get(ticket.parentId)?.thread_id ?? null);
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment,
      prompt: threadPrompt(ticket, columns),
      title: threadTitle(title),
      ...(parentThreadId === null ? {} : { parentThreadId }),
      pluginMetadata: { ticketId: ticket.id },
    });
    stmts.setThread.run(thread.id, projectId, Date.now(), ticket.id);
    publish();
    return getTicket(ticket.id);
  }

  /** Start a thread for a card, or send a prompt into its existing thread. */
  async function promptTicketThread(ticket: Ticket, projectId: string, prompt: string, title: string, role: string): Promise<Ticket> {
    if (ticket.threadId !== null) {
      await bb.sdk.threads.send({ threadId: ticket.threadId, mode: "auto", input: [{ type: "text", text: prompt, mentions: [] }] });
      return ticket;
    }
    const thread = await bb.sdk.threads.spawn({
      projectId,
      environment: { type: "project-default" },
      prompt,
      title: threadTitle(title),
      pluginMetadata: { ticketId: ticket.id, role },
    });
    stmts.setThread.run(thread.id, projectId, Date.now(), ticket.id);
    publish();
    return getTicket(ticket.id);
  }

  async function linkThread(ticketId: string, threadId: string): Promise<Ticket> {
    const ticket = getTicket(ticketId);
    const thread = await bb.sdk.threads.get({ threadId });
    stmts.setThread.run(thread.id, thread.projectId, Date.now(), ticket.id);
    try {
      await bb.sdk.threads.updatePluginMetadata({
        threadId,
        pluginId: bb.pluginId,
        set: { ticketId: ticket.id },
      });
    } catch (error) {
      bb.log.warn(`could not tag thread ${threadId} with ticket ${ticket.id}: ${String(error)}`);
    }
    publish();
    return getTicket(ticket.id);
  }

  /** The machine the project's checkout lives on; a worktree is created there. */
  async function projectHostId(projectId: string): Promise<string> {
    const projects = await bb.sdk.projects.list({ includePersonal: true });
    const project = projects.find((candidate) => candidate.id === projectId);
    if (project === undefined) throw new Error(`No project with id ${projectId}`);
    const source = project.sources.find((candidate) => candidate.isDefault) ?? project.sources[0];
    if (source === undefined) throw new Error(`Project ${project.name} has no checkout to create a worktree in`);
    return source.hostId;
  }

  /** A new managed worktree off the default branch, on the machine that holds the project's checkout. */
  async function freshWorktree(projectId: string) {
    return {
      type: "host" as const,
      hostId: await projectHostId(projectId),
      workspace: { type: "managed-worktree" as const, baseBranch: { kind: "default" as const } },
    };
  }

  /**
   * Where a card's committed work stands: its thread's branch head and how far it is past the base branch, read from
   * the thread's environment. A fresh worktree of the project only sees commits made in that repository, so an
   * environment on another machine is unavailable.
   */
  async function cardHead(ticket: Ticket): Promise<CardHead> {
    if (ticket.threadId === null) return { kind: "unavailable", reason: "Start the card's thread first; a review covers the commits it makes" };
    let thread;
    try {
      thread = await bb.sdk.threads.get({ threadId: ticket.threadId });
    } catch (error) {
      return { kind: "unavailable", reason: `The card's thread can't be read: ${errorMessage(error)}` };
    }
    if (thread.environmentId === null) return { kind: "unavailable", reason: "The card's thread has no environment yet" };
    let environment;
    try {
      environment = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    } catch (error) {
      return { kind: "unavailable", reason: `The card's environment can't be read: ${errorMessage(error)}` };
    }
    const base = environment.mergeBaseBranch ?? environment.defaultBranch;
    if (base === null) return { kind: "unavailable", reason: "The card's environment has no default branch to review its commits against" };
    if (environment.hostId !== (await projectHostId(thread.projectId))) {
      return { kind: "unavailable", reason: "The card's thread runs on another machine than the project's checkout, so a review worktree can't see its commits" };
    }
    const status = await bb.sdk.environments.status({ environmentId: environment.id, mergeBaseBranch: base });
    if (status.outcome === "not_applicable") return { kind: "unavailable", reason: status.message };
    if (status.outcome === "unavailable") return { kind: "unavailable", reason: status.failure.message };
    const { checkout, mergeBase } = status.workspace;
    const head = checkout.kind === "branch" || checkout.kind === "detached" ? checkout.headSha : null;
    if (head === null) return { kind: "unavailable", reason: "The card's thread has no commits yet" };
    const common = { head, base, branch: checkout.kind === "branch" ? checkout.branchName : null, projectId: thread.projectId, environmentId: environment.id, dirty: status.workspace.workingTree?.hasUncommittedChanges === true };
    if (mergeBase === null || mergeBase.aheadCount === 0) return { kind: "nothing", ...common };
    return { kind: "ahead", ...common, ahead: mergeBase.aheadCount };
  }

  return { spawnThreadForTicket, promptTicketThread, linkThread, projectHostId, freshWorktree, cardHead };
}

/** Told to a card whose work merges into a brain dump's integration card once every card of the dump is done. */
export const INTEGRATION_MEMBER_NOTE =
  "This card is one piece of a larger feature: commit your work on this thread's own branch (do not push it or merge it anywhere), and finish the card only once that work is committed; once every piece is done the board merges all of their branches into one worktree to test the feature end to end.";

interface CardCheckout {
  head: string;
  /** The branch the work is measured against: the environment's merge-base branch, else the default branch. */
  base: string;
  branch: string | null;
  projectId: string;
  environmentId: string;
  /** Uncommitted changes in the thread's worktree, which no merge would carry. */
  dirty: boolean;
}

/** A card thread's committed work, or why it can't be read. */
export type CardHead = { kind: "unavailable"; reason: string } | ({ kind: "nothing" } & CardCheckout) | ({ kind: "ahead"; ahead: number } & CardCheckout);

export type CardThreads = ReturnType<typeof createCardThreads>;

/** Where a spawned thread runs: a fresh worktree, or an existing environment that already has the code checked out. */
export type ThreadEnvironment = Awaited<ReturnType<CardThreads["freshWorktree"]>> | { type: "reuse"; environmentId: string };
