import { describe, expect, it } from "vitest";
import { defaultHostId } from "./hosts.js";

describe("defaultHostId", () => {
  it("prefers a connected persistent host", () => {
    expect(
      defaultHostId([
        { id: "host_offline", type: "persistent", status: "disconnected" },
        { id: "host_cloud", type: "ephemeral", status: "connected" },
        { id: "host_main", type: "persistent", status: "connected" },
      ]),
    ).toBe("host_main");
  });

  it("falls back to the first host, and fails when there is none", () => {
    expect(
      defaultHostId([
        { id: "host_cloud", type: "ephemeral", status: "connected" },
        { id: "host_offline", type: "persistent", status: "disconnected" },
      ]),
    ).toBe("host_cloud");
    expect(() => defaultHostId([])).toThrow("No machine is available.");
  });
});
