import { experimental_useSidebarThreads, type PluginThreadHeaderActionProps } from "@get-bb/plugin-sdk/app";
import { enter } from "bb-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ensureHeaderSlot,
  HEADER_ANCHOR_ATTRIBUTE,
  HEADER_NAME_ATTRIBUTE,
  HEADER_ROW,
  HEADER_SLOT_ATTRIBUTE,
  projectChanged,
  type ShownProjects,
} from "./header-project.js";

// The label remounts with every thread, but the header row it sits in stays,
// so the row remembers what it last showed.
const shownProjects: ShownProjects = new WeakMap();

// Mounted once per thread header (split panes each get one), then portalled
// in front of that header's title.
export function HeaderProject({ projectId, isCompactViewport }: PluginThreadHeaderActionProps) {
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const slot = useHeaderSlot(anchor);
  const project = experimental_useSidebarThreads().projects.find((candidate) => candidate.id === projectId);
  const attributes = { [HEADER_ANCHOR_ATTRIBUTE]: "" };
  // Phones keep bb's stock footer, which still shows the project.
  const labelled = project === undefined ? undefined : !project.isPersonal && !isCompactViewport ? project.id : null;
  const [entering, setEntering] = useState(false);
  // Recording is not idempotent, so a re-run effect (StrictMode) must not
  // record the same label twice and cancel its own fade.
  const decided = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    const row = anchor?.closest(HEADER_ROW);
    if (!row || labelled === undefined || decided.current === labelled) return;
    decided.current = labelled;
    setEntering(projectChanged(shownProjects, row, labelled));
  }, [anchor, labelled]);
  const show = slot !== null && project !== undefined && labelled !== null;
  const nameAttributes = { [HEADER_NAME_ATTRIBUTE]: "" };
  return (
    <span ref={setAnchor} hidden {...attributes}>
      {show
        ? createPortal(
            // Fades in only when the project changes, not on every thread
            // switch within it; cleared after, so bb moving the slot on a
            // rename doesn't replay it.
            <span
              key={project.id}
              className={entering ? enter.fade : undefined}
              onAnimationEnd={() => setEntering(false)}
              {...nameAttributes}
            >
              {project.name}
            </span>,
            slot,
          )
        : null}
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
