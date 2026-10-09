// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { stepHistory } from "./history.js";

function historyButton(label: string, disabled = false) {
  const button = document.createElement("button");
  button.setAttribute("aria-label", label);
  button.disabled = disabled;
  document.body.append(button);
  const onClick = vi.fn();
  button.addEventListener("click", onClick);
  return onClick;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("stepHistory", () => {
  it("clicks bb's own back and forward buttons", () => {
    const back = historyButton("Go back");
    const forward = historyButton("Go forward");
    const historyBack = vi.spyOn(window.history, "back");

    stepHistory(document, window, "back");
    expect(back).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();

    stepHistory(document, window, "forward");
    expect(forward).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();
  });

  it("does nothing when bb has disabled the button", () => {
    const back = historyButton("Go back", true);
    const historyBack = vi.spyOn(window.history, "back");

    stepHistory(document, window, "back");

    expect(back).not.toHaveBeenCalled();
    expect(historyBack).not.toHaveBeenCalled();
  });

  it("falls back to the window's history without bb's buttons", () => {
    const historyBack = vi
      .spyOn(window.history, "back")
      .mockImplementation(() => undefined);
    const historyForward = vi
      .spyOn(window.history, "forward")
      .mockImplementation(() => undefined);

    stepHistory(document, window, "back");
    stepHistory(document, window, "forward");

    expect(historyBack).toHaveBeenCalledTimes(1);
    expect(historyForward).toHaveBeenCalledTimes(1);
  });
});
