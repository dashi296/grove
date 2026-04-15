import { compareWorkspacePaths, normalizeNoteFilePath } from "@grove/core";
import type { ScannedMarkdownNote } from "../../../shared";

import type { FolderNavigationNote } from "./folderWorkspaceState";

const DATE_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

export function mapScannedMarkdownNotes(
  scannedNotes: readonly ScannedMarkdownNote[],
): FolderNavigationNote[] {
  return scannedNotes
    .map(mapScannedMarkdownNote)
    .sort((left, right) => compareWorkspacePaths(left.path, right.path));
}

function mapScannedMarkdownNote(scannedNote: ScannedMarkdownNote): FolderNavigationNote {
  const path = normalizeNoteFilePath(scannedNote.path);
  const title = scannedNote.title.trim() || getFallbackTitle(path);

  return {
    id: path,
    path,
    title,
    updatedLabel: formatUpdatedLabel(scannedNote.updatedAtUnixMs),
  };
}

function getFallbackTitle(path: string): string {
  const fileName = path.split("/").at(-1) ?? "Untitled";
  return fileName.replace(/\.md$/i, "").trim() || "Untitled";
}

function formatUpdatedLabel(updatedAtUnixMs: number): string {
  const updatedAt = new Date(updatedAtUnixMs);

  if (Number.isNaN(updatedAt.getTime())) {
    return "Unknown";
  }

  return DATE_FORMATTER.format(updatedAt);
}
