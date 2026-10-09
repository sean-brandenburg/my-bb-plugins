import { experimental_useSidebarThreads, type PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ensureHeaderSlot,
  HEADER_ANCHOR_ATTRIBUTE,
  HEADER_ROW,
  HEADER_SLOT_ATTRIBUTE,
} from "./header-project.js";

// Mounted once per thread header (split panes each get one), then portalled
// in front of that header's title.
export function HeaderProject({ projectId, isCompactViewport }: PluginThreadHeaderActionProps) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const slot = useHeaderSlot(anchor);
  const project = experimental_useSidebarThreads().projects.find((candidate) => candidate.id === projectId);
  const attributes = { [HEADER_ANCHOR_ATTRIBUTE]: "" };
  // Phones keep bb's stock footer, which still shows the project.
  const show = slot !== null && project !== undefined && !project.isPersonal && !isCompactViewport;
  return (
    <span ref={setAnchor} hidden {...attributes}>
      {show ? createPortal(project.name, slot) : null}
    </span>
  );
}

function useHeaderSlot(anchor: HTMLElement | null): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const row = anchor?.closest(HEADER_ROW);
    if (!anchor || !row) return;
    let current: HTMLElement | null = null;
    const sync = () => {
      const next = ensureHeaderSlot(anchor);
      if (next !== current) {
        current = next;
        setSlot(next);
      }
    };
    // bb re-renders the title area when the thread is renamed.
    const observer = new MutationObserver(sync);
    observer.observe(row, { childList: true, subtree: true });
    sync();
    return () => {
      observer.disconnect();
      for (const placed of row.querySelectorAll(`[${HEADER_SLOT_ATTRIBUTE}]`)) placed.remove();
      setSlot(null);
    };
  }, [anchor]);
  return slot;
}
