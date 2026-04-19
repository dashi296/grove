import { compareWorkspacePaths, normalizeFolderPath, normalizeNoteFilePath } from "@grove/core";
import type { FolderScope, NoteFilePath } from "@grove/core";

const INVALID_FILE_NAME_CHARACTERS = /[\p{Cc}<>:"/\\|?*]/gu;
const WHITESPACE = /\s+/g;

export function createNewNotePath(
  title: string,
  selectedFolderPath: FolderScope,
  existingNotePaths: readonly NoteFilePath[],
): NoteFilePath {
  const fileStem = sanitizeNoteFileStem(title);
  const existingPathSet = new Set(existingNotePaths.map((path) => path.toLowerCase()));

  for (let duplicateIndex = 0; duplicateIndex < Number.MAX_SAFE_INTEGER; duplicateIndex += 1) {
    const suffix = duplicateIndex === 0 ? "" : ` ${duplicateIndex + 1}`;
    const candidateFileName = `${fileStem}${suffix}.md`;
    const candidatePath =
      selectedFolderPath === null
        ? candidateFileName
        : `${normalizeFolderPath(selectedFolderPath)}/${candidateFileName}`;
    const normalizedPath = normalizeNoteFilePath(candidatePath);

    if (!existingPathSet.has(normalizedPath.toLowerCase())) {
      return normalizedPath;
    }
  }

  throw new Error("A unique Markdown path could not be generated for the new note.");
}

export function insertCreatedNotePath(
  notePaths: readonly NoteFilePath[],
  createdNotePath: NoteFilePath,
): NoteFilePath[] {
  return [...notePaths, createdNotePath].sort(compareWorkspacePaths);
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
