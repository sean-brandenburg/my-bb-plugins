import {
  experimental_Icon as Icon,
  experimental_useProviders,
  useComposer,
  useSdk,
} from "@get-bb/plugin-sdk/app";
import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ANCHOR_ATTRIBUTE,
  COMPOSER,
  type FooterSlots,
  PART_ATTRIBUTE,
  type PartName,
  SLOT_ATTRIBUTE,
  ensureFooterSlots,
} from "./footer-style.js";
import {
  type CatalogModel,
  type ContextUsage,
  type RateLimitWindow,
  formatContext,
  rateLimitNotice,
  resolveModelName,
} from "./format.js";

const RUNNING_REFRESH_MS = 5000;

type Sdk = ReturnType<typeof useSdk>;

// Rendered as a hidden composer banner so it is bound to one composer in
// both layouts, then portalled into that composer's footer.
export function FooterStatus() {
  const composer = useComposer();
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const slots = useFooterSlots(anchor);
  const threadId = composer.scope.kind === "thread" ? composer.scope.threadId : null;
  const attributes = { [ANCHOR_ATTRIBUTE]: "" };
  return (
    <span ref={setAnchor} hidden {...attributes}>
      {threadId !== null ? (
        <StatusSegments
          slots={slots}
          threadId={threadId}
          isRunning={composer.isRunning}
          providerId={composer.selection?.providerId ?? null}
          model={composer.selection?.model ?? null}
          reasoningLevel={composer.selection?.reasoningLevel ?? null}
        />
      ) : null}
    </span>
  );
}

function sameSlots(a: FooterSlots, b: FooterSlots): boolean {
  return a.agent === b.agent && a.usage === b.usage && a.context === b.context;
}

function useFooterSlots(anchor: HTMLElement | null): FooterSlots {
  const [slots, setSlots] = useState<FooterSlots>({});
  useEffect(() => {
    const root = anchor?.closest(COMPOSER);
    if (!root) return;
    let current: FooterSlots = {};
    const sync = () => {
      const next = ensureFooterSlots(root);
      if (!sameSlots(next, current)) {
        current = next;
        setSlots(next);
      }
    };
    // bb re-renders the footer when the composer switches layout.
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true });
    sync();
    return () => {
      observer.disconnect();
      for (const slot of root.querySelectorAll(`[${SLOT_ATTRIBUTE}]`)) slot.remove();
      setSlots({});
    };
  }, [anchor]);
  return slots;
}

function Part(props: { name: PartName; title?: string; children: ReactNode; blocked?: boolean }) {
  const attributes = {
    [PART_ATTRIBUTE]: props.name,
    ...(props.blocked ? { "data-blocked": "" } : {}),
  };
  return (
    <span title={props.title} {...attributes}>
      {props.children}
    </span>
  );
}

function StatusSegments(props: {
  slots: FooterSlots;
  threadId: string;
  isRunning: boolean;
  providerId: string | null;
  model: string | null;
  reasoningLevel: string | null;
}) {
  const { slots } = props;
  const modelName = useModelName(props.providerId, props.model);
  const effort = useEffortLabel(props.providerId, props.reasoningLevel);
  const usage = useThreadUsage(props.threadId, props.isRunning);
  const context = formatContext(usage.context);
  const limit = rateLimitNotice(usage.rateLimits, Date.now());
  const modelTitle =
    modelName === null ? undefined : effort === null ? `Model: ${modelName}` : `Model: ${modelName}, effort: ${effort}`;

  return (
    <>
      {slots.agent && modelName !== null
        ? createPortal(
            <span className="contents" title={modelTitle}>
              <Part name="model">{modelName}</Part>
              {effort === null ? null : (
                <>
                  <Part name="effort-separator">·</Part>
                  <Part name="effort">{effort}</Part>
                </>
              )}
            </span>,
            slots.agent,
          )
        : null}
      {slots.usage && limit !== null
        ? createPortal(
            <Part name="limit" title={limit.title} blocked={limit.blocked}>
              <Icon name="AlertTriangle" className="size-3.5" aria-hidden />
              {limit.text}
            </Part>,
            slots.usage,
          )
        : null}
      {slots.context && context !== null
        ? createPortal(
            <Part
              name="tokens-used"
              title={context.window === null ? undefined : `${context.used} of ${context.window} tokens`}
            >
              {context.used}
            </Part>,
            slots.context,
          )
        : null}
    </>
  );
}

const modelCatalogs = new Map<string, Promise<readonly CatalogModel[]>>();

function loadModelCatalog(sdk: Sdk, providerId: string): Promise<readonly CatalogModel[]> {
  let catalog = modelCatalogs.get(providerId);
  if (catalog === undefined) {
    catalog = sdk.providers.models({ providerId }).then(
      (result) => result.models,
      (error: unknown) => {
        modelCatalogs.delete(providerId);
        throw error;
      },
    );
    modelCatalogs.set(providerId, catalog);
  }
  return catalog;
}

function useModelName(providerId: string | null, model: string | null): string | null {
  const sdk = useSdk();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(model);
    if (providerId === null || model === null) return;
    let cancelled = false;
    loadModelCatalog(sdk, providerId).then(
      (catalog) => {
        if (!cancelled) setName(resolveModelName(catalog, model));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [sdk, providerId, model]);
  return name;
}

function useEffortLabel(providerId: string | null, level: string | null): string | null {
  const { providers } = experimental_useProviders();
  if (level === null) return null;
  const provider = providers.find((candidate) => candidate.id === providerId);
  return provider?.reasoningLevels?.find((candidate) => candidate.id === level)?.label ?? level;
}

interface ThreadUsage {
  context: ContextUsage | null;
  rateLimits: readonly RateLimitWindow[];
}

function useThreadUsage(threadId: string, isRunning: boolean): ThreadUsage {
  const sdk = useSdk();
  const [usage, setUsage] = useState<ThreadUsage>({ context: null, rateLimits: [] });
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [contextRows, limitRows] = await Promise.all([
          sdk.threads.events.list({
            threadId,
            types: ["thread/contextWindowUsage/updated"],
            order: "desc",
            limit: "1",
            signal: controller.signal,
          }),
          sdk.threads.events.list({
            threadId,
            types: ["provider/rateLimits/updated"],
            order: "desc",
            limit: "1",
            signal: controller.signal,
          }),
        ]);
        if (controller.signal.aborted) return;
        const contextRow = contextRows[0];
        const limitRow = limitRows[0];
        setUsage({
          context:
            contextRow?.type === "thread/contextWindowUsage/updated"
              ? contextRow.data.contextWindowUsage
              : null,
          rateLimits:
            limitRow?.type === "provider/rateLimits/updated"
              ? limitRow.data.rateLimits.windows
              : [],
        });
      } catch {
        // A failed refresh keeps the last values; the next change retries.
      } finally {
        inFlight = false;
      }
    };
    void load();
    const unsubscribe = sdk.subscribe({
      event: "thread:changed",
      threadId,
      callback: () => void load(),
    });
    // Usage events don't change the thread record, so poll while a turn runs.
    const timer = isRunning ? setInterval(() => void load(), RUNNING_REFRESH_MS) : undefined;
    return () => {
      controller.abort();
      unsubscribe();
      if (timer !== undefined) clearInterval(timer);
    };
  }, [sdk, threadId, isRunning]);
  return usage;
}
