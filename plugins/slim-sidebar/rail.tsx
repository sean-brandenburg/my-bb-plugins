import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  experimental_Icon as Icon,
  experimental_SidebarNavigationIcon as NavigationIcon,
  experimental_useSidebarNavigation,
  type ExperimentalSidebarNavigationItem,
} from "@get-bb/plugin-sdk/app";

/** Space between a rail button and the tooltip or menu beside it. */
const POPOVER_GAP_PX = 8;

const BUTTON_CLASS =
  "relative flex size-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:pointer-events-none disabled:opacity-50";

function useAnchorRect(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    setRect(open ? (anchor.current?.getBoundingClientRect() ?? null) : null);
  }, [anchor, open]);
  return rect;
}

function Tooltip({
  anchor,
  open,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  children: ReactNode;
}) {
  const rect = useAnchorRect(anchor, open);
  if (rect === null) return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[70] flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
      style={{
        left: rect.right + POPOVER_GAP_PX,
        top: rect.top + rect.height / 2,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function RailButton({
  label,
  shortcut,
  active = false,
  disabled = false,
  onActivate,
  children,
}: {
  label: string;
  shortcut?: string | null;
  active?: boolean;
  disabled?: boolean;
  onActivate: (openInSplit: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-current={active ? "page" : undefined}
        disabled={disabled}
        className={`${BUTTON_CLASS} ${active ? "bg-sidebar-accent text-sidebar-foreground" : ""}`}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        onClick={(event) => {
          setHover(false);
          onActivate(event.metaKey || event.ctrlKey);
        }}
      >
        {children}
      </button>
      <Tooltip anchor={ref} open={hover}>
        <span>{label}</span>
        {shortcut ? (
          <kbd className="font-sans text-muted-foreground">{shortcut}</kbd>
        ) : null}
      </Tooltip>
    </>
  );
}

function ItemButton({
  item,
  active,
  onActivate,
}: {
  item: ExperimentalSidebarNavigationItem;
  active: boolean;
  onActivate: (openInSplit: boolean) => void;
}) {
  const Accessory = item.experimental_Accessory;
  return (
    <RailButton
      label={item.label}
      shortcut={item.shortcut?.label}
      active={active}
      disabled={item.isDisabled || item.isLoading}
      onActivate={onActivate}
    >
      <NavigationIcon icon={item.icon} className="size-[18px]" />
      {Accessory ? (
        <span className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 origin-top-right scale-[0.8] items-center justify-center overflow-hidden rounded-full bg-sidebar-accent px-0.5 text-[10px] leading-none text-sidebar-foreground">
          <Accessory />
        </span>
      ) : null}
    </RailButton>
  );
}

function MoreMenu({
  hidden,
  onActivate,
  onCustomize,
}: {
  hidden: readonly ExperimentalSidebarNavigationItem[];
  onActivate: (item: ExperimentalSidebarNavigationItem) => void;
  onCustomize: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const rect = useAnchorRect(anchor, open);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menu.current?.contains(target) &&
        !anchor.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);
  const choose = (run: () => void) => {
    setOpen(false);
    run();
  };
  return (
    <div ref={anchor}>
      <RailButton label="More" onActivate={() => setOpen((value) => !value)}>
        <Icon name="MoreHorizontal" className="size-[18px]" />
      </RailButton>
      {rect
        ? createPortal(
            <div
              ref={menu}
              role="menu"
              aria-label="More navigation"
              className="fixed z-[70] min-w-44 rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-lg"
              style={{ left: rect.right + POPOVER_GAP_PX, top: rect.top }}
            >
              {hidden.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.isDisabled || item.isLoading}
                  className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-state-hover disabled:opacity-50"
                  onClick={() => choose(() => onActivate(item))}
                >
                  <NavigationIcon icon={item.icon} className="size-4" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
              {hidden.length > 0 ? (
                <div className="my-1 border-t border-border" />
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-state-hover"
                onClick={() => choose(onCustomize)}
              >
                <Icon name="Settings" className="size-4" />
                Customize sidebar
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function SlimNavigation() {
  const { items, activeItemId, actions } = experimental_useSidebarNavigation();
  const visible = items.filter((item) => item.isVisible);
  const hidden = items.filter((item) => !item.isVisible);
  return (
    <div
      className="flex flex-col items-center gap-1 py-2"
      data-testid="slim-sidebar-navigation"
    >
      {visible.map((item) => (
        <ItemButton
          key={item.id}
          item={item}
          active={item.id === activeItemId && item.action.kind !== "new-thread"}
          onActivate={(openInSplit) =>
            actions.activate(item.id, { openInSplit })
          }
        />
      ))}
      <MoreMenu
        hidden={hidden}
        onActivate={(item) => actions.activate(item.id, { openInSplit: false })}
        onCustomize={() => actions.openCustomize()}
      />
    </div>
  );
}
