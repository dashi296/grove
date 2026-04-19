const FENCED_CODE_BLOCK_PATTERN = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?\n\2(?=\n|$)/gu;
const INLINE_CODE_PATTERN = /`[^`\n]*`/gu;
const ATX_HEADING_PATTERN = /^#{1,6}\s+.*$/gmu;
const TAG_PATTERN = /(^|[^\w/])#([\p{L}\p{N}_/-]+)/gu;

export function parseTags(content: string): string[] {
  const sanitizedContent = content
    .replace(FENCED_CODE_BLOCK_PATTERN, "\n")
    .replace(ATX_HEADING_PATTERN, "\n")
    .replace(INLINE_CODE_PATTERN, "");
  const tags: string[] = [];
  const seenTags = new Set<string>();

  for (const match of sanitizedContent.matchAll(TAG_PATTERN)) {
    const rawTag = match[2]?.trim() ?? "";
    const tag = rawTag.replace(/\/+$/u, "");

    if (tag.length === 0 || seenTags.has(tag)) {
      continue;
    }

    seenTags.add(tag);
    tags.push(tag);
  }

  return tags;
}
