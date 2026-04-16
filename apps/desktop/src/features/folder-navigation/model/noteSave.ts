import type { NoteFilePath } from "@grove/core";
import type { ScannedMarkdownNote } from "../../../shared";

import { reconcileFolderWorkspaceState, type FolderWorkspaceState } from "./folderWorkspaceState";
import { mapScannedMarkdownNotes } from "./workspaceScan";

export type SavedNoteMetadataChange = {
  noteId: string;
  previousPath: NoteFilePath;
  savedNote: ScannedMarkdownNote;
};

export function applySavedNoteMetadataToWorkspaceState(
  state: FolderWorkspaceState,
  { noteId, previousPath, savedNote }: SavedNoteMetadataChange,
): FolderWorkspaceState {
  const [updatedNote] = mapScannedMarkdownNotes([savedNote]);

  return reconcileFolderWorkspaceState({
    ...state,
    notes: state.notes.map((note) => {
      if (note.id !== noteId) {
        return note;
      }

      return {
        ...note,
        ...updatedNote,
        id: noteId,
        path: note.path === previousPath ? updatedNote.path : note.path,
      };
    }),
  });
}
