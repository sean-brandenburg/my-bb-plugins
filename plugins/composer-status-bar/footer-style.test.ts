// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { ensureFooterSlots, mountComposerStatusBar, SLOT_ATTRIBUTE } from "./footer-style.js";

const footerMarkup = `
  <div data-app-composer>
    <div data-follow-up-composer>
      <div data-follow-up-composer-footer>
        <div id="left">
          <div>
            <div data-option-display>my-bb-plugins</div>
            <button id="branch" data-promptbox-hide-branch-compact><svg></svg><span>bb/branch</span></button>
          </div>
        </div>
        <div id="right">
          <button id="permission" aria-label="Permission mode"></button>
          <button id="context" aria-label="Context window 11% used"><span aria-hidden="true">11%</span><svg></svg></button>
        </div>
      </div>
    </div>
  </div>`;

const root = () => document.querySelector("[data-app-composer]")!;
const byId = (id: string) => document.getElementById(id)!;
const childNames = (element: Element) =>
  [...element.children].map((child) => child.getAttribute(SLOT_ATTRIBUTE) ?? child.id ?? child.tagName);

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = footerMarkup;
});

describe("ensureFooterSlots", () => {
  it("places each slot beside the bb control it belongs with", () => {
    const slots = ensureFooterSlots(root());
    expect(childNames(byId("right"))).toEqual(["agent", "permission", "usage", "context"]);
    expect(byId("context").firstElementChild).toBe(slots.context);
  });

  it("is stable across repeated calls", () => {
    const first = ensureFooterSlots(root());
    const second = ensureFooterSlots(root());
    expect(second).toEqual(first);
    expect(document.querySelectorAll(`[${SLOT_ATTRIBUTE}]`)).toHaveLength(3);
  });

  it("puts a slot back when bb re-renders around it", () => {
    const { agent } = ensureFooterSlots(root());
    byId("right").append(agent!);
    ensureFooterSlots(root());
    expect(childNames(byId("right"))[0]).toBe("agent");
  });

  it("returns no slots when the composer has no footer or only one group", () => {
    document.body.innerHTML = `<div data-app-composer><div data-follow-up-composer-footer><div></div></div></div>`;
    expect(ensureFooterSlots(root())).toEqual({});
    document.body.innerHTML = `<div data-app-composer></div>`;
    expect(ensureFooterSlots(root())).toEqual({});
  });
});

describe("mountComposerStatusBar", () => {
  it("adds its stylesheet and removes it on cleanup", () => {
    const cleanup = mountComposerStatusBar(document);
    expect(document.querySelectorAll("style[data-composer-status-bar]")).toHaveLength(1);
    cleanup();
    expect(document.querySelectorAll("style[data-composer-status-bar]")).toHaveLength(0);
  });
});
