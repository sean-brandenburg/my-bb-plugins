import { createContext, useContext } from "react";

/** The container width, in rem, from which the file list shows and long lines scroll sideways instead of wrapping. */
export const WIDE_MIN_REM = 48;

/** Whether the view is at least `WIDE_MIN_REM` wide; the view root measures it and provides it. */
export const DiffLayoutContext = createContext(false);

export function useDiffWide(): boolean {
  return useContext(DiffLayoutContext);
}
