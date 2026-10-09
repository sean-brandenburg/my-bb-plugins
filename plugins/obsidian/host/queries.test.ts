import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createResolver, parseLinks } from "../shared/obsidian.ts";
import { findBacklinks, searchVault } from "./queries.ts";

function indexOf(notes: Record<string, string>, otherFiles: string[] = []) {
  const files = [...Object.keys(notes), ...otherFiles].map((path) => ({ path, mtimeMs: 0, size: 0 }));
  const noteMap = new Map(Object.entries(notes).map(([path, content]) => [path, { content, links: parseLinks(content) }]));
  return { files, notes: noteMap, resolver: createResolver(files.map((file) => file.path)) };
}

describe("findBacklinks", () => {
  const vault = indexOf({
    "Plan.md": "# Plan\nSee [[Plan#Goals]] here.",
    "Daily/2026-10-06.md": "- [[Plan]] and [[plan|again]]\n- nothing\n- [the plan](../Plan.md)",
    "Archive/Plan.md": "old",
    "Archive/Notes.md": "[[Plan]]",
    "Other.md": "[[Missing]] `[[Plan]]`",
  });

  it("lists each linking note once per line, sorted, skipping the note itself", () => {
    assert.deepEqual(findBacklinks(vault.notes, vault.resolver, "Plan.md"), {
      backlinks: [
        {
          path: "Daily/2026-10-06.md",
          matches: [
            { line: 0, text: "- [[Plan]] and [[plan|again]]" },
            { line: 2, text: "- [the plan](../Plan.md)" },
          ],
        },
      ],
    });
  });

  it("follows the resolver's same-folder preference", () => {
    assert.deepEqual(
      findBacklinks(vault.notes, vault.resolver, "Archive/Plan.md").backlinks.map((backlink) => backlink.path),
      ["Archive/Notes.md"],
    );
  });
});

describe("searchVault", () => {
  const vault = indexOf(
    {
      "Projects/Alpha.md": "alpha kickoff\nbudget alpha\nnothing",
      "Notes.md": "the alpha budget\nalpha again",
      "Beta.md": "unrelated",
    },
    ["Projects/alpha-diagram.png"],
  );

  it("requires every term in the path or content and ranks path matches first", () => {
    const result = searchVault(vault.files, vault.notes, "Alpha", 10);
    assert.deepEqual(
      result.results.map(({ path, nameMatch }) => ({ path, nameMatch })),
      [
        { path: "Projects/Alpha.md", nameMatch: true },
        { path: "Projects/alpha-diagram.png", nameMatch: true },
        { path: "Notes.md", nameMatch: false },
      ],
    );
    assert.deepEqual(result.results[0]!.matches, [
      { line: 0, text: "alpha kickoff" },
      { line: 1, text: "budget alpha" },
    ]);
    assert.equal(result.truncated, false);
  });

  it("lets a term match the path while another matches the content", () => {
    const result = searchVault(vault.files, vault.notes, "projects kickoff", 10);
    assert.deepEqual(result.results.map((hit) => hit.path), ["Projects/Alpha.md"]);
  });

  it("caps results and per-file matches and shortens long lines", () => {
    const long = `${"x".repeat(400)} needle`;
    const many = indexOf({ "A.md": Array.from({ length: 8 }, () => "needle").join("\n"), "B.md": long, "C.md": "needle" });
    const result = searchVault(many.files, many.notes, "needle", 2);
    assert.equal(result.truncated, true);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0]!.path, "A.md");
    assert.equal(result.results[0]!.matches.length, 5);
    const capped = searchVault(many.files, many.notes, "needle", 3).results.find((hit) => hit.path === "B.md")!;
    assert.equal(capped.matches[0]!.text, `${"x".repeat(300)}…`);
  });
});
