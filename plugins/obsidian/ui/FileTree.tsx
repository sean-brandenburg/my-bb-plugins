import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { CHEVRON, STAGGER, cx, enter, speed, stagger } from "bb-motion";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { VaultTree } from "../contract";
import { basename, dirname, isNotePath, noteTitle } from "../shared/obsidian";
import { fileIcon } from "./file-kinds";
import { canMoveInto } from "./vault-nav";

interface TreeNode {
  name: string;
  path: string;
  kind: "folder" | "file";
  children: TreeNode[];
}

export interface FileTreeActions {
  open: (path: string) => void;
  newNote: (folder: string) => void;
  newFolder: (folder: string) => void;
  rename: (path: string, newName: string) => void;
  remove: (path: string) => void;
  move: (path: string, toFolder: string) => void;
}

interface FileTreeProps {
  tree: VaultTree;
  currentPath: string | null;
  expanded: readonly string[];
  setExpanded: (next: string[]) => void;
  renaming: string | null;
  setRenaming: (path: string | null) => void;
  /** The file or folder `x` marked to move. */
  cutPath: string | null;
  actions: FileTreeActions;
}

const DRAG_TYPE = "application/x-obsidian-vault-path";

// A folder's rows cascade in when it opens. A tighter cap than bb-motion's
// default keeps a big folder from trickling in; groups inherit it.
const TREE_STAGGER_CAP = { "--bbm-stagger-cap": 6 } as CSSProperties;

function buildTree(tree: VaultTree): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "folder", children: [] };
  const folders = new Map<string, TreeNode>([["", root]]);
  const folderNode = (path: string): TreeNode => {
    const existing = folders.get(path);
    if (existing !== undefined) return existing;
    const node: TreeNode = { name: basename(path), path, kind: "folder", children: [] };
    folders.set(path, node);
    folderNode(dirname(path)).children.push(node);
    return node;
  };
  for (const folder of tree.folders) folderNode(folder);
  for (const file of tree.files) {
    folderNode(dirname(file.path)).children.push({ name: basename(file.path), path: file.path, kind: "file", children: [] });
  }
  const sort = (node: TreeNode) => {
    node.children.sort((a, b) =>
      a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
    node.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    // The input is about to unmount; its row keeps the keys.
    if (document.activeElement === ref.current) ref.current?.closest<HTMLElement>("[data-nav-row]")?.focus({ preventScroll: true });
    onDone(next);
  };
  return (
    <input
      ref={ref}
      value={value}
      aria-label="New name"
      data-vim-ignore
      className={cx("ob-tree-rename", enter.fade, speed.fast)}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(value);
        if (event.key === "Escape") finish(null);
      }}
    />
  );
}

export function FileTree({ tree, currentPath, expanded, setExpanded, renaming, setRenaming, cutPath, actions }: FileTreeProps) {
  const nodes = useMemo(() => buildTree(tree), [tree]);
  const expandedSet = useMemo(() => new Set(expanded), [expanded]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    if (currentPath === null) return;
    const ancestors: string[] = [];
    for (let folder = dirname(currentPath); folder !== ""; folder = dirname(folder)) ancestors.push(folder);
    if (ancestors.some((folder) => !expandedSet.has(folder))) setExpanded([...new Set([...expanded, ...ancestors])]);
    // Only reveal the active note when it changes, not whenever the user collapses a folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const toggle = (path: string) =>
    setExpanded(expandedSet.has(path) ? expanded.filter((entry) => entry !== path) : [...expanded, path]);

  const dropProps = (folder: string) => ({
    onDragOver(event: DragEvent) {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTarget(folder);
    },
    onDragLeave(event: DragEvent) {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setDropTarget((current) => (current === folder ? null : current));
    },
    onDrop(event: DragEvent) {
      const path = event.dataTransfer.getData(DRAG_TYPE);
      setDropTarget(null);
      if (path === "") return;
      event.preventDefault();
      event.stopPropagation();
      if (!canMoveInto(path, folder)) return;
      actions.move(path, folder);
    },
  });

  const renderNode = (node: TreeNode, depth: number, index: number): ReactNode => {
    const isFolder = node.kind === "folder";
    const isOpen = isFolder && expandedSet.has(node.path);
    const label = isFolder ? node.name : isNotePath(node.path) ? noteTitle(node.path) : node.name;
    const row = (
      <div
        role="treeitem"
        aria-expanded={isFolder ? isOpen : undefined}
        aria-selected={node.path === currentPath}
        tabIndex={-1}
        data-nav-row={isFolder ? "group" : "item"}
        data-path={node.path}
        draggable={renaming !== node.path}
        onDragStart={(event) => {
          event.dataTransfer.setData(DRAG_TYPE, node.path);
          event.dataTransfer.effectAllowed = "move";
        }}
        onClick={() => (isFolder ? toggle(node.path) : actions.open(node.path))}
        className={cn(
          "ob-tree-row",
          node.path === currentPath && "ob-tree-row-active",
          dropTarget === node.path && "ob-tree-row-drop",
          !isFolder && !isNotePath(node.path) && "ob-tree-row-attachment",
          cutPath === node.path && "ob-tree-row-cut",
        )}
        style={{ paddingLeft: `${0.5 + depth * 0.9}rem` }}
        {...(isFolder ? dropProps(node.path) : {})}
      >
        {isFolder ? (
          // Wrapped because the row is a context-menu trigger: its data-state="open" would rotate a chevron sitting directly in it.
          <span className="ob-tree-chevron" data-bbm-open={isOpen}>
            <Icon name="ChevronRight" className={cx("ob-tree-icon", CHEVRON)} aria-hidden />
          </span>
        ) : (
          <Icon name={fileIcon(node.path)} fallback="File" className="ob-tree-icon" aria-hidden />
        )}
        {renaming === node.path ? (
          <RenameInput
            initial={label}
            onDone={(value) => {
              setRenaming(null);
              if (value !== null && value.trim() !== "" && value.trim() !== label) actions.rename(node.path, value.trim());
            }}
          />
        ) : (
          <span className="truncate">{label}</span>
        )}
      </div>
    );
    return (
      <div key={node.path} role="none" data-nav-group={isFolder ? "" : undefined} className={cx(enter.rise, speed.fast, STAGGER)} style={stagger(index)}>
        <ContextMenu>
          <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
          <ContextMenuContent>
            {isFolder ? (
              <>
                <ContextMenuItem onSelect={() => actions.newNote(node.path)}>
                  <Icon name="EditFile" fallback="Plus" aria-hidden />
                  New note
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => actions.newFolder(node.path)}>
                  <Icon name="FolderPlus" aria-hidden />
                  New folder
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            ) : null}
            <ContextMenuItem onSelect={() => setRenaming(node.path)}>
              <Icon name="Edit" aria-hidden />
              Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(node.path)}>
              <Icon name="Copy" aria-hidden />
              Copy path
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.remove(node.path)}>
              <Icon name="Trash2" aria-hidden />
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {isOpen ? (
          <div role="group">
            {node.children.map((child, childIndex) => renderNode(child, depth + 1, childIndex))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div
      role="tree"
      aria-label="Vault files"
      className={cn("ob-tree", dropTarget === "" && "ob-tree-drop")}
      style={TREE_STAGGER_CAP}
      {...dropProps("")}
    >
      {nodes.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">This vault is empty.</p> : nodes.map((node, index) => renderNode(node, 0, index))}
    </div>
  );
}
