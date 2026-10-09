import {
  experimental_useSidebarThreads,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginSidebarThreadsState,
} from "@get-bb/plugin-sdk/app";
import type { SidebarThread } from "./sidebar-thread.js";

export interface SidebarProject {
  id: string;
  name: string;
  isPersonal: boolean;
  threads: SidebarThread[];
}

export interface SidebarData {
  status: PluginSidebarThreadsState["status"];
  projects: SidebarProject[];
  personalProject: SidebarProject | null;
}

function sameElements<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameProjectShape(
  previous: SidebarProject,
  project: PluginSidebarProject,
): boolean {
  return (
    previous.id === project.id &&
    previous.name === project.name &&
    previous.isPersonal === project.isPersonal
  );
}

const EMPTY_THREADS: SidebarThread[] = [];

export function buildSidebarData(
  status: PluginSidebarThreadsState["status"],
  threads: readonly PluginSidebarThread[],
  projects: readonly PluginSidebarProject[],
  previous: SidebarData | null = null,
): SidebarData {
  const threadsByProjectId = new Map<string, SidebarThread[]>();
  for (const thread of threads) {
    const bucket = threadsByProjectId.get(thread.projectId);
    if (bucket === undefined) {
      threadsByProjectId.set(thread.projectId, [thread]);
    } else {
      bucket.push(thread);
    }
  }
  const previousProjectsById = new Map(
    previous?.projects.map((project) => [project.id, project]) ?? [],
  );
  const groupedProjects = projects.map<SidebarProject>((project) => {
    const bucket = threadsByProjectId.get(project.id) ?? EMPTY_THREADS;
    const before = previousProjectsById.get(project.id);
    if (
      before !== undefined &&
      sameProjectShape(before, project) &&
      sameElements(before.threads, bucket)
    ) {
      return before;
    }
    return {
      id: project.id,
      name: project.name,
      isPersonal: project.isPersonal,
      threads:
        before !== undefined && sameElements(before.threads, bucket)
          ? before.threads
          : bucket,
    };
  });
  const sharedProjects =
    previous !== null && sameElements(previous.projects, groupedProjects)
      ? previous.projects
      : groupedProjects;
  return {
    status,
    projects: sharedProjects,
    personalProject:
      sharedProjects.find((project) => project.isPersonal) ?? null,
  };
}

interface SidebarDataCacheEntry {
  status: PluginSidebarThreadsState["status"];
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  data: SidebarData;
}

let sidebarDataCache: SidebarDataCacheEntry | null = null;

export function getSidebarData(state: PluginSidebarThreadsState): SidebarData {
  const cached = sidebarDataCache;
  if (
    cached !== null &&
    cached.status === state.status &&
    cached.threads === state.threads &&
    cached.projects === state.projects
  ) {
    return cached.data;
  }
  const data = buildSidebarData(
    state.status,
    state.threads,
    state.projects,
    cached?.data ?? null,
  );
  sidebarDataCache = {
    status: state.status,
    threads: state.threads,
    projects: state.projects,
    data,
  };
  return data;
}

export function resetSidebarDataCacheForTest(): void {
  sidebarDataCache = null;
}

export function useSidebarData(): SidebarData {
  return getSidebarData(experimental_useSidebarThreads());
}
