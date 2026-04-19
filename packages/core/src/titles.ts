import { getFolderPathForNote, normalizeNoteFilePath } from "./folders";
import type { NoteFilePath } from "./folders";

export type DerivedNoteTitleSource = "frontmatter" | "heading" | "file-stem";

export type DerivedNoteTitle = {
  title: string;
  source: DerivedNoteTitleSource;
};

const FRONTMATTER_DELIMITER = "---";
const FRONTMATTER_END_DELIMITERS = new Set(["---", "..."]);
const FRONTMATTER_TITLE_PATTERN = /^title\s*:\s*(.+)$/i;
const INVALID_FILE_NAME_CHARACTERS = /[\p{Cc}<>:"/\\|?*]/gu;
const WHITESPACE = /\s+/g;

export function deriveNoteTitle(notePath: NoteFilePath, content: string): DerivedNoteTitle {
  const frontmatterTitle = findFrontmatterTitle(content);

  if (frontmatterTitle !== null) {
    return {
      title: frontmatterTitle,
      source: "frontmatter",
    };
  }

  const headingTitle = findFirstMarkdownHeading(content);

  if (headingTitle !== null) {
    return {
      title: headingTitle,
      source: "heading",
    };
  }

  return {
    title: getNoteFileStem(notePath),
    source: "file-stem",
  };
}

export function renameNoteFilePath(
  notePath: NoteFilePath,
  nextTitle: string,
  existingNotePaths: readonly NoteFilePath[],
): NoteFilePath {
  const fileName = `${sanitizeNoteFileStem(nextTitle)}.md`;
  const folderPath = getFolderPathForNote(notePath);
  const nextPath = normalizeNoteFilePath(
    folderPath === null ? fileName : `${folderPath}/${fileName}`,
  );

  const hasCollision = existingNotePaths.some((existingPath) => {
    return existingPath !== notePath && existingPath.toLowerCase() === nextPath.toLowerCase();
  });

  if (hasCollision) {
    throw new Error("A note already uses the target Markdown path.");
  }

  return nextPath;
}

function findFrontmatterTitle(content: string): string | null {
  const normalizedContent = content.startsWith("\uFEFF") ? content.slice(1) : content;
  const lines = normalizedContent.split(/\r?\n/u);

  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return null;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";

    if (FRONTMATTER_END_DELIMITERS.has(line)) {
      return null;
    }

    const match = FRONTMATTER_TITLE_PATTERN.exec(line);

    if (match === null) {
      continue;
    }

    const title = stripWrappingQuotes(match[1]?.trim() ?? "");

    if (title.length > 0) {
      return title;
    }
  }

  return null;
}

function findFirstMarkdownHeading(content: string): string | null {
  for (const line of content.split(/\r?\n/u)) {
    const trimmedLine = line.trimStart();

    if (!trimmedLine.startsWith("# ") || trimmedLine.startsWith("##")) {
      continue;
    }

    const title = stripClosingHeadingMarker(trimmedLine.slice(2).trim());

    if (title.length > 0) {
      return title;
    }
  }

  return null;
}

function stripClosingHeadingMarker(title: string): string {
  const trimmedTitle = title.trimEnd();
  const withoutHashes = trimmedTitle.replace(/\s+#+$/u, "");

  return withoutHashes.length > 0 ? withoutHashes : trimmedTitle;
}

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) {
    return value;
  }

  const firstCharacter = value[0];
  const lastCharacter = value[value.length - 1];

  if (
    (firstCharacter === "\"" && lastCharacter === "\"") ||
    (firstCharacter === "'" && lastCharacter === "'")
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function getNoteFileStem(notePath: NoteFilePath): string {
  const fileName = notePath.split("/").at(-1) ?? "Untitled.md";
  return fileName.replace(/\.md$/iu, "").trim() || "Untitled";
}

function sanitizeNoteFileStem(title: string): string {
  const sanitizedTitle = title
    .replace(INVALID_FILE_NAME_CHARACTERS, " ")
    .replace(WHITESPACE, " ")
    .trim()
    .replaceAll(".", " ")
    .replace(WHITESPACE, " ")
    .trim();

  return sanitizedTitle === "" ? "Untitled" : sanitizedTitle;
}
