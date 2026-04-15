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
  await invokeCommand("move_markdown_file", { change: command });
}

export async function refreshNoteIndexes(command: RefreshNoteIndexesCommand): Promise<void> {
  await invokeCommand("refresh_note_indexes", { refresh: command });
}

async function invokeCommand(commandName: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await invoke(commandName, payload);
  } catch (error) {
    throw new Error(getCommandErrorMessage(error));
  }
}

function getCommandErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (isCommandErrorPayload(error)) {
    return error.message;
  }

  return "The desktop command failed.";
}

function isCommandErrorPayload(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  );
}
