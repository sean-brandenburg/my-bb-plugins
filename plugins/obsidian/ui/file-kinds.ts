import { extension, isNotePath } from "../shared/obsidian";

export const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"]);

/** Extensions that mark a link target as a file rather than a note name with a dot in it. */
export const ATTACHMENT_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, "pdf", "canvas", "base", "mp3", "m4a", "wav", "ogg", "mp4", "webm", "mov", "zip", "csv", "json"]);

export function isImagePath(path: string): boolean {
  return IMAGE_EXTENSIONS.has(extension(path));
}

export function fileIcon(path: string): string {
  if (isNotePath(path)) return "FileText";
  const ext = extension(path);
  if (IMAGE_EXTENSIONS.has(ext)) return "FileAttachment";
  if (ext === "canvas") return "GridView";
  return "File";
}
