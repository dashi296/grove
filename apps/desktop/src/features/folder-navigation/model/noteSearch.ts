import { compareWorkspacePaths, isNoteInFolderScope } from "@grove/core";
import type { FolderScope, NoteFilePath } from "@grove/core";

export type SearchableFolderNavigationNote = {
  id: string;
  title: string;
  path: NoteFilePath;
  content: string;
  tags: readonly string[];
  updatedLabel: string;
};

type SearchFolderNavigationNotesOptions = {
  query: string;
  notes: readonly SearchableFolderNavigationNote[];
  selectedFolderPath: FolderScope;
  restrictToSelectedFolder: boolean;
};

export function searchFolderNavigationNotes({
  query,
  notes,
  selectedFolderPath,
  restrictToSelectedFolder,
}: SearchFolderNavigationNotesOptions): SearchableFolderNavigationNote[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (normalizedQuery === "") {
    return [];
  }

  return notes
    .filter((note) => {
      if (!restrictToSelectedFolder) {
        return true;
      }

      return isNoteInFolderScope(note.path, selectedFolderPath);
    })
    .filter((note) => buildSearchText(note).includes(normalizedQuery))
    .sort((left, right) => compareWorkspacePaths(left.path, right.path));
}

function buildSearchText(note: SearchableFolderNavigationNote): string {
  return `${note.title}\n${note.path}\n${note.content}`.toLocaleLowerCase();
}
