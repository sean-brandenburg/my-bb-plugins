import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { toast } from "sonner";
import { cx, enter, exit, PRESS, speed, usePresence } from "bb-motion";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { CallResult } from "../contract";
import type { HistoryEntry, Overview, rpcContract } from "../server/rpc-contract";
import { CHANGED_CHANNEL, MASKED_VALUE, errorMessage, formatResponse, isClientStreaming } from "../shared/common";
import type { MethodInfo } from "../shared/schema";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { activateRow, deleteRow, editField, FIELD_ROW, focusRow, isTextEntry, LIST_SEARCH, NAV_ROW, readRows, returnToRow, rowCells, useClientKeys } from "./client-keys";
import { type Caret, cycle, focusWhenShown, isToolbar, type KeyContext, type ListMotion, runListMotion, runListScroll, scrollPane } from "bb-vim-keys";
import type { ClientCommand } from "./client-nav";
import { Centered, FOCUS_RING, MenuItem, Segmented, Tabs } from "./controls";
import { EndpointSwitcher } from "./EndpointSwitcher";
import { HistoryList, type HistoryListHandle } from "./HistoryList";
import { useServices, useTypeClosure, useWidth } from "./hooks";
import { EditorOptionsContext, inputClass } from "./MessageEditor";
import { MetadataEditor, type MetadataRow } from "./MetadataEditor";
import { ConfirmSendDialog } from "./ConfirmSendDialog";
import { KeysDialog } from "./KeysDialog";
import { MethodBadges, MethodList, type MethodListHandle } from "./MethodList";
import { Popover } from "./Popover";
import { exampleMessage, isObject, type JsonObject } from "./proto-json";
import { RequestBody } from "./RequestBody";
import { RESPONSE_TABS, type ResponseSearchHandle, ResponseView, type ResponseTab } from "./ResponseView";
import { SplitPane } from "./SplitPane";
import { readStored, useStored, writeStored } from "./storage";

/** Below this the method list becomes an overlay. */
const OVERLAY_LIST_WIDTH = 820;
/** At or above this the request and response sit side by side. */
const SIDE_BY_SIDE_WIDTH = 1650;
/** Below this much room beside the list, the request bar folds Form/JSON into its menu. */
const COMPACT_BAR_WIDTH = 780;
const NO_METADATA: MetadataRow[] = [];
const DEFAULT_LIST_WIDTH = 320;
const MIN_LIST_WIDTH = 220;
/** The docked list never takes more than this share of the view. */
const MAX_LIST_SHARE = 0.6;
/** Dragging the list narrower than this collapses it. */
const COLLAPSE_LIST_WIDTH = 160;
const NO_OVERRIDES: Record<string, string> = {};
const REQUEST_TABS = ["body", "metadata", "options"] as const;
/** Where hjkl and the scroll keys act. */
type Pane = "list" | "fields" | "response";
type FocusTarget = "cursor" | "fields" | "response" | "search" | "filters";
/** How long a key's focus request waits for its panel to mount. */
const PENDING_FOCUS_MS = 2000;
const REQUEST_FIELDS = "input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled)";

function EmptyConfig({ errors }: { errors: string[] }) {
  return (
    <Centered>
      <Icon name="grpc-client/brand" className="mx-auto size-8" />
      <p className="text-base font-medium text-foreground">No gRPC endpoints yet</p>
      {errors.map((error) => (
        <p key={error} className="text-destructive">
          {error}
        </p>
      ))}
      <p>Add named endpoints and proto sources from a terminal, or edit the JSON in this plugin's settings.</p>
      <pre className="rounded-lg bg-muted/50 p-3 text-left font-mono text-xs leading-relaxed text-foreground">
        {[
          "bb grpc source add protos --kind protoDir --path ~/src/protos",
          "bb grpc endpoint add local --target localhost:50051 --transport plaintext",
          "bb grpc endpoint add prod --target api.example.com:443 --source protos --protected",
        ].join("\n")}
      </pre>
    </Centered>
  );
}

