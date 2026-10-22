import type { Ticket } from "../shared/board";
import { COLUMN } from "../shared/columns";
import type { Integration, IntegrationMember, ProposedTicket } from "../shared/dump";
import { parseLoopState } from "../shared/loop";
import type { BoardStore } from "./board";
import type { CardThreads, ThreadEnvironment } from "./card-threads";
import type { KanbanContext } from "./context";
import { rowToIntegration, type DumpRow, type IntegrationRow } from "./db/rows";
import type { ProjectSettingsStore } from "./project-settings";
import { errorMessage, shortId, threadTitle } from "./util";

/** Loop phases at which a monitored card's work is finished as far as its own thread goes; landing is the user's call. */
const SETTLED_PHASES = new Set(["needs-you", "accepted", "landed"]);

/** A ticket's place in the merge order: after everything it depends on, else where the proposal listed it. */
export function mergeOrder(proposed: readonly ProposedTicket[]): string[] {
  const ids = new Set(proposed.map((ticket) => ticket.id));
  const placed: string[] = [];
  const visiting = new Set<string>();
  const visit = (id: string) => {
    if (placed.includes(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const dependency of proposed.find((ticket) => ticket.id === id)?.dependsOn ?? []) if (ids.has(dependency)) visit(dependency);
    visiting.delete(id);
    placed.push(id);
  };
  for (const ticket of proposed) visit(ticket.id);
  return placed;
}

/**
 * A brain dump's integration: once every ticket the dump created is done, their branches are merged into one fresh
 * worktree by the integration card's thread, which runs the project's checks there and then tests the feature end to
 * end with the user, before anything lands.
 */
export function createIntegration(ctx: KanbanContext, { board, threads, projectSettings }: { board: BoardStore; threads: CardThreads; projectSettings: ProjectSettingsStore }) {
  const { bb, stmts, publish } = ctx;
  const { getTicket, createTicket } = board;
  const { freshWorktree, cardHead } = threads;

  function integrationOf(row: IntegrationRow): Integration {
    return rowToIntegration(row, stmts.integrationMembers.all(row.id));
  }

  /** An integration whose card was deleted is out of sight until the card is restored; its rows stay for that. */
  function live(row: IntegrationRow | undefined): IntegrationRow | undefined {
    return row !== undefined && stmts.byId.get(row.ticket_id) !== undefined ? row : undefined;
  }

  function integrationForDump(dumpId: string): Integration | null {
    const row = live(stmts.integrationByDump.get(dumpId));
    return row === undefined ? null : integrationOf(row);
  }

  function integrationForTicket(ticketId: string): Integration | null {
    const row = stmts.integrationByTicket.get(ticketId);
    return row === undefined ? null : integrationOf(row);
  }

  /** The integration card a member card's work merges into, or null. */
  function integratesInto(ticketId: string): string | null {
    const member = stmts.integrationMemberByTicket.get(ticketId);
    if (member === undefined) return null;
    return live(stmts.integrationById.get(member.integration_id))?.ticket_id ?? null;
  }

  /** The integration card and record for a finalized dump; `created` maps proposal ids to the cards made from them. */
  function create(dump: DumpRow, proposed: readonly ProposedTicket[], created: ReadonlyMap<string, Ticket>, columnId: string): Ticket {
    const summary = dump.text.trim().split("\n")[0]!.slice(0, 80);
    const members = mergeOrder(proposed).filter((id) => created.has(id));
    const lines = members.map((id) => {
      const ticket = created.get(id)!;
      return `- ${id} "${ticket.title}" (${ticket.id})`;
    });
    const card = createTicket({
      title: `Integrate: ${summary}`,
      description: [
        "Merges the work of these cards into one worktree once they are all done, so the feature can be tested end to end before it lands:",
        "",
        ...lines,
      ].join("\n"),
      columnId,
      kind: "adhoc",
      tags: ["integration"],
      threadId: null,
      projectId: dump.project_id,
      pr: null,
      monitored: false,
    });
    const now = Date.now();
    const id = shortId();
    stmts.insertIntegration.run({ id, dump_id: dump.id, ticket_id: card.id, project_id: dump.project_id, created_at: now });
    members.forEach((proposalId, position) => {
      stmts.insertIntegrationMember.run({ integration_id: id, ticket_id: created.get(proposalId)!.id, proposal_id: proposalId, position, updated_at: now });
    });
    publish();
    return getTicket(card.id);
  }

  /** A member card's thread is finished with it: the card is in Done, or its review loop has stopped for the user. */
  function settled(ticketId: string): boolean {
    const row = stmts.byId.get(ticketId);
    if (row === undefined) return true;
    if (row.column_id === (board.doneColumnId() ?? COLUMN.done)) return true;
    const loop = parseLoopState(row.loop_state);
    return loop.monitored && SETTLED_PHASES.has(loop.phase);
  }

  function setOutcome(integrationId: string, ticketId: string, outcome: IntegrationMember["outcome"], head: string | null, branch: string | null, note: string): void {
    stmts.setIntegrationMemberOutcome.run({ outcome, head_sha: head, branch, note, updated_at: Date.now(), integration_id: integrationId, ticket_id: ticketId });
  }

  /** Reads a member's head and stores it; a card that is gone, or whose work can't be read, is recorded as unavailable. */
  async function resolveMember(integrationId: string, ticketId: string): Promise<void> {
    const row = stmts.byId.get(ticketId);
    if (row === undefined) {
      setOutcome(integrationId, ticketId, "unavailable", null, null, "The card was deleted.");
      return;
    }
    const head = await cardHead(board.hydrate(row));
    if (head.kind === "unavailable") setOutcome(integrationId, ticketId, "unavailable", null, null, head.reason);
    else if (head.kind === "nothing") setOutcome(integrationId, ticketId, "nothing", head.head, head.branch, `No commits beyond ${head.base}.`);
    else setOutcome(integrationId, ticketId, "ready", head.head, head.branch, `${head.ahead} commit${head.ahead === 1 ? "" : "s"} beyond ${head.base}${head.dirty ? "; the worktree also has uncommitted changes" : ""}.`);
  }

  const reconciling = new Set<string>();
  const again = new Set<string>();

  /**
   * Brings a waiting integration up to date with its members: a card that settled gets its head read, one that was
   * reopened goes back to pending, and once every member has settled the integration thread starts.
   */
  async function reconcile(integrationId: string): Promise<void> {
    if (reconciling.has(integrationId)) {
      again.add(integrationId);
      return;
    }
    reconciling.add(integrationId);
    try {
      do {
        again.delete(integrationId);
        await reconcileOnce(integrationId);
      } while (again.has(integrationId));
    } finally {
      reconciling.delete(integrationId);
    }
  }

  async function reconcileOnce(integrationId: string): Promise<void> {
    const row = live(stmts.integrationById.get(integrationId));
    if (row === undefined || row.status !== "waiting") return;
    let changed = false;
    for (const member of stmts.integrationMembers.all(integrationId)) {
      const isSettled = settled(member.ticket_id);
      if (isSettled && member.outcome === "pending") {
        await resolveMember(integrationId, member.ticket_id);
        changed = true;
      } else if (!isSettled && member.outcome !== "pending") {
        setOutcome(integrationId, member.ticket_id, "pending", null, null, "");
        changed = true;
      }
    }
    if (changed) publish();
    const members = stmts.integrationMembers.all(integrationId);
    if (members.length > 0 && members.every((member) => member.outcome !== "pending")) await start(integrationId, false);
  }

  /** A member card moved, changed loop phase, or was deleted or restored. */
  function ticketChanged(ticketId: string): void {
    const member = stmts.integrationMemberByTicket.get(ticketId);
    if (member === undefined) return;
    void reconcile(member.integration_id).catch((error) => bb.log.warn(`could not reconcile integration ${member.integration_id}: ${errorMessage(error)}`));
  }

  function mergeStep(member: IntegrationMember, title: string): string {
    const branch = member.branch === null ? "" : ` (branch \`${member.branch}\`)`;
    return `${member.proposalId} "${title}" (card ${member.ticketId})${branch}: \`git merge --no-ff --no-edit ${member.headSha}\``;
  }

  function integratePrompt(integration: Integration, dump: DumpRow, rerun: boolean): string {
    const titles = new Map(integration.members.map((member) => [member.ticketId, stmts.byId.get(member.ticketId)?.title ?? "(deleted card)"]));
    const merging = integration.members.filter((member) => member.headSha !== null && member.outcome !== "nothing");
    const leftOut = integration.members.filter((member) => !merging.includes(member));
    const checkCommand = projectSettings.projectSettings(integration.projectId).checkCommand;
    const setup = rerun
      ? "This worktree is the one you integrated into before. Worktrees of this project share one repository, so every commit below is already here and nothing needs fetching."
      : "Setup (this worktree is disposable; do not touch any other checkout). Worktrees of this project share one repository, so every commit below is already here and nothing needs fetching.";
    return [
      `${rerun ? "Integrate again" : "Integrate"} the work of ${integration.members.length} card${integration.members.length === 1 ? "" : "s"} planned from one brain dump into this worktree, so the feature they make up can be tested end to end before anything lands.`,
      "",
      setup,
      "",
      merging.length === 0 ? "Nothing has commits to merge; say so and stop." : "Merge, in this order:",
      ...merging.map((member, index) => `${index + 1}. ${mergeStep(member, titles.get(member.ticketId)!)}`),
      ...(leftOut.length === 0 ? [] : ["", "Not merged:", ...leftOut.map((member) => `- ${member.proposalId} "${titles.get(member.ticketId)}" (card ${member.ticketId}): ${member.note || member.outcome}`)]),
      "",
      "When a merge conflicts and the right result is clear from both sides' intent (the cards are described below), resolve it and commit; when it isn't, `git merge --abort`, carry on with the rest, and report that card as a conflict. Small seams between the cards (one renamed something another still calls by the old name) are yours to fix here, in their own commit; anything bigger belongs to the card's own thread, so report it instead.",
      "",
      `Then prepare the worktree the way the project needs before its checks can run, such as installing dependencies (installing may need the network, which the sandbox can block; running the install with the sandbox disabled is expected and authorized here), and ${checkCommand === null ? "run the project's checks (choose the command that builds, lints and tests it; the project sets none)" : `run the project's check command \`${checkCommand}\``}.`,
      "",
      `Record the result with \`bb kanban integrated --commit "$(git rev-parse HEAD)" --merged ${merging.map((member) => member.proposalId).join(",") || "<ids>"} [--conflicts <ids>] [--exit-code <n>]\`, naming the cards by the ids above (${integration.members.map((member) => member.proposalId).join(", ")}) and giving the check command's exit code.`,
      "",
      "Then test the feature end to end as the dictation below describes, with whatever the project offers (its app, its tests, a browser), and report what works and what doesn't, card by card. The user carries on in this thread to validate the feature: never land, push or merge it anywhere else, and never move any card.",
      "",
      "## The feature, as dictated",
      "",
      dump.text.trim(),
      "",
      "## The cards",
      "",
      ...integration.members.flatMap((member) => {
        const row = stmts.byId.get(member.ticketId);
        return [`### ${member.proposalId} "${titles.get(member.ticketId)}" (card ${member.ticketId})`, "", row === undefined || row.description.trim() === "" ? "(no description)" : row.description.trim(), ""];
      }),
    ].join("\n");
  }

  /**
   * Starts the merge: reads every member's head afresh (a card still being worked on is merged as it stands when the
   * user asks for it), then prompts the integration card's thread, in the worktree it already has or a fresh one.
   */
  async function start(integrationId: string, manual: boolean): Promise<Integration> {
    const row = live(stmts.integrationById.get(integrationId));
    if (row === undefined) throw new Error(`No integration with id ${integrationId}`);
    if (row.status === "integrating") throw new Error("The integration thread is still merging; wait for it to record its result");
    const dump = stmts.dumpById.get(row.dump_id);
    if (dump === undefined) throw new Error("The integration's brain dump is gone");
    if (manual) {
      for (const member of stmts.integrationMembers.all(integrationId)) await resolveMember(integrationId, member.ticket_id);
      publish();
    }
    const card = getTicket(row.ticket_id);
    const integration = integrationOf(row);
    let environment: ThreadEnvironment | null = null;
    if (card.threadId !== null) {
      try {
        const thread = await bb.sdk.threads.get({ threadId: card.threadId });
        if (thread.archivedAt === null && thread.environmentId !== null) environment = { type: "reuse", environmentId: thread.environmentId };
      } catch {
        environment = null;
      }
    }
    const now = Date.now();
    try {
      if (environment !== null && card.threadId !== null) {
        await bb.sdk.threads.send({ threadId: card.threadId, mode: "auto", input: [{ type: "text", text: integratePrompt(integration, dump, true), mentions: [] }] });
        stmts.setIntegrationStarted.run(card.threadId, now, now, integrationId);
      } else {
        const thread = await bb.sdk.threads.spawn({
          projectId: row.project_id,
          environment: await freshWorktree(row.project_id),
          prompt: integratePrompt(integration, dump, false),
          title: threadTitle(card.title),
          pluginMetadata: { ticketId: card.id, role: "integrate" },
        });
        stmts.setThread.run(thread.id, row.project_id, now, card.id);
        stmts.setIntegrationStarted.run(thread.id, now, now, integrationId);
      }
    } catch (error) {
      stmts.setIntegrationFailed.run(`The integration thread could not be started: ${errorMessage(error)}`, Date.now(), integrationId);
      publish();
      throw error;
    }
    publish();
    return integrationOf(stmts.integrationById.get(integrationId)!);
  }

  /** The integration a card stands for: its own, or the one its work merges into. */
  function integrationIdForTicket(ticketId: string): string {
    const own = stmts.integrationByTicket.get(ticketId);
    if (own !== undefined) return own.id;
    const member = stmts.integrationMemberByTicket.get(ticketId);
    if (member !== undefined) return member.integration_id;
    throw new Error(`Ticket ${ticketId} is not an integration card and merges into none`);
  }

  /** The user asks for the merge now, done or not. */
  async function run(ticketId: string): Promise<Integration> {
    return start(integrationIdForTicket(ticketId), true);
  }

  /** The integration thread recorded its merge. */
  function record(row: IntegrationRow, commit: string, merged: readonly string[], conflicts: readonly string[], exitCode: number | null): Integration {
    const members = stmts.integrationMembers.all(row.id);
    const named = (ids: readonly string[]) => new Set(members.filter((member) => ids.includes(member.proposal_id) || ids.includes(member.ticket_id)).map((member) => member.ticket_id));
    for (const id of [...merged, ...conflicts]) {
      if (!members.some((member) => member.proposal_id === id || member.ticket_id === id)) throw new Error(`No card ${id} in this integration; its cards are ${members.map((member) => member.proposal_id).join(", ")}`);
    }
    const mergedIds = named(merged);
    const conflictIds = named(conflicts);
    for (const member of members) {
      if (conflictIds.has(member.ticket_id)) setOutcome(row.id, member.ticket_id, "conflict", member.head_sha, member.branch, member.note);
      else if (mergedIds.has(member.ticket_id)) setOutcome(row.id, member.ticket_id, "merged", member.head_sha, member.branch, member.note);
      else if (member.outcome === "ready" || member.outcome === "merged") setOutcome(row.id, member.ticket_id, "skipped", member.head_sha, member.branch, member.note);
    }
    const now = Date.now();
    stmts.setIntegrationRecorded.run(commit, exitCode, now, now, row.id);
    publish();
    return integrationOf(stmts.integrationById.get(row.id)!);
  }

  /** The integration thread went idle without recording: the merge is left for the user to look at. */
  function handleIdle(threadId: string): boolean {
    const row = stmts.integrationByThread.get(threadId);
    if (row === undefined || row.status !== "integrating") return false;
    stmts.setIntegrationFailed.run("The integration thread ended without recording a result (`bb kanban integrated`). Open the thread to see where it stopped, or integrate again.", Date.now(), row.id);
    publish();
    return true;
  }

  function threadDeleted(threadId: string): void {
    if (stmts.clearIntegrationThread.run(Date.now(), threadId).changes > 0) publish();
  }

  return { create, integrationForDump, integrationForTicket, integratesInto, ticketChanged, run, record, handleIdle, threadDeleted, reconcile };
}

export type IntegrationService = ReturnType<typeof createIntegration>;
