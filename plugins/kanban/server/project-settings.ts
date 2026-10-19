import { z } from "zod";
import { projectSettingsSchema, type ProjectSettings } from "../shared/loop";
import type { KanbanContext } from "./context";

const PROJECT_SETTINGS_KEY = "projectSettings";
const EMPTY: ProjectSettings = { checkCommand: null };

/**
 * Settings the board keeps per project, which bb's plugin settings can't express. They're held in memory as well,
 * because agent instructions are resolved synchronously.
 */
export function createProjectSettings(ctx: KanbanContext) {
  const { bb, publish } = ctx;
  const byProject = new Map<string, ProjectSettings>();

  async function loadProjectSettings(): Promise<void> {
    const parsed = z.record(z.string(), projectSettingsSchema).safeParse(await bb.storage.kv.get(PROJECT_SETTINGS_KEY));
    for (const [projectId, settings] of Object.entries(parsed.success ? parsed.data : {})) byProject.set(projectId, settings);
  }

  function projectSettings(projectId: string | null): ProjectSettings {
    return (projectId === null ? undefined : byProject.get(projectId)) ?? EMPTY;
  }

  async function setProjectSettings(projectId: string, patch: Partial<ProjectSettings>): Promise<ProjectSettings> {
    const next = projectSettingsSchema.parse({ ...projectSettings(projectId), ...patch });
    byProject.set(projectId, next);
    await bb.storage.kv.set(PROJECT_SETTINGS_KEY, Object.fromEntries(byProject));
    publish();
    return next;
  }

  function allProjectSettings(): Record<string, ProjectSettings> {
    return Object.fromEntries(byProject);
  }

  return { loadProjectSettings, projectSettings, setProjectSettings, allProjectSettings };
}

export type ProjectSettingsStore = ReturnType<typeof createProjectSettings>;