export function ClientView() {
  const rpc = useRpc<typeof rpcContract>();
  const [rootRef, width, root] = useWidth();
  const overlayList = width > 0 && width < OVERLAY_LIST_WIDTH;
  const sideBySide = width >= SIDE_BY_SIDE_WIDTH;
  const [storedListWidth, setListWidth] = useStored<number>("listWidth", DEFAULT_LIST_WIDTH);
  const [listCollapsed, setListCollapsed] = useStored<boolean>("listCollapsed", false);
  const listWidth = Math.round(Math.min(Math.max(storedListWidth, MIN_LIST_WIDTH), Math.max(MIN_LIST_WIDTH, width * MAX_LIST_SHARE)));
  const listDocked = !overlayList && !listCollapsed;
  const compactBar = width - (listDocked ? listWidth : 0) < COMPACT_BAR_WIDTH;

  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const loadOverview = useCallback(() => {
    rpc.call("overview").then(
      (next) => {
        setOverview(next);
        setOverviewError(null);
      },
      (cause) => setOverviewError(errorMessage(cause)),
    );
  }, [rpc]);
  useEffect(loadOverview, [loadOverview]);

  const [storedEndpoint, setStoredEndpoint] = useStored<string | null>("endpoint", null);
  const [sourceOverrides, setSourceOverrides] = useStored<Record<string, string>>("sources", NO_OVERRIDES);
  const endpoint = overview?.endpoints.find((candidate) => candidate.name === storedEndpoint) ?? overview?.endpoints[0] ?? null;
  const sourceName = endpoint === null ? null : (sourceOverrides[endpoint.name] ?? endpoint.source);
  const servicesKey = endpoint === null || sourceName === null ? null : `${endpoint.name}|${sourceName}`;

  const services = useServices(servicesKey);
  useRealtime(CHANGED_CHANNEL, (payload) => {
    if (!isObject(payload) || payload.reason !== "config") return;
    loadOverview();
    // The host rebuilds descriptors only when the source config changed, so this is cheap otherwise.
    services.refresh();
  });
  const current = services.current;
  const serviceData = current?.data ?? null;

  const [storedMethod, setStoredMethod] = useStored<string | null>(`method:${endpoint?.name ?? ""}`, null);
  const method = useMemo(() => {
    if (serviceData === null || storedMethod === null) return null;
    for (const service of serviceData.services) {
      const found = service.methods.find((candidate) => candidate.fullName === storedMethod);
      if (found !== undefined) return found;
    }
    return null;
  }, [serviceData, storedMethod]);

  const { closure, closureError } = useTypeClosure(method, endpoint?.name ?? null, sourceName, serviceData?.state.loadedAt ?? 0);

  const streams = method !== null && isClientStreaming(method.kind);
  const defaultRequest = streams ? "[\n  {}\n]" : "{}";
  const [mode, setMode] = useStored<"form" | "json">("mode", "form");
  const [showDocs, setShowDocs] = useStored<boolean>("showDocs", false);
  const [requestText, setRequestText] = useStored<string>(`request:${method?.fullName ?? ""}`, defaultRequest);
  const [metadata, setMetadata] = useStored<MetadataRow[]>(`metadata:${endpoint?.name ?? ""}`, NO_METADATA);
  const [requestTab, setRequestTab] = useState<(typeof REQUEST_TABS)[number]>("body");
  const [responseTab, setResponseTab] = useState<ResponseTab>("response");
  const [timeout, setTimeoutText] = useState("");
  const [leftTab, setLeftTab] = useState<"methods" | "history">("methods");
  const [listOpen, setListOpen] = useState(false);
  const overlayPresence = usePresence(listOpen);
  /** Set once the user reopens the docked list, so it slides in then but not on first paint. */
  const [listReopened, setListReopened] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [endpointOpen, setEndpointOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  /** Latest result per endpoint + method; `recordedAt` marks one restored from history. */
  const [results, setResults] = useState<Record<string, { result: CallResult; recordedAt: number | null; historyId: number | null }>>({});
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const resultKey = endpoint === null || method === null ? "" : `${endpoint.name}|${method.fullName}`;
  const activeMetadata = metadata.filter((row) => row.enabled && row.name.trim() !== "");

  const callRequest = (endpointName: string, methodName: string) => {
    const seconds = Number(timeout);
    // RPC input must be strict JSON, so optional fields are omitted rather than set to undefined.
    return {
      endpoint: endpointName,
      ...(sourceName === null ? {} : { source: sourceName }),
      method: methodName,
      request: requestText,
      metadata: activeMetadata.map(({ name, value }) => ({ name: name.trim(), value })),
      ...(timeout.trim() !== "" && Number.isFinite(seconds) && seconds > 0 ? { timeoutSeconds: seconds } : {}),
    };
  };

  const send = () => {
    if (endpoint === null || method === null || sending) return;
    setConfirming(false);
    setSending(true);
    const key = resultKey;
    rpc.call("invoke", callRequest(endpoint.name, method.fullName)).then(
      (result) => {
        setResults((previous) => ({ ...previous, [key]: { result, recordedAt: null, historyId: null } }));
        setSending(false);
      },
      (cause) => {
        toast.error(errorMessage(cause));
        setSending(false);
      },
    );
  };
  const requestSend = () => {
    if (endpoint?.protected) setConfirming(true);
    else send();
  };
  const copyCommand = () => {
    if (endpoint === null || method === null) return;
    rpc
      .call("command", callRequest(endpoint.name, method.fullName))
      .then((result) => navigator.clipboard.writeText(result.command))
      .then(
        () => toast.success("Copied the grpcurl command"),
        (cause) => toast.error(errorMessage(cause)),
      );
  };
  const resetAuth = () => {
    rpc.call("resetAuth").then(
      (result) => toast.success(result.cleared === 0 ? "No cached tokens to forget" : "Cached tokens forgotten; the next call fetches new ones"),
      (cause) => toast.error(errorMessage(cause)),
    );
  };
  const fillExample = () => {
    if (method === null || closure === null) return;
    const example: JsonObject = exampleMessage(method.input, closure);
    setRequestText(JSON.stringify(streams ? [example] : example, null, 2));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      requestSend();
    }
  };
  const selectMethod = (next: MethodInfo) => {
    setStoredMethod(next.fullName);
    setShowComment(false);
    setListOpen(false);
  };
  const openHistory = (entry: HistoryEntry) => {
    writeStored(`method:${entry.endpoint}`, entry.method);
    writeStored(`request:${entry.method}`, entry.request);
    // History masks credential values; restoring "***" would override the real auth header.
    const restorable = entry.metadata.filter((row) => row.value !== MASKED_VALUE);
    if (restorable.length > 0) {
      const rows = [...readStored<MetadataRow[]>(`metadata:${entry.endpoint}`, NO_METADATA)];
      for (const row of restorable) {
        const index = rows.findIndex((candidate) => candidate.name === row.name);
        if (index === -1) rows.push({ ...row, enabled: true });
        else rows[index] = { ...rows[index]!, value: row.value, enabled: true };
      }
      writeStored(`metadata:${entry.endpoint}`, rows);
    }
    if (overview?.endpoints.some((candidate) => candidate.name === entry.endpoint)) {
      setSourceOverrides({ ...sourceOverrides, [entry.endpoint]: entry.source });
      setStoredEndpoint(entry.endpoint);
    }
    setRequestTab("body");
    setListOpen(false);
    const key = `${entry.endpoint}|${entry.method}`;
    rpc.call("historyResult", { id: entry.id }).then(
      ({ result }) => {
        if (result !== null) setResults((previous) => ({ ...previous, [key]: { result, recordedAt: entry.at, historyId: entry.id } }));
        else toast("This call was recorded before responses were kept in history; only its request was restored.");
      },
      (cause) => toast.error(errorMessage(cause)),
    );
  };

  const listRef = useRef<HTMLElement>(null);
  const methodListRef = useRef<MethodListHandle>(null);
  const historyListRef = useRef<HistoryListHandle>(null);
  const responseSearchRef = useRef<ResponseSearchHandle>(null);
  const requestPaneRef = useRef<HTMLDivElement>(null);
  /** The row the list cursor was last on, so keys resume there after focus leaves the list. */
  const lastRowKey = useRef<string | null>(null);
  /** The request field the cursor was last on; fields remount per method, so this is the element. */
  const lastFieldRow = useRef<HTMLElement | null>(null);
  /** Where hjkl go when focus is in neither pane. */
  const lastPane = useRef<Pane>("list");
  /** A new object per request, so asking for the same target again starts over. */
  const [pendingFocus, setPendingFocus] = useState<{ target: FocusTarget } | null>(null);
  const requestFocus = (target: FocusTarget) => setPendingFocus({ target });
  const listShown = overlayList ? listOpen : !listCollapsed;

  const showList = () => {
    if (overlayList) setListOpen(true);
    else {
      setListCollapsed(false);
      setListReopened(true);
    }
  };
  const revealList = (target: "cursor" | "search" | "filters") => {
    if (!listShown) showList();
    requestFocus(target);
  };
  /** Where the list cursor resumes: its last or open row; the toolbar above it only once the list has loaded with no rows. */
  const listResumeRow = (list: HTMLElement): HTMLElement | null => {
    const all = readRows(list).elements;
    const rows = all.filter((candidate) => !isToolbar(candidate));
    return (
      rows.find((candidate) => candidate.dataset.navKey === lastRowKey.current) ??
      rows.find((candidate) => candidate.getAttribute("aria-current") === "true") ??
      rows[0] ??
      (list.querySelector("[data-nav-loading]") === null ? (all[0] ?? null) : null)
    );
  };
  const landCursor = (list: HTMLElement): boolean => {
    const row = listResumeRow(list);
    if (row === null) return false;
    focusRow(row);
    return true;
  };
  const savedFieldRow = (): HTMLElement | null => {
    const row = lastFieldRow.current;
    return row !== null && row.isConnected && requestPaneRef.current?.contains(row) === true ? row : null;
  };
  /** The last or first field; a request with none (or in JSON) puts the cursor on the pane itself. */
  const fieldResumeTarget = (): HTMLElement | null => {
    const pane = requestPaneRef.current;
    if (pane === null) return null;
    return savedFieldRow() ?? readRows(pane).elements[0] ?? (pane.querySelector("[data-nav-loading]") === null ? pane : null);
  };
  const focusField = (target: HTMLElement) => {
    if (target === requestPaneRef.current) target.focus({ preventScroll: true });
    else focusRow(target);
  };
  const landFieldCursor = (): boolean => {
    const target = fieldResumeTarget();
    if (target === null) return false;
    focusField(target);
    return true;
  };
  /** Where a row cursor with none yet lands in `elements`: on `row`, else the first. */
  const startAt = (row: HTMLElement | null) => (elements: HTMLElement[]) => Math.max(0, row === null ? 0 : elements.indexOf(row));
  // After the render that asked, since a key's focus often waits on the panel it just opened.
  useEffect(() => {
    if (pendingFocus === null) return;
    const options = { timeoutMs: PENDING_FOCUS_MS };
    switch (pendingFocus.target) {
      case "cursor":
        return focusWhenShown(() => (listRef.current === null ? null : listResumeRow(listRef.current)), { ...options, focus: focusRow });
      case "fields":
        return focusWhenShown(fieldResumeTarget, { ...options, focus: focusField });
      case "response":
        return focusWhenShown(responseScroller, { ...options, focus: () => focusResponse() });
      case "search":
        // Like vim's /, typing starts a new search instead of extending the last one.
        return focusWhenShown(() => listRef.current?.querySelector<HTMLInputElement>(LIST_SEARCH) ?? null, { ...options, focus: (box) => (box as HTMLInputElement).select() });
      case "filters":
        return focusWhenShown(() => (methodListRef.current === null ? null : listRef.current), { ...options, focus: () => methodListRef.current?.openFilters() });
    }
  }, [pendingFocus]);

  const focusedRow = (container: HTMLElement | null): HTMLElement | null => {
    const row = document.activeElement?.closest<HTMLElement>(NAV_ROW) ?? null;
    return row !== null && container?.contains(row) === true ? row : null;
  };
  const responseScroller = () => root?.querySelector<HTMLElement>("[data-grpc-response-scroll]") ?? null;
  const currentPane = (): Pane => {
    const active = document.activeElement;
    if (requestPaneRef.current?.contains(active)) return "fields";
    if (listRef.current?.contains(active)) return "list";
    if (responseScroller()?.contains(active)) return "response";
    return lastPane.current;
  };
  const focusResponse = (): boolean => {
    const scroller = responseScroller();
    if (scroller === null) return false;
    lastPane.current = "response";
    scroller.focus({ preventScroll: true });
    return true;
  };
  const backToFields = () => {
    lastPane.current = "fields";
    if (!landFieldCursor()) backToList();
  };

  /** The response has no cursor: j/k scroll it a line, gg/G to its ends, and h goes back to the fields. */
  const moveResponse = (motion: ListMotion, count: number | null) => {
    const scroller = responseScroller();
    if (scroller === null || motion === "left") {
      backToFields();
      return;
    }
    scroller.focus({ preventScroll: true });
    if (motion !== "down" && motion !== "up" && motion !== "top" && motion !== "bottom") return;
    const line = parseFloat(getComputedStyle(scroller.querySelector("pre") ?? scroller).lineHeight) || 20;
    scrollPane(scroller, motion, { line, count });
  };
  const backToList = () => {
    lastPane.current = "list";
    if (listShown && listRef.current !== null) landCursor(listRef.current);
    else revealList("cursor");
  };

  const moveListCursor = (motion: ListMotion, count: number | null) => {
    const list = listRef.current;
    if (!listShown || list === null) {
      revealList("cursor");
      return;
    }
    const moved = runListMotion(list, motion, {
      count,
      start: startAt(listResumeRow(list)),
      onActivate: (row) => {
        row.click();
        // Opening a method from the keyboard carries the cursor on into its request fields.
        if (row.dataset.navKey?.startsWith("method:")) {
          lastPane.current = "fields";
          requestFocus("fields");
        }
      },
    });
    // h and l with no cursor in the list yet land it, as the other keys do.
    if (!moved && focusedRow(list) === null) landCursor(list);
  };

  const moveFieldCursor = (motion: ListMotion, count: number | null) => {
    const pane = requestPaneRef.current;
    if (pane === null) {
      backToList();
      return;
    }
    const cursor = focusedRow(pane);
    // A form without fields (JSON mode) still leads on to the response.
    if (motion === "right" && readRows(pane).elements.length === 0) {
      focusResponse();
      return;
    }
    // On a field, l and h step across the buttons beside its box instead of editing it, and l
    // past the last one moves on to the response.
    if (cursor !== null && cursor.dataset.navRow !== "group" && (motion === "right" || (motion === "left" && !(cursor instanceof HTMLButtonElement)))) {
      const cells = rowCells(cursor);
      const at = cells.indexOf(document.activeElement as HTMLElement);
      if (motion === "right") {
        const next = cells[at + 1];
        if (next !== undefined) next.focus({ preventScroll: true });
        else focusResponse();
        return;
      }
      if (at !== -1) {
        focusRow(cells[at - 1] ?? cursor);
        return;
      }
    }
    const moved = runListMotion(pane, motion, {
      count,
      start: startAt(savedFieldRow()),
      onActivate: (row) => {
        focusRow(row);
        activateFieldRow(row);
      },
    });
    if (moved) return;
    if (motion === "left") backToList();
    // h and l with no cursor in the fields yet land it, as the other keys do.
    else if (cursor === null) landFieldCursor();
  };

  /** Edits a field row, or presses its button; a "Set" button swaps the row for a section, which keeps the cursor. */
  const activateFieldRow = (row: HTMLElement, caret: Caret = "end") => {
    const pane = requestPaneRef.current;
    const index = pane === null ? -1 : readRows(pane).elements.indexOf(row);
    activateRow(row, caret);
    setTimeout(() => {
      if (row.isConnected || pane === null || index === -1) return;
      const replacement = readRows(pane).elements[index];
      if (replacement !== undefined) focusRow(replacement);
    }, 0);
  };

  const deleteField = (): boolean => {
    const pane = requestPaneRef.current;
    const row = focusedRow(pane) ?? savedFieldRow();
    if (pane === null || row === null) return false;
    const index = readRows(pane).elements.indexOf(row);
    if (!deleteRow(row)) return false;
    // A removed item plays its exit as an inert ghost and an unset section turns back into a
    // plain row, so the cursor takes whatever row now sits in the same place.
    setTimeout(() => {
      if (row.isConnected && row.closest("[inert]") === null) {
        focusRow(row);
        return;
      }
      const { elements } = readRows(pane);
      const next = elements[Math.min(index, elements.length - 1)];
      if (next !== undefined) focusRow(next);
    }, 0);
    return true;
  };

  /** Deletes the call under the cursor from history; the cursor takes the call that moves up into its place. */
  const deleteHistoryRow = (): boolean => {
    const list = listRef.current;
    const row = focusedRow(list);
    const button = row?.parentElement?.querySelector<HTMLButtonElement>("[data-history-delete]");
    if (list === null || row === null || button == null) return false;
    const index = readRows(list).elements.indexOf(row);
    button.click();
    setTimeout(() => {
      const { elements } = readRows(list);
      const next = elements[Math.min(index, elements.length - 1)];
      if (next !== undefined) focusRow(next);
    }, 0);
    return true;
  };

  const runCommand = (command: ClientCommand, { count }: KeyContext): boolean | void => {
    const hasMethod = endpoint !== null && method !== null;
    switch (command.kind) {
      case "list": {
        const pane = currentPane();
        if (pane === "fields") moveFieldCursor(command.motion, count);
        else if (pane === "response") moveResponse(command.motion, count);
        else moveListCursor(command.motion, count);
        return;
      }
      case "searchNext":
        return currentPane() === "response" && (responseSearchRef.current?.next(command.step, count) ?? false);
      case "search":
        if (currentPane() === "response" && responseSearchRef.current?.startSearch()) return;
        // Searches whichever the list shows: methods or call history.
        revealList(command.kind);
        return;
      case "filters":
        setLeftTab("methods");
        revealList(command.kind);
        return;
      case "endpoint":
        if (!listShown) showList();
        setEndpointOpen(true);
        return;
      case "history":
        setLeftTab(leftTab === "history" ? "methods" : "history");
        revealList("cursor");
        return;
      case "toggleList":
        if (!listShown) {
          revealList("cursor");
          return;
        }
        if (listRef.current?.contains(document.activeElement)) root?.focus({ preventScroll: true });
        if (overlayList) setListOpen(false);
        else setListCollapsed(true);
        return;
      case "edit": {
        const row = focusedRow(requestPaneRef.current) ?? savedFieldRow();
        if (row !== null) {
          activateFieldRow(row, command.caret);
          return;
        }
        const fields = [...(requestPaneRef.current?.querySelectorAll<HTMLElement>(REQUEST_FIELDS) ?? [])];
        const field = fields.find(isTextEntry) ?? fields[0];
        if (field === undefined) return false;
        editField(field, command.caret);
        field.scrollIntoView({ block: "nearest" });
        return;
      }
      case "requestTab":
        if (!hasMethod) return false;
        setRequestTab(cycle(REQUEST_TABS, requestTab, command.step));
        return;
      case "responseTab":
        if (results[resultKey] === undefined) return false;
        setResponseTab(cycle(RESPONSE_TABS, responseTab, command.step));
        // The new tab's scroller replaces the focused one.
        if (currentPane() === "response") requestFocus("response");
        return;
      case "mode":
        if (!hasMethod) return false;
        setMode(mode === "json" ? "form" : "json");
        setRequestTab("body");
        return;
      case "copyCommand": {
        const shownResult = results[resultKey]?.result;
        if (currentPane() === "response" && shownResult !== undefined) {
          navigator.clipboard.writeText(shownResult.responses.map(formatResponse).join("\n\n")).then(
            () => toast.success("Copied the response"),
            (cause) => toast.error(errorMessage(cause)),
          );
          return;
        }
        if (!hasMethod) return false;
        copyCommand();
        return;
      }
      case "scroll": {
        const pane = currentPane();
        if (pane === "response") {
          const scroller = responseScroller();
          if (scroller === null) return false;
          scrollPane(scroller, command.motion, { count, page: 1 });
          return;
        }
        const container = pane === "fields" ? requestPaneRef.current : listShown ? listRef.current : null;
        if (container === null) return false;
        const step = command.motion === "halfDown" || command.motion === "pageDown" ? 1 : -1;
        const share = command.motion === "halfDown" || command.motion === "halfUp" ? 0.5 : 1;
        const start = startAt(pane === "fields" ? savedFieldRow() : listResumeRow(container));
        if (!runListScroll(container, step, share, { start, count }) && pane === "fields") landFieldCursor();
        return;
      }
      case "delete": {
        const pane = currentPane();
        return pane === "fields" ? deleteField() : pane === "list" && deleteHistoryRow();
      }
      case "escape":
        if (currentPane() === "response" && responseSearchRef.current?.clear()) return;
        {
          // From a button beside a field's box, Escape goes back to the field.
          const row = focusedRow(requestPaneRef.current);
          if (row !== null && row !== document.activeElement) {
            focusRow(row);
            return;
          }
        }
        if (historyListRef.current?.clearSearch()) {
          revealList("cursor");
          return;
        }
        if (methodListRef.current?.clearSearch()) {
          // The result rows the cursor was on are gone; it goes back to the open method.
          if (method !== null) lastRowKey.current = `method:${method.fullName}`;
          revealList("cursor");
          return;
        }
        if (overlayList && listOpen) {
          setListOpen(false);
          return;
        }
        return false;
      case "help":
        setKeysOpen(true);
        return;
    }
  };
  const leaveField = (field: HTMLElement) => {
    if (!returnToRow(field)) root?.focus({ preventScroll: true });
  };
  useClientKeys(root, overview !== null && endpoint !== null, runCommand, leaveField);

  if (overview === null) {
    return <Centered>{overviewError === null ? "Loading…" : <span className="text-destructive">{overviewError}</span>}</Centered>;
  }
  if (endpoint === null) return <EmptyConfig errors={overview.errors} />;

  const errors = [...overview.errors, ...(overviewError ? [overviewError] : [])];
  const shown = results[resultKey] ?? null;
  const loadingServices = current?.status === "loading";
  const methodCount = serviceData?.services.reduce((count, service) => count + service.methods.length, 0) ?? 0;

  const startListResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = listWidth;
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const move = (moveEvent: PointerEvent) => {
      const next = startWidth + moveEvent.clientX - startX;
      if (next < COLLAPSE_LIST_WIDTH) {
        setListCollapsed(true);
        stop();
        return;
      }
      setListWidth(Math.max(MIN_LIST_WIDTH, next));
    };
    const stop = () => {
      document.body.style.userSelect = previousSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const list = (
    <aside
      ref={listRef}
      className={cn(
        "relative flex min-h-0 flex-col border-r border-border bg-background",
        overlayList ? "absolute inset-y-0 left-0 z-20 w-80 max-w-[85%] shadow-xl" : "shrink-0",
        overlayList ? (overlayPresence.exiting ? exit.fade : enter.slideLeft) : listReopened && enter.slideLeft,
      )}
      style={overlayList ? undefined : { width: listWidth }}
      onAnimationEnd={overlayList ? overlayPresence.onAnimationEnd : undefined}
      onFocus={(event) => {
        lastPane.current = "list";
        const key = (event.target as Element).closest<HTMLElement>(NAV_ROW)?.dataset.navKey;
        if (key !== undefined) lastRowKey.current = key;
      }}
    >
      <div className="flex items-center gap-1 border-b border-border px-1.5 py-1.5" data-nav-row="toolbar">
        <EndpointSwitcher
          overview={overview}
          endpoint={endpoint}
          sourceName={sourceName ?? ""}
          descriptors={serviceData?.state ?? null}
          loading={loadingServices}
          open={endpointOpen}
          onOpenChange={setEndpointOpen}
          onEndpoint={setStoredEndpoint}
          onSource={(next) => setSourceOverrides({ ...sourceOverrides, [endpoint.name]: next })}
          onReload={services.reload}
        />
        <button
          type="button"
          className={cn(
            "rounded-md p-1.5 text-muted-foreground hover:bg-state-hover hover:text-foreground",
            PRESS,
            FOCUS_RING,
            leftTab === "history" && "bg-state-active text-foreground",
          )}
          aria-label="Call history"
          aria-pressed={leftTab === "history"}
          title="Call history"
          onClick={() => setLeftTab(leftTab === "history" ? "methods" : "history")}
        >
          <Icon name="grpc-client/history" className="size-4" />
        </button>
        {overlayList ? (
          <button type="button" className={cx("rounded-md p-1.5 text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS, FOCUS_RING)} aria-label="Close method list" onClick={() => setListOpen(false)}>
            <Icon name="X" className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            className={cx("rounded-md p-1.5 text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS, FOCUS_RING)}
            aria-label="Collapse method list"
            title="Collapse method list"
            onClick={() => setListCollapsed(true)}
          >
            <Icon name="PanelLeft" className="size-4" />
          </button>
        )}
      </div>
      {leftTab === "history" ? (
        <HistoryList selectedId={shown?.historyId ?? null} handle={historyListRef} onOpen={openHistory} />
      ) : current?.status === "error" && serviceData === null ? (
        <div className="space-y-3 p-4">
          <p className="text-sm font-medium text-foreground">Could not load the protos</p>
          <p className="whitespace-pre-wrap break-words text-xs text-destructive">{current.error}</p>
          <Button variant="outline" size="sm" onClick={services.reload}>
            Try again
          </Button>
        </div>
      ) : serviceData === null ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground" data-nav-loading="">
          <Icon name="Spinner" className="size-4" />
          Loading protos…
        </div>
      ) : (
        <MethodList key={servicesKey ?? ""} services={serviceData.services} selected={method?.fullName ?? null} filterKey={sourceName ?? ""} handle={methodListRef} onSelect={selectMethod} />
      )}
      {overlayList ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize method list"
          title="Drag to resize · double-click to reset"
          className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize hover:bg-ring/30"
          onPointerDown={startListResize}
          onDoubleClick={() => setListWidth(DEFAULT_LIST_WIDTH)}
        />
      )}
    </aside>
  );

  const requestPane =
    method === null ? null : (
      <>
        <div
          ref={requestPaneRef}
          tabIndex={-1}
          className={cn("flex min-h-0 flex-1 flex-col overflow-auto px-4 py-3", FOCUS_RING)}
          onFocus={(event) => {
            lastPane.current = "fields";
            const row = (event.target as Element).closest<HTMLElement>(NAV_ROW);
            if (row !== null) lastFieldRow.current = row;
          }}
        >
          {requestTab === "body" ? (
            <EditorOptionsContext.Provider value={{ showDocs }}>
              <RequestBody key={method.fullName} method={method} closure={closure} closureError={closureError} mode={mode} text={requestText} onText={setRequestText} />
            </EditorOptionsContext.Provider>
          ) : null}
          {requestTab === "metadata" ? <MetadataEditor rows={metadata} endpoint={endpoint.name} onChange={setMetadata} /> : null}
          {requestTab === "options" ? (
            <div className={cx("max-w-2xl divide-y divide-border rounded-lg border border-border text-sm", enter.rise)} data-vim-ignore="">
              <label {...FIELD_ROW} className={cn("flex items-start gap-4 rounded-t-lg px-3 py-2.5", FOCUS_RING)}>
                <span className="w-20 shrink-0 pt-1.5 font-medium text-foreground">Deadline</span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input
                    className={cn(inputClass, "w-28")}
                    placeholder={String(overview.timeoutSeconds)}
                    inputMode="decimal"
                    value={timeout}
                    onChange={(event) => setTimeoutText(event.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">seconds (default {overview.timeoutSeconds})</span>
                </span>
              </label>
              <div className="flex items-start gap-4 px-3 py-2.5">
                <span className="w-20 shrink-0 font-medium text-foreground">Auth</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-muted-foreground">
                    {method.auth === null ? "No auth profile, so no token is added." : `Profile “${method.auth}”`}
                    {method.authReason ? ` · ${method.authReason}` : ""}
                  </p>
                  {method.auth !== null ? (
                    <Button variant="outline" size="sm" data-nav-row="item" onClick={resetAuth}>
                      Forget cached tokens
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="flex items-start gap-4 px-3 py-2.5">
                <span className="w-20 shrink-0 font-medium text-foreground">Types</span>
                <dl className="min-w-0 flex-1 space-y-1 font-mono text-xs">
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-muted-foreground">request</dt>
                    <dd className="min-w-0 break-all text-foreground">{method.input}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-16 shrink-0 text-muted-foreground">response</dt>
                    <dd className="min-w-0 break-all text-foreground">{method.output}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
        </div>
      </>
    );

  return (
    <div ref={rootRef} tabIndex={-1} data-grpc-keys="" className="flex h-full min-h-0 flex-1 flex-col outline-none" onKeyDown={onKeyDown}>
      {errors.length > 0 ? (
        <div role="alert" className={cx("border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive", enter.drop)}>
          {errors.join(" · ")}
        </div>
      ) : null}
      {current?.status === "error" && serviceData !== null ? (
        <div role="alert" className={cx("border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive", enter.drop)}>
          Reloading the protos failed, so the last good copy is shown: {current.error}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1">
        {(overlayList ? overlayPresence.mounted : !listCollapsed) ? list : null}
        {method === null ? (
          <Centered>
            {serviceData === null ? (
              current?.status === "error" ? (
                "The protos could not be loaded; the error is shown in the method list."
              ) : (
                "Loading protos…"
              )
            ) : (
              <>
                <p className="text-base font-medium text-foreground">Pick a method</p>
                <p>
                  {methodCount} methods across {serviceData.services.length} services. Search by service or method name.
                </p>
                <p className="text-xs text-muted-foreground/80">j and k move through the list, / searches, ? lists every shortcut</p>
                {listDocked ? null : (
                  <Button variant="outline" size="sm" onClick={showList}>
                    Browse methods
                  </Button>
                )}
              </>
            )}
          </Centered>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-3 border-b border-border px-3 py-2">
              {listDocked ? null : (
                <button
                  type="button"
                  className={cx("shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS)}
                  aria-label="Show method list"
                  title="Show method list"
                  onClick={showList}
                >
                  <Icon name="PanelLeft" className="size-4" />
                </button>
              )}
              <div key={method.fullName} className={cx("flex min-w-0 items-center gap-1.5", enter.fade, speed.fast)}>
                <h2 className="truncate text-sm font-semibold text-foreground" title={method.fullName}>
                  {method.name}
                </h2>
                <MethodBadges method={method} showAuthName={!compactBar} />
                {method.deprecated ? <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[10px] text-amber-800 dark:text-amber-200">deprecated</span> : null}
                {method.comment ? (
                  <button
                    type="button"
                    className={cn("shrink-0 rounded p-1 text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS, showComment && "text-foreground")}
                    aria-label="Show method description"
                    aria-expanded={showComment}
                    title={method.comment}
                    onClick={() => setShowComment(!showComment)}
                  >
                    <Icon name="grpc-client/info" className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <Tabs
                value={requestTab}
                onChange={setRequestTab}
                options={[
                  { id: "body", label: "Body" },
                  {
                    id: "metadata",
                    label: (
                      <>
                        Metadata{activeMetadata.length > 0 ? <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">{activeMetadata.length}</span> : null}
                      </>
                    ),
                  },
                  { id: "options", label: "Options" },
                ]}
              />
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {requestTab === "body" && !compactBar ? (
                  <Segmented
                    value={mode}
                    onChange={setMode}
                    options={[
                      { id: "form", label: "Form" },
                      { id: "json", label: "JSON" },
                    ]}
                  />
                ) : null}
                <Popover
                  open={moreOpen}
                  onOpenChange={setMoreOpen}
                  label="Request actions"
                  className="left-auto right-0 w-56"
                  trigger={
                    <button
                      type="button"
                      className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-state-hover hover:text-foreground", PRESS, moreOpen && "bg-state-active text-foreground")}
                      aria-label="More request actions"
                      aria-expanded={moreOpen}
                      title="More"
                      onClick={() => setMoreOpen(!moreOpen)}
                    >
                      <Icon name="MoreHorizontal" className="size-4" />
                    </button>
                  }
                >
                  <MenuItem
                    disabled={closure === null}
                    onClick={() => {
                      fillExample();
                      setRequestTab("body");
                      setMoreOpen(false);
                    }}
                  >
                    Fill with example
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setRequestText(defaultRequest);
                      setMoreOpen(false);
                    }}
                  >
                    Clear request
                  </MenuItem>
                  <MenuItem checked={showDocs} onClick={() => setShowDocs(!showDocs)}>
                    Show field docs
                  </MenuItem>
                  {compactBar ? (
                    <MenuItem
                      checked={mode === "json"}
                      onClick={() => {
                        setMode(mode === "json" ? "form" : "json");
                        setRequestTab("body");
                      }}
                    >
                      Edit as JSON
                    </MenuItem>
                  ) : null}
                  <div className="my-1 h-px bg-border" />
                  <MenuItem
                    onClick={() => {
                      copyCommand();
                      setMoreOpen(false);
                    }}
                  >
                    Copy as grpcurl command
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setMoreOpen(false);
                      setKeysOpen(true);
                    }}
                  >
                    <span className="flex items-center justify-between">
                      Keyboard shortcuts
                      <kbd className="font-mono text-xs text-muted-foreground">?</kbd>
                    </span>
                  </MenuItem>
                </Popover>
                <Button size="sm" className={cn("ml-1 h-7 px-3", endpoint.protected && "bg-amber-600 text-white hover:bg-amber-600/90")} disabled={sending} onClick={requestSend}>
                  <span key={sending ? "sending" : "idle"} className={cx("flex", sending ? cx(enter.fade, speed.fast) : enter.pop)}>
                    <Icon name={sending ? "Spinner" : "grpc-client/send"} className="size-3.5" />
                  </span>
                  {sending ? "Sending" : endpoint.protected ? `Send to ${endpoint.name}` : "Send"}
                </Button>
              </div>
            </div>
            {showComment && method.comment ? (
              <p className={cx("whitespace-pre-line border-b border-border bg-muted/30 px-4 py-2 text-sm text-muted-foreground", enter.drop, speed.fast)}>
                <span className="mb-1 block font-mono text-xs text-foreground">{method.fullName}</span>
                {method.comment}
              </p>
            ) : null}
            <SplitPane
              vertical={!sideBySide}
              first={requestPane}
              second={
                <div
                  className="contents"
                  onFocus={() => {
                    lastPane.current = "response";
                  }}
                >
                  <ResponseView result={shown?.result ?? null} recordedAt={shown?.recordedAt ?? null} sending={sending} tab={responseTab} onTab={setResponseTab} search={responseSearchRef} />
                </div>
              }
            />
          </div>
        )}
      </div>

      <KeysDialog open={keysOpen} onOpenChange={setKeysOpen} />
      <ConfirmSendDialog open={confirming} onOpenChange={setConfirming} endpoint={endpoint.name} target={endpoint.target} methodName={method?.name ?? null} onSend={send} />
    </div>
  );
}
