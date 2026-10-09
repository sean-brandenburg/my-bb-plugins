import { useMemo, useSyncExternalStore } from "react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";

export interface PierreThemes {
  dark: string;
  light: string;
}

// A JSON snapshot keeps useSyncExternalStore's identity check stable between attribute changes.
function readThemes(): string {
  const data = typeof document === "undefined" ? undefined : document.documentElement.dataset;
  return JSON.stringify({ dark: data?.bbCodeThemeDark ?? "github-dark", light: data?.bbCodeThemeLight ?? "github-light" });
}

function subscribeToThemes(listener: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-bb-code-theme-dark", "data-bb-code-theme-light"] });
  return () => observer.disconnect();
}

/**
 * The Pierre theme names the host itself renders with. bb registers its code
 * theme in the shared highlighter and publishes the registered names on the
 * document element, so these are the only names guaranteed to resolve.
 */
export function useHostPierreThemes(): PierreThemes {
  const json = useSyncExternalStore(subscribeToThemes, readThemes, readThemes);
  return useMemo(() => JSON.parse(json) as PierreThemes, [json]);
}

/** The host theme name for the current light or dark mode, for Shiki. */
export function useHostThemeName(): string {
  const { mode } = useCodeTheme();
  const themes = useHostPierreThemes();
  return mode === "dark" ? themes.dark : themes.light;
}
