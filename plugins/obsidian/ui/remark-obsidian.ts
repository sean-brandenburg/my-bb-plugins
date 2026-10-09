// Remark plugin that turns Obsidian syntax mdast's parser leaves as plain text
// (wikilinks, embeds, ==highlights==, #tags, callouts) into nodes carrying
// data-* attributes the reader's component overrides render.
import { HIGHLIGHT, TAG, WIKILINK, splitWikilink } from "../shared/obsidian";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

// Groups: 1-2 wikilink, 3 highlight, 4-5 tag.
const INLINE = new RegExp(`${WIKILINK.source}|${HIGHLIGHT.source}|${TAG.source}`, "gu");
const CALLOUT = /^\[!([\w-]+)\]([+-]?)[ \t]*([^\n]*)\n?/;
const SKIP_PARENTS = new Set(["link", "linkReference", "inlineCode", "code", "html"]);

function transformText(value: string): MdNode[] | null {
  const out: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(INLINE)) {
    const index = match.index!;
    if (match[2] !== undefined) {
      if (index > last) out.push({ type: "text", value: value.slice(last, index) });
      const { target, subpath, alias } = splitWikilink(match[2]);
      const props = { dataTarget: target, dataSubpath: subpath ?? "", dataAlias: alias ?? "" };
      if (match[1] === "!") {
        out.push({ type: "text", value: match[0], data: { hName: "span", hProperties: { ...props, dataEmbed: "true" } } });
      } else {
        const label = alias ?? (subpath === null ? target : target === "" ? subpath : `${target} › ${subpath}`);
        out.push({ type: "link", url: "#", data: { hProperties: { ...props, dataWikilink: "true" } }, children: [{ type: "text", value: label }] });
      }
    } else if (match[3] !== undefined) {
      if (index > last) out.push({ type: "text", value: value.slice(last, index) });
      out.push({ type: "text", value: match[3], data: { hName: "mark" } });
    } else {
      const lead = match[4] ?? "";
      const tagStart = index + lead.length;
      if (tagStart > last) out.push({ type: "text", value: value.slice(last, tagStart) });
      const tag = match[5]!;
      out.push({ type: "text", value: tag, data: { hName: "span", hProperties: { dataTag: tag.slice(1), className: ["ob-tag"] } } });
    }
    last = index + match[0].length;
  }
  if (out.length === 0) return null;
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function visit(node: MdNode): void {
  if (node.children === undefined || SKIP_PARENTS.has(node.type)) return;
  if (node.type === "blockquote") markCallout(node);
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.data === undefined && child.value !== undefined) {
      const replaced = transformText(child.value);
      if (replaced !== null) {
        next.push(...replaced);
        continue;
      }
    }
    visit(child);
    next.push(child);
  }
  node.children = next;
}

function markCallout(blockquote: MdNode): void {
  const paragraph = blockquote.children?.[0];
  const first = paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined;
  if (first?.type !== "text" || first.value === undefined) return;
  const match = CALLOUT.exec(first.value);
  if (match === null) return;
  const type = match[1]!.toLowerCase();
  const title = match[3]!.trim();
  first.value = first.value.slice(match[0].length);
  if (first.value === "" && paragraph!.children!.length > 1 && paragraph!.children![1]!.type === "break") {
    paragraph!.children!.splice(0, 2);
  } else if (first.value === "") {
    paragraph!.children!.splice(0, 1);
  }
  if (paragraph!.children!.length === 0) blockquote.children!.splice(0, 1);
  blockquote.data = {
    ...blockquote.data,
    hProperties: { dataCallout: type, dataCalloutTitle: title, dataCalloutFold: match[2] ?? "" },
  };
}

export function remarkObsidian() {
  return (tree: MdNode) => visit(tree);
}
