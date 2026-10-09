// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureHeaderSlot,
  FOOTER_LABELS,
  HEADER_SLOT_ATTRIBUTE,
  mountThreadHeaderProject,
} from "./header-project.js";

const headerMarkup = `
  <div data-testid="app-page-header-content-row">
    <div>
      <div id="title-area">
        <div><div><p><span class="bb-thread-title">Fix the picker</span></p></div></div>
      </div>
    </div>
    <div>
      <span role="group" aria-label="Project"><span id="anchor"></span></span>
    </div>
  </div>`;

const footerMarkup = `
  <div data-follow-up-composer-footer>
    <div>
      <div>
        <div id="project" data-option-display>my-bb-plugins</div>
        <div id="environment"><div data-option-display>Worktree</div></div>
        <button id="branch" data-promptbox-hide-branch-compact><span>bb/branch</span></button>
      </div>
    </div>
    <div>
      <button aria-label="Permission mode"></button>
    </div>
  </div>`;

const byId = (id: string) => document.getElementById(id)!;

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = headerMarkup + footerMarkup;
});

describe("ensureHeaderSlot", () => {
  it("places the slot first in the title area of the anchor's header", () => {
    const slot = ensureHeaderSlot(byId("anchor"));
    expect(byId("title-area").firstElementChild).toBe(slot);
    expect(slot?.hasAttribute(HEADER_SLOT_ATTRIBUTE)).toBe(true);
  });

  it("is stable across calls and moves back when bb re-renders around it", () => {
    const first = ensureHeaderSlot(byId("anchor"));
    byId("title-area").append(first!);
    expect(ensureHeaderSlot(byId("anchor"))).toBe(first);
    expect(byId("title-area").firstElementChild).toBe(first);
    expect(document.querySelectorAll(`[${HEADER_SLOT_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it("keeps the slot while the title is being renamed", () => {
    byId("title-area").querySelector("p")!.innerHTML = "<input value='Fix the picker' />";
    expect(ensureHeaderSlot(byId("anchor"))).not.toBeNull();
  });

  it("returns null outside a thread header", () => {
    byId("title-area").innerHTML = "<p>Settings</p>";
    expect(ensureHeaderSlot(byId("anchor"))).toBeNull();
    document.body.innerHTML = `<span id="anchor"></span>`;
    expect(ensureHeaderSlot(byId("anchor"))).toBeNull();
  });
});

describe("FOOTER_LABELS", () => {
  it("matches only the footer's project and environment labels", () => {
    const matched = [...document.querySelectorAll(FOOTER_LABELS)].map((element) => element.id);
    expect(matched).toEqual(["project", "environment"]);
  });
});

describe("mountThreadHeaderProject", () => {
  it("adds the header and footer stylesheets and removes both on cleanup", () => {
    const cleanup = mountThreadHeaderProject(document);
    expect(document.querySelectorAll("style[data-thread-header-project]")).toHaveLength(1);
    expect(document.querySelectorAll("style[data-thread-header-project-footer]")).toHaveLength(1);
    cleanup();
    expect(document.querySelectorAll("style")).toHaveLength(0);
  });
});
