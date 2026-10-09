import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expandFolderPath,
  inspectFolder,
  openProjectFolder,
} from "./project-folders.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "project-folders-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function fakeSdk(projects: unknown[] = []) {
  const create = vi.fn(async (args: { name: string }) => ({
    id: `proj_${args.name}`,
  }));
  const sdk = {
    projects: { list: vi.fn(async () => projects), create },
    hosts: {
      list: vi.fn(async () => [
        { id: "host_gone", type: "ephemeral", status: "disconnected" },
        { id: "host_main", type: "persistent", status: "connected" },
      ]),
    },
  };
  return { sdk: sdk as never, create };
}

describe("expandFolderPath", () => {
  it("expands the home directory and normalizes trailing slashes", () => {
    expect(expandFolderPath("~", "/Users/me")).toBe("/Users/me");
    expect(expandFolderPath(" ~/dev/app/ ", "/Users/me")).toBe(
      "/Users/me/dev/app",
    );
    expect(expandFolderPath("/srv/./repo/../repo2", "/Users/me")).toBe(
      "/srv/repo2",
    );
    expect(expandFolderPath("/", "/Users/me")).toBe("/");
  });

  it("rejects relative and empty paths", () => {
    expect(expandFolderPath("dev/app", "/Users/me")).toBeNull();
    expect(expandFolderPath("~other/app", "/Users/me")).toBeNull();
    expect(expandFolderPath("   ", "/Users/me")).toBeNull();
  });
});

describe("inspectFolder", () => {
  it("reports whether a path is a folder and which project already uses it", async () => {
    const file = join(root, "notes.txt");
    await writeFile(file, "");
    const { sdk } = fakeSdk([
      {
        id: "proj_here",
        kind: "standard",
        sources: [{ path: `${root}/` }],
      },
    ]);
    await expect(inspectFolder(sdk, root)).resolves.toEqual({
      path: root,
      isDirectory: true,
      projectId: "proj_here",
    });
    await expect(inspectFolder(sdk, file)).resolves.toEqual({
      path: file,
      isDirectory: false,
      projectId: null,
    });
    await expect(inspectFolder(sdk, "relative")).resolves.toEqual({
      path: null,
      isDirectory: false,
      projectId: null,
    });
  });
});

describe("openProjectFolder", () => {
  it("creates a project named after the folder on the connected machine", async () => {
    const folder = join(root, "my-repo");
    await mkdir(folder);
    const { sdk, create } = fakeSdk();
    await expect(openProjectFolder(sdk, folder)).resolves.toEqual({
      projectId: "proj_my-repo",
      created: true,
    });
    expect(create).toHaveBeenCalledWith({
      name: "my-repo",
      source: { type: "local_path", path: folder, hostId: "host_main" },
    });
  });

  it("reuses the project that already has the folder as a source", async () => {
    const { sdk, create } = fakeSdk([
      { id: "proj_personal", kind: "personal", sources: [{ path: root }] },
      { id: "proj_existing", kind: "standard", sources: [{ path: root }] },
    ]);
    await expect(openProjectFolder(sdk, root, "host_x")).resolves.toEqual({
      projectId: "proj_existing",
      created: false,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses paths that are not folders", async () => {
    const { sdk } = fakeSdk();
    await expect(openProjectFolder(sdk, join(root, "missing"))).rejects.toThrow(
      /Not a folder/,
    );
    await expect(openProjectFolder(sdk, "relative")).rejects.toThrow(
      /Not an absolute path/,
    );
  });
});
