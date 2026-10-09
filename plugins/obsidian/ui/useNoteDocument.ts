// A note's editing session: loads it, autosaves with compare-and-swap, merges
// disk changes into unsaved edits, and keeps unsavable edits as a local draft.
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { experimental_usePluginId } from "@get-bb/plugin-sdk/app";
import { errorMessage } from "../shared/errors";
import { mergeText } from "../shared/merge";
import { isNotePath, noteTitle } from "../shared/obsidian";
import { publishLiveDoc, registerNoteFlusher } from "./state";
import { useVaultChanges, type VaultRpc } from "./vault-client";

export type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

const AUTOSAVE_DELAY_MS = 700;

function readDraft(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDraft(key: string, content: string): void {
  try {
    window.localStorage.setItem(key, content);
  } catch {
    // Storage full or disabled; nothing more can be done synchronously.
  }
}

function removeDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore: the draft simply lingers until the next successful save.
  }
}

const MISSING_FILE_ERROR = /ENOENT|no such file|not exist/i;

export function useNoteDocument({ path, vaultPath, rpc }: { path: string; vaultPath: string; rpc: VaultRpc }) {
  const isNote = isNotePath(path);
  const pluginId = experimental_usePluginId();
  const [doc, setDoc] = useState<{ content: string; version: number } | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; missing: boolean } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [draft, setDraft] = useState<string | null>(null);
  const draftKey = `${pluginId}:draft:${vaultPath}:${path}`;

  const baseSha = useRef<string | null>(null);
  const savedContent = useRef<string>("");
  const latest = useRef<string>("");
  const conflicted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionRef = useRef(0);
  /** Saves run one at a time so each uses the sha its predecessor produced. */
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const savesPending = useRef(0);
  /** Bumped around every save so a read issued before one can be recognized as stale. */
  const generation = useRef(0);
  const recheckAfterSave = useRef(false);

  const isDirty = () => latest.current !== savedContent.current;

  const showDocument = useCallback(
    (content: string) => {
      versionRef.current += 1;
      setDoc({ content, version: versionRef.current });
      publishLiveDoc(path, content);
    },
    [path],
  );

  const adoptDisk = useCallback(
    (note: { content: string; sha256: string }) => {
      baseSha.current = note.sha256;
      savedContent.current = note.content;
      latest.current = note.content;
      conflicted.current = false;
      showDocument(note.content);
      setSaveState("saved");
    },
    [showDocument],
  );

  const load = useCallback(async () => {
    if (!isNote) return;
    generation.current += 1;
    const issued = generation.current;
    try {
      const note = await rpc.call("read", { path });
      if (issued !== generation.current) return;
      adoptDisk(note);
      setLoadError(null);
      const stored = readDraft(draftKey);
      if (stored !== null && stored !== note.content) setDraft(stored);
      else removeDraft(draftKey);
    } catch (cause) {
      const message = errorMessage(cause);
      setLoadError({ message, missing: MISSING_FILE_ERROR.test(message) });
    }
  }, [rpc, path, isNote, adoptDisk, draftKey]);

  useEffect(() => {
    setDoc(null);
    setLoadError(null);
    void load();
  }, [load]);

  /**
   * Merges a disk change (a capture, an agent edit) into unsaved local edits.
   * The editor picks up the merged text, which schedules the next save.
   */
  const rebaseOnto = (note: { content: string; sha256: string }): boolean => {
    const merged = mergeText(latest.current, savedContent.current, note.content);
    if (merged === null) return false;
    baseSha.current = note.sha256;
    savedContent.current = note.content;
    showDocument(merged);
    latest.current = merged;
    return true;
  };

  const syncFromDisk = useCallback(async (): Promise<void> => {
    if (!isNote || conflicted.current) return;
    if (savesPending.current > 0) {
      recheckAfterSave.current = true;
      return;
    }
    const issued = generation.current;
    let note;
    try {
      note = await rpc.call("read", { path });
    } catch {
      return;
    }
    if (issued !== generation.current) {
      // A save ran while the read was in flight, so the response may predate it.
      void syncFromDisk();
      return;
    }
    if (note.sha256 === baseSha.current) return;
    if (note.content === latest.current) {
      baseSha.current = note.sha256;
      savedContent.current = note.content;
      setSaveState("saved");
    } else if (!isDirty()) {
      adoptDisk(note);
    } else if (!rebaseOnto(note)) {
      conflicted.current = true;
      setSaveState("conflict");
    }
  }, [rpc, path, isNote, adoptDisk]);

  const runSave = useCallback(async () => {
    const content = latest.current;
    if (conflicted.current || content === savedContent.current) {
      if (!conflicted.current) setSaveState("saved");
      return;
    }
    generation.current += 1;
    setSaveState("saving");
    try {
      const result = await rpc.call("write", { path, content, expectedSha256: baseSha.current });
      if (result.outcome === "written") {
        baseSha.current = result.sha256;
        savedContent.current = content;
        removeDraft(draftKey);
      } else {
        const disk = await rpc.call("read", { path }).catch(() => null);
        if (disk !== null && disk.content === content) {
          baseSha.current = disk.sha256;
          savedContent.current = content;
        } else if (disk === null || !rebaseOnto(disk)) {
          conflicted.current = true;
        }
      }
      setSaveState(conflicted.current ? "conflict" : isDirty() ? "dirty" : "saved");
    } catch (cause) {
      setSaveState("error");
      toast.error(`Couldn't save ${noteTitle(path)}: ${errorMessage(cause)}`);
    } finally {
      generation.current += 1;
    }
  }, [rpc, path, draftKey]);

  /** Saves pending edits now; resolves once every earlier save has finished too. */
  const flush = useCallback((): Promise<void> => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    savesPending.current += 1;
    const next = saveChain.current.then(runSave).finally(() => {
      savesPending.current -= 1;
      if (savesPending.current === 0 && recheckAfterSave.current) {
        recheckAfterSave.current = false;
        void syncFromDisk();
      }
    });
    saveChain.current = next.catch(() => undefined);
    return next;
  }, [runSave, syncFromDisk]);

  useEffect(() => registerNoteFlusher(path, flush), [path, flush]);

  // Leaving the note saves what's pending. Edits that still can't be saved
  // (a conflict, or the window closing mid-save) are kept as a local draft.
  useEffect(() => {
    const keepDraft = () => {
      if (isNote && isDirty()) writeDraft(draftKey, latest.current);
    };
    window.addEventListener("pagehide", keepDraft);
    return () => {
      window.removeEventListener("pagehide", keepDraft);
      if (!isNote) return;
      keepDraft();
      void flush().then(() => {
        if (isDirty()) toast.error(`Couldn't save your last changes to ${noteTitle(path)}. They're kept as a draft; reopen the note to restore them.`);
        else removeDraft(draftKey);
      });
    };
  }, [isNote, flush, draftKey, path]);

  const onChange = useCallback(
    (content: string) => {
      latest.current = content;
      publishLiveDoc(path, content);
      if (conflicted.current) return;
      setSaveState("dirty");
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [path, flush],
  );

  /** For edits made outside the editor (reading-view checkboxes, restoring a draft). */
  const onReaderChange = useCallback(
    (content: string) => {
      showDocument(content);
      onChange(content);
    },
    [showDocument, onChange],
  );

  useVaultChanges((payload) => {
    if (payload.paths.includes(path) || (payload.structural && payload.paths.length === 0)) void syncFromDisk();
  });

  const keepMine = async () => {
    const current = await rpc.call("read", { path }).catch(() => null);
    baseSha.current = current?.sha256 ?? null;
    savedContent.current = current?.content ?? "";
    conflicted.current = false;
    await flush();
  };

  const restoreDraft = () => {
    if (draft === null) return;
    setDraft(null);
    onReaderChange(draft);
  };

  const discardDraft = () => {
    setDraft(null);
    removeDraft(draftKey);
  };

  return { doc, loadError, saveState, draft, load, flush, onChange, onReaderChange, keepMine, restoreDraft, discardDraft };
}
