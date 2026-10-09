// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EntranceScope,
  POP,
  replay,
  useArrivals,
  useChangedSinceMount,
  useFlag,
  useLateMount,
  useListKeys,
  usePopOnChange,
  usePresence,
  usePresenceList,
} from "./lib/index";

beforeEach(() => {
  vi.useFakeTimers();
});

// jsdom has no AnimationEvent, so React listens for the prefixed event name instead.
function endAnimation(element: HTMLElement) {
  fireEvent(element, new Event("webkitAnimationEnd", { bubbles: true }));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePresence", () => {
  it("stays mounted while exiting, then unmounts on the element's own animationend", () => {
    function Probe({ open }: { open: boolean }) {
      const presence = usePresence(open);
      return presence.mounted ? (
        <div data-testid="box" data-exiting={presence.exiting} onAnimationEnd={presence.onAnimationEnd}>
          <span data-testid="child" />
        </div>
      ) : null;
    }
    const view = render(<Probe open />);
    view.rerender(<Probe open={false} />);
    expect(view.getByTestId("box").dataset.exiting).toBe("true");

    endAnimation(view.getByTestId("child"));
    expect(view.queryByTestId("box")).not.toBeNull();

    endAnimation(view.getByTestId("box"));
    expect(view.queryByTestId("box")).toBeNull();
  });

  it("unmounts on the fallback timer when no animation runs", () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open), { initialProps: { open: true } });
    rerender({ open: false });
    expect(result.current.mounted).toBe(true);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.mounted).toBe(false);
  });

  it("reopening mid-exit cancels the exit", () => {
    const { result, rerender } = renderHook(({ open }) => usePresence(open), { initialProps: { open: true } });
    rerender({ open: false });
    rerender({ open: true });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toMatchObject({ mounted: true, exiting: false });
  });
});

describe("usePresenceList", () => {
  const keyOf = (item: string) => item;

  it("keeps a removed item in place, flagged exiting, until onExited", () => {
    const { result, rerender } = renderHook(({ items }) => usePresenceList(items, keyOf), {
      initialProps: { items: ["a", "b", "c"] },
    });
    rerender({ items: ["a", "c"] });
    expect(result.current.entries.map((entry) => [entry.key, entry.exiting])).toEqual([
      ["a", false],
      ["b", true],
      ["c", false],
    ]);
    act(() => result.current.onExited("b"));
    expect(result.current.entries.map((entry) => entry.key)).toEqual(["a", "c"]);
  });

  it("drops exiting items on the fallback timer", () => {
    const { result, rerender } = renderHook(({ items }) => usePresenceList(items, keyOf), {
      initialProps: { items: ["a", "b"] },
    });
    rerender({ items: ["a"] });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.entries.map((entry) => entry.key)).toEqual(["a"]);
  });
});

describe("useArrivals", () => {
  it("cascades the first loaded set, marks later keys new, and replays nothing on remount", () => {
    const { result, rerender } = renderHook(({ keys }) => useArrivals(keys), {
      initialProps: { keys: null as string[] | null },
    });
    expect(result.current("a")).toBeNull();

    rerender({ keys: ["a", "b"] });
    expect(result.current("a")).toBe("intro");

    rerender({ keys: ["a", "b", "c"] });
    expect(result.current("a")).toBeNull();
    expect(result.current("c")).toBe("new");

    rerender({ keys: ["a", "b", "c"] });
    expect(result.current("c")).toBeNull();
  });

  it("resets when keys go back to null", () => {
    const { result, rerender } = renderHook(({ keys }) => useArrivals(keys), {
      initialProps: { keys: ["a"] as string[] | null },
    });
    rerender({ keys: ["a"] });
    rerender({ keys: null });
    rerender({ keys: ["a"] });
    expect(result.current("a")).toBe("intro");
  });
});

describe("usePopOnChange", () => {
  it("pops on a change, not on mount or when data first arrives", () => {
    const { result, rerender } = renderHook(({ value }) => usePopOnChange(value), {
      initialProps: { value: null as number | null },
    });
    expect(result.current.className).toBeUndefined();

    rerender({ value: 3 });
    expect(result.current.className).toBeUndefined();

    rerender({ value: 4 });
    expect(result.current).toMatchObject({ className: POP, key: 1 });

    rerender({ value: 5 });
    expect(result.current.key).toBe(2);
  });
});

describe("useChangedSinceMount", () => {
  it("stays true after the value changes back", () => {
    const { result, rerender } = renderHook(({ value }) => useChangedSinceMount(value), {
      initialProps: { value: "idle" },
    });
    expect(result.current).toBe(false);
    rerender({ value: "done" });
    rerender({ value: "idle" });
    expect(result.current).toBe(true);
  });
});

describe("EntranceScope / useLateMount", () => {
  it("marks only components mounted after the scope's first commit", () => {
    function Late({ id }: { id: string }) {
      return <span data-testid={id} data-late={useLateMount()} />;
    }
    function Tree({ extra }: { extra: boolean }) {
      return (
        <EntranceScope>
          <Late id="first" />
          {extra && <Late id="added" />}
        </EntranceScope>
      );
    }
    const view = render(<Tree extra={false} />);
    view.rerender(<Tree extra />);
    expect(view.getByTestId("first").dataset.late).toBe("false");
    expect(view.getByTestId("added").dataset.late).toBe("true");
  });
});

describe("useListKeys", () => {
  it("keeps the remaining items' keys when one is forgotten", () => {
    const { result, rerender } = renderHook(({ length }) => useListKeys(length), { initialProps: { length: 3 } });
    expect(result.current.keys).toEqual([0, 1, 2]);
    result.current.forget(1);
    rerender({ length: 2 });
    expect(result.current.keys).toEqual([0, 2]);
    rerender({ length: 3 });
    expect(result.current.keys).toEqual([0, 2, 3]);
  });
});

describe("useFlag", () => {
  it("is on for the duration, and a retrigger extends it", () => {
    const { result } = renderHook(() => useFlag(1000));
    act(() => result.current[1]());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => result.current[1]());
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current[0]).toBe(true);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current[0]).toBe(false);
  });
});

describe("replay", () => {
  it("re-adds the class, forcing a reflow in between", () => {
    const element = document.createElement("div");
    element.classList.add(POP);
    const reads = vi.spyOn(element, "offsetWidth", "get");
    replay(element, POP);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(element.classList.contains(POP)).toBe(true);
  });
});
