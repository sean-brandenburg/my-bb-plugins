import { useMemo } from "react";
import { parse as parseYaml } from "yaml";
import { parseFrontmatter } from "../../shared/obsidian";

function formatValue(value: unknown): string {
  return Array.isArray(value)
    ? value.map(formatValue).join(", ")
    : value instanceof Date
      ? value.toISOString().slice(0, 10)
      : typeof value === "object" && value !== null
        ? JSON.stringify(value)
        : String(value);
}

/** The note's frontmatter as a key/value table; nothing when it is missing or not a YAML map. */
export function Properties({ content }: { content: string }) {
  const frontmatter = parseFrontmatter(content);
  const data = useMemo(() => {
    if (frontmatter === null) return null;
    try {
      const parsed: unknown = parseYaml(frontmatter.raw);
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [frontmatter?.raw]);
  if (data === null || Object.keys(data).length === 0) return null;
  return (
    <div className="ob-properties">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="ob-property">
          <span className="ob-property-key">{key}</span>
          <span className="ob-property-value">{formatValue(value)}</span>
        </div>
      ))}
    </div>
  );
}
