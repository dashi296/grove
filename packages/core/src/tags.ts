const MARKDOWN_LINK_RE = /\[[^\]\n]*\]\([^\n)]*\)/gu;
const BARE_URL_RE = /\bhttps?:\/\/[^\s<>()]+/gu;
const TAG_RE = /#([a-zA-Z][a-zA-Z0-9_-]*(?:\/[a-zA-Z][a-zA-Z0-9_-]*)*)(?![a-zA-Z0-9_/-])/gu;
const TAG_PREFIX_RE = /[&a-zA-Z0-9_\\]/u;
const ATX_HEADING_RE = /^[ ]{0,3}#{1,6}(\s|$)/u;
const INDENTED_CODE_BLOCK_RE = /^(?: {4,}|\t)/u;
const FENCE_RE = /^[ ]{0,3}(`{3,}|~{3,})(.*)$/u;

type ActiveFence = {
  marker: "`" | "~";
  length: number;
};

function getBacktickRunLength(line: string, startIndex: number): number {
  let endIndex = startIndex;

  while (line[endIndex] === "`") {
    endIndex += 1;
  }

  return endIndex - startIndex;
}

function findClosingBacktickRun(line: string, startIndex: number, runLength: number): number {
  for (let index = startIndex; index < line.length; index += 1) {
    if (line[index] !== "`") continue;

    const candidateLength = getBacktickRunLength(line, index);
    if (candidateLength === runLength) return index;

    index += candidateLength - 1;
  }

  return -1;
}

function stripInlineCodeSpans(line: string): string {
  let result = "";

  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "`") {
      result += line[index];
      continue;
    }

    const runLength = getBacktickRunLength(line, index);
    const closingIndex = findClosingBacktickRun(line, index + runLength, runLength);

    if (closingIndex === -1) {
      result += line.slice(index, index + runLength);
      index += runLength - 1;
      continue;
    }

    index = closingIndex + runLength - 1;
  }

  return result;
}

function hasValidTagPrefix(line: string, hashIndex: number): boolean {
  if (hashIndex === 0) {
    return true;
  }

  const previousCharacter = line[hashIndex - 1];
  return previousCharacter === undefined || !TAG_PREFIX_RE.test(previousCharacter);
}

export function parseMarkdownTags(content: string): string[] {
  const tags = new Set<string>();
  let activeFence: ActiveFence | null = null;

  for (const line of content.split("\n")) {
    const fenceMatch = line.match(FENCE_RE);

    if (fenceMatch !== null) {
      const fence = fenceMatch[1] ?? "";
      const trailingText = fenceMatch[2] ?? "";

      if (activeFence === null) {
        activeFence = {
          marker: fence[0] === "~" ? "~" : "`",
          length: fence.length,
        };
        continue;
      }

      if (
        fence.startsWith(activeFence.marker) &&
        fence.length >= activeFence.length &&
        trailingText.trim() === ""
      ) {
        activeFence = null;
        continue;
      }
    }

    if (activeFence !== null) continue;

    if (ATX_HEADING_RE.test(line) || INDENTED_CODE_BLOCK_RE.test(line)) continue;

    const withoutSpans = stripInlineCodeSpans(line);
    const withoutLinks = withoutSpans.replace(MARKDOWN_LINK_RE, "").replace(BARE_URL_RE, "");

    for (const match of withoutLinks.matchAll(TAG_RE)) {
      if (!hasValidTagPrefix(withoutLinks, match.index)) continue;

      const tag = match[1];
      if (tag !== undefined) {
        tags.add(tag.toLowerCase());
      }
    }
  }

  return [...tags].sort();
}
