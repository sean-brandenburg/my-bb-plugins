// Marks chat timeline rows that were appended live (a new message, a new work
// row) so shell.css can rise them in. bb virtualizes the timeline: rows mount
// whenever they scroll into view and the whole list remounts on a thread
// switch, so "mounted" is not "new". A row counts as new only when it extends
// the tail of a list that was already showing rows, with an id this list has
// never shown, outside the settling period after a navigation, and arriving
// alone or in a pair rather than as a batch the virtualizer realized at once.

export const NEW_ROW_ATTR = "data-bbm-new-row";

const ITEMS_ATTR = "data-timeline-items";
const ROW_ID_ATTR = "data-timeline-row-id";
const INDEX_ATTR = "data-index";

// Long enough to cover a thread's async load and the virtualizer's follow-up
// measurement passes after navigation.
export const SETTLE_MS = 800;
// Sending a message appends the user row and often a status row together.
export const MAX_NEW_PER_BATCH = 2;
// Removed after the entrance so that a later restyle (an ancestor toggling
// display) can't replay it.
export const MARK_MS = 1000;


export type TimelineEntranceOptions = {
  root?: Node;
  now?: () => number;
  path?: () => string;
};

function rowIndex(row: Element): number {
  const value = Number(row.getAttribute(INDEX_ATTR));
  return Number.isFinite(value) ? value : -1;
}

function isRow(node: Node): node is Element {
  return node.nodeType === 1 && (node as Element).hasAttribute(ROW_ID_ATTR);
}

export function watchTimelineEntrances(options: TimelineEntranceOptions = {}): () => void {
  const root = options.root ?? document.body;
  const now = options.now ?? (() => performance.now());
  const path = options.path ?? (() => location.pathname);

  const lists = new WeakMap<Element, { seen: Set<string> }>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const marked = new Set<Element>();
  let lastPath = path();
  let navigatedAt = now();

  const mark = (row: Element) => {
    row.setAttribute(NEW_ROW_ATTR, "");
    marked.add(row);
    const timer = setTimeout(() => {
      timers.delete(timer);
      marked.delete(row);
      row.removeAttribute(NEW_ROW_ATTR);
    }, MARK_MS);
    timers.add(timer);
  };

  const handleList = (list: Element, added: Element[], removed: Element[]) => {
    const addedSet = new Set(added);
    const previous: Element[] = [];
    for (const child of Array.from(list.children)) {
      if (!addedSet.has(child) && child.hasAttribute(ROW_ID_ATTR)) previous.push(child);
    }
    let state = lists.get(list);
    if (!state) {
      // First sighting may be the virtualizer dropping a row; rows it just
      // removed were on screen, so they count as already shown.
      state = { seen: new Set([...previous, ...removed].map((row) => row.getAttribute(ROW_ID_ATTR)!)) };
      lists.set(list, state);
    }
    const seen = state.seen;

    const fresh = added.filter((row) => !seen.has(row.getAttribute(ROW_ID_ATTR)!));
    for (const row of added) seen.add(row.getAttribute(ROW_ID_ATTR)!);

    if (now() - navigatedAt < SETTLE_MS || previous.length === 0 || fresh.length === 0 || fresh.length > MAX_NEW_PER_BATCH) return;

    let tail = -1;
    for (const row of previous) tail = Math.max(tail, rowIndex(row));
    for (const row of fresh) if (rowIndex(row) > tail) mark(row);
  };

  const observer = new MutationObserver((records) => {
    const current = path();
    if (current !== lastPath) {
      lastPath = current;
      navigatedAt = now();
    }

    let byList: Map<Element, { added: Element[]; removed: Element[] }> | undefined;
    for (const record of records) {
      const target = record.target as Element;
      // Fast path: streaming text mutates constantly; only direct children of
      // a timeline list are rows.
      if (record.type !== "childList" || target.nodeType !== 1 || !target.hasAttribute(ITEMS_ATTR)) continue;
      byList ??= new Map();
      let change = byList.get(target);
      if (!change) {
        change = { added: [], removed: [] };
        byList.set(target, change);
      }
      for (const node of Array.from(record.addedNodes)) {
        if (isRow(node) && node.parentNode === target) change.added.push(node);
      }
      for (const node of Array.from(record.removedNodes)) {
        if (isRow(node)) change.removed.push(node);
      }
    }
    if (byList) for (const [list, change] of byList) handleList(list, change.added, change.removed);
  });
  observer.observe(root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const row of marked) row.removeAttribute(NEW_ROW_ATTR);
    marked.clear();
  };
}
