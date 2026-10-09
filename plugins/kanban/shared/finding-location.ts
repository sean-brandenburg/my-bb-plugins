import type { Finding } from "./review";

/** `file`, `file:12` or `file:12-20`: how a finding cites where it applies. */
export function locationLabel(location: Finding["locations"][number]): string {
  if (location.startLine === null) return location.file;
  if (location.endLine === null || location.endLine === location.startLine) return `${location.file}:${location.startLine}`;
  return `${location.file}:${location.startLine}-${location.endLine}`;
}
