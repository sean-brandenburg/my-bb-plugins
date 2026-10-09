import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Ticket } from "../shared/board";
import type { CardThreads } from "./card-threads";
import type { KanbanContext } from "./context";
import { githubRepoFromRemote } from "./github";
import { execFileAsync } from "./util";

/** Which project a card's threads run in, cloning and creating one for a repository no project matches. */
export function createProjects(ctx: KanbanContext, { threads }: { threads: CardThreads }) {
  const { bb, settings, stmts, publish } = ctx;
  const { spawnThreadForTicket } = threads;

  /** The project a PR card's threads run in: stored, matched by remote, or the fallback. */
  async function projectForTicket(ticket: Ticket, explicit: string | null): Promise<string> {
    if (explicit !== null) return explicit;
    if (ticket.projectId !== null) return ticket.projectId;
    const parentProject = ticket.parentId === null ? null : (stmts.byId.get(ticket.parentId)?.project_id ?? null);
    if (parentProject !== null) return parentProject;
    const resolved = ticket.pr === null ? null : await ensureProjectForRepo(ticket.pr.repo);
    if (resolved === null) {
      throw new Error(
        `No project matches ${ticket.pr?.repo ?? "this card"}. Pick a project, turn on project auto-creation, or set the fallback project in the plugin settings.`,
      );
    }
    stmts.setProjectIfUnset.run(resolved, Date.now(), ticket.id);
    return resolved;
  }

  /** Project whose git remote is this GitHub repo, else the configured fallback. */
  async function fallbackProject(sourceProjectId: string | null): Promise<string | null> {
    if (sourceProjectId !== null) return sourceProjectId;
    const { defaultProject } = await settings.get();
    return typeof defaultProject === "string" && defaultProject !== "" ? defaultProject : null;
  }

  async function projectMatchingRepo(repo: string): Promise<string | null> {
    const projects = await bb.sdk.projects.list();
    return projects.find((project) => githubRepoFromRemote(project.gitRemoteUrl) === repo)?.id ?? null;
  }

  /**
   * Sync-time resolution: a matching project, else (with auto-creation on) null for now while the clone runs in the
   * background and fills the card in, else the fallback.
   */
  async function resolveProjectForRepo(repo: string, sourceProjectId: string | null = null): Promise<string | null> {
    const match = await projectMatchingRepo(repo);
    if (match !== null) return match;
    const { autoCreateProjects } = await settings.get();
    if (autoCreateProjects === true) {
      void ensureProjectForRepo(repo).then(
        (projectId) => {
          if (projectId !== null) void adoptProjectForRepo(repo, projectId).catch((error: unknown) => bb.log.warn(`could not adopt project ${projectId} for ${repo}: ${String(error)}`));
        },
        (error) => bb.log.warn(`could not create a project for ${repo}: ${String(error)}`),
      );
      return null;
    }
    return fallbackProject(sourceProjectId);
  }

  /** Give every project-less card for `repo` the project, and start their threads if sync would have. */
  async function adoptProjectForRepo(repo: string, projectId: string): Promise<void> {
    const rows = stmts.unprojectedPrsForRepo.all(repo);
    if (rows.length === 0) return;
    const now = Date.now();
    for (const row of rows) stmts.setProjectIfUnset.run(projectId, now, row.id);
    publish();
    const { autoStartThreads } = await settings.get();
    if (autoStartThreads !== true) return;
    for (const row of rows) {
      try {
        await spawnThreadForTicket(row.id, projectId);
      } catch (error) {
        bb.log.warn(`could not start a thread for ticket ${row.id}: ${String(error)}`);
      }
    }
  }

  const projectCreations = new Map<string, Promise<string | null>>();

  /** A project whose remote is `repo`: the existing one, or one created from a fresh clone when auto-creation is on. */
  async function ensureProjectForRepo(repo: string): Promise<string | null> {
    const match = await projectMatchingRepo(repo);
    if (match !== null) return match;
    const { autoCreateProjects } = await settings.get();
    if (autoCreateProjects !== true) return fallbackProject(null);
    let pending = projectCreations.get(repo);
    if (pending === undefined) {
      pending = createProjectForRepo(repo).finally(() => projectCreations.delete(repo));
      projectCreations.set(repo, pending);
    }
    return pending;
  }

  async function createProjectForRepo(repo: string): Promise<string | null> {
    const [owner, name] = repo.split("/");
    if (owner === undefined || name === undefined || name === "") throw new Error(`Not a GitHub repository: ${repo}`);
    const config = await bb.sdk.system.config();
    if (config.primaryHostId === null) throw new Error("bb has no primary host to clone on");
    const { cloneDir } = await settings.get();
    const base = typeof cloneDir === "string" && cloneDir.trim() !== "" ? cloneDir.trim() : join(config.dataDir, "plugins", bb.pluginId, "repos");
    const dir = join(base, owner, name);
    // Match the transport the user's other projects use so the same credentials work.
    const projects = await bb.sdk.projects.list();
    const useSsh = projects.some((project) => project.gitRemoteUrl?.startsWith("git@github.com:") === true);
    const url = useSsh ? `git@github.com:${repo}.git` : `https://github.com/${repo}.git`;
    if (!existsSync(join(dir, ".git"))) {
      await mkdir(dirname(dir), { recursive: true });
      bb.log.info(`cloning ${url} to ${dir} for a new project`);
      // Blobless clone: fast and small; worktrees fetch file contents on checkout.
      await execFileAsync("git", ["clone", "--filter=blob:none", "--", url, dir], { timeout: 20 * 60_000, maxBuffer: 16 * 1024 * 1024 });
    }
    const created = await bb.sdk.projects.create({ name, source: { hostId: config.primaryHostId, path: dir, type: "local_path" } });
    bb.log.info(`created project ${created.name} (${created.id}) for ${repo}`);
    return created.id;
  }

  return { projectForTicket, fallbackProject, resolveProjectForRepo, adoptProjectForRepo };
}

export type Projects = ReturnType<typeof createProjects>;
