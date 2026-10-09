import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createResolver } from "../shared/obsidian.ts";
import { collectMoves, movedLinkRewriter } from "./moves.ts";

const filesOf = (paths: string[]) => new Map(paths.map((path) => [path, null]));

describe("collectMoves", () => {
  it("maps a single file", () => {
    assert.deepEqual([...collectMoves(filesOf(["A.md", "B.md"]), "A.md", "Sub/A.md")], [["A.md", "Sub/A.md"]]);
  });

  it("maps everything under a folder but not a sibling sharing its prefix", () => {
    const files = filesOf(["Notes/A.md", "Notes/Deep/B.md", "Notes2/C.md"]);
    assert.deepEqual([...collectMoves(files, "Notes", "Archive/Notes")], [
      ["Notes/A.md", "Archive/Notes/A.md"],
      ["Notes/Deep/B.md", "Archive/Notes/Deep/B.md"],
    ]);
  });
});

describe("movedLinkRewriter", () => {
  const before = ["Notes/A.md", "Notes/Deep/B.md", "Index.md", "Other/B.md", "img/pic.png"];

  function rewriterFor(from: string, to: string) {
    const moves = collectMoves(filesOf(before), from, to);
    const after = before.map((path) => moves.get(path) ?? path);
    return movedLinkRewriter(moves, createResolver(before), createResolver(after));
  }

  it("rewrites links into a moved folder from outside it", () => {
    const rewrite = rewriterFor("Notes/Deep", "Archive");
    assert.equal(rewrite("Index.md", "[[Notes/Deep/B]] [b](Notes/Deep/B.md) [[A]]"), "[[Archive/B]] [b](Archive/B.md) [[A]]");
  });

  it("fixes relative links inside a note that moved with its folder", () => {
    const rewrite = rewriterFor("Notes", "Archive/Notes");
    assert.equal(rewrite("Archive/Notes/Deep/B.md", "[a](../A.md) ![p](../../img/pic.png)"), "[a](../A.md) ![p](../../../img/pic.png)");
  });

  it("returns null when nothing changes", () => {
    const rewrite = rewriterFor("Notes/A.md", "Notes/Renamed.md");
    assert.equal(rewrite("Index.md", "[[Index]] [[Other/B]]"), null);
  });

  it("rewrites an embed to the shortest unambiguous name", () => {
    const rewrite = rewriterFor("Notes/A.md", "Notes/Renamed.md");
    assert.equal(rewrite("Index.md", "![[A#Intro]]"), "![[Renamed#Intro]]");
  });
});
