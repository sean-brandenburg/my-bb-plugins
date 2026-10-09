const DEFINITION_LINE_PATTERNS: RegExp[] = [
  /^\s*(?:(?:export|default|async|pub(?:\([^)]*\))?|static|public|private|protected|abstract|final|override|unsafe|const|declare)\s+)*(?:function\*?|class|interface|type|enum|struct|trait|impl|fn|func|def|module|namespace|describe|it|test|contract|object)\b/u,
  /^\s+(?:(?:public|private|protected|static|async|override|final|abstract|synchronized)\s+)*[\w<>[\],.? ]*\b[A-Za-z_$][\w$]*\s*\([^)]*\)\s*(?::\s*[^{;]+)?\{\s*$/u,
];

/** The nearest definition line above `line` with shallower indentation: what GitHub prints after `@@` in a hunk header. */
export function enclosingDefinition(lines: string[], line: number): string | null {
  const indentOf = (text: string) => text.length - text.trimStart().length;
  let start = line - 1;
  while (start < lines.length && (lines[start] ?? "").trim() === "") start += 1;
  const indent = indentOf(lines[start] ?? "");
  for (let i = Math.min(start, lines.length - 1) - 1; i >= 0; i--) {
    const text = lines[i] ?? "";
    if (text.trim() === "") continue;
    const depth = indentOf(text);
    if (depth >= indent && indent > 0) continue;
    if (DEFINITION_LINE_PATTERNS.some((pattern) => pattern.test(text))) return text.trim();
    if (depth === 0 && indent === 0) break;
  }
  return null;
}
