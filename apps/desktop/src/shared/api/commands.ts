import { invoke } from "@tauri-apps/api/core";

export type MoveMarkdownFileCommand = {
  noteId: string;
  previousPath: string;
  nextPath: string;
};

export type RefreshNoteIndexesCommand = {
  noteIds: readonly string[];
  reason: "note-move" | "folder-rename";
};

export async function moveMarkdownFile(command: MoveMarkdownFileCommand): Promise<void> {
  await invoke("move_markdown_file", {
    change: command,
  });
}

export async function refreshNoteIndexes(command: RefreshNoteIndexesCommand): Promise<void> {
  await invoke("refresh_note_indexes", {
    refresh: command,
  });
}
