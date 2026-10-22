import { describe, expect, it } from "vitest";
import type { Ticket } from "../../shared/board";
import { cardPromptText } from "./prompts";

describe("the land prompt", () => {
  const ticket = { title: "Fix it" } as Ticket;

  it("credits the user's accept only when the user accepted", () => {
    expect(cardPromptText({ kind: "land", auto: false }, ticket, null)).toContain("The user read the board's handoff brief");
    const auto = cardPromptText({ kind: "land", auto: true }, ticket, null);
    expect(auto).toContain("accepted the change for \"Fix it\" without stopping");
    expect(auto).not.toContain("The user read");
  });
});
