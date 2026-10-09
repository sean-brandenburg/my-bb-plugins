import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { embedSection, resolveTargetLine, targetFromSubpath, toggleTaskAt } from "./note-text.ts";

const note = "---\ntitle: x\n---\n# Intro\ntext ^abc\n## Goals\n- one\n### Detail\nmore\n## Next  ##\nlast";

describe("targetFromSubpath", () => {
  it("distinguishes headings from block references", () => {
    assert.equal(targetFromSubpath(null), undefined);
    assert.equal(targetFromSubpath(""), undefined);
    assert.deepEqual(targetFromSubpath("Goals"), { heading: "Goals" });
    assert.deepEqual(targetFromSubpath("^abc"), { block: "abc" });
  });
});

describe("resolveTargetLine", () => {
  it("finds lines, headings (ignoring case and spacing), and blocks", () => {
    assert.equal(resolveTargetLine(note, { line: 2 }), 2);
    assert.equal(resolveTargetLine(note, { heading: "goals" }), 5);
    assert.equal(resolveTargetLine(note, { heading: "  Next " }), 9);
    assert.equal(resolveTargetLine(note, { block: "ABC" }), 4);
    assert.equal(resolveTargetLine(note, { heading: "Missing" }), null);
    assert.equal(resolveTargetLine(note, { block: "zzz" }), null);
    assert.equal(resolveTargetLine(note, {}), null);
  });
});

describe("embedSection", () => {
  it("returns a heading's section including its subsections", () => {
    assert.equal(embedSection(note, "Goals"), "## Goals\n- one\n### Detail\nmore");
    assert.equal(embedSection(note, "next"), "## Next  ##\nlast");
  });

  it("returns a block's line without its id", () => {
    assert.equal(embedSection(note, "^abc"), "text");
  });

  it("falls back to the whole note", () => {
    assert.equal(embedSection(note, "Nowhere"), note);
    assert.equal(embedSection(note, "^nope"), note);
  });
});

describe("toggleTaskAt", () => {
  const tasks = "- [ ] a\n  * [x] b\n> 1. [X] c\n- plain";

  it("flips the checkbox on a one-based line", () => {
    assert.equal(toggleTaskAt(tasks, 1), "- [x] a\n  * [x] b\n> 1. [X] c\n- plain");
    assert.equal(toggleTaskAt(tasks, 2), "- [ ] a\n  * [ ] b\n> 1. [X] c\n- plain");
    assert.equal(toggleTaskAt(tasks, 3), "- [ ] a\n  * [x] b\n> 1. [ ] c\n- plain");
  });

  it("returns null for lines that aren't tasks", () => {
    assert.equal(toggleTaskAt(tasks, 4), null);
    assert.equal(toggleTaskAt(tasks, 0), null);
    assert.equal(toggleTaskAt(tasks, 9), null);
  });
});
