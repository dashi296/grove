import { invoke } from "@tauri-apps/api/core";

export type MoveMarkdownFileCommand = {
  noteId: string;
  previousPath: string;
  nextPath: string;
};

export type RefreshNoteIndexesCommand = {
  noteIds: readonly string[];
  reason: "note-move" | "folder-rename" | "note-save" | "note-create";
};

export type ScannedMarkdownNote = {
  path: string;
  title: string;
  updatedAtUnixMs: number;
};

export type CreateMarkdownNoteCommand = {
  path: string;
  content: string;
};

export type ReadMarkdownNoteCommand = {
  path: string;
};

export type WriteMarkdownNoteCommand = {
  path: string;
  content: string;
};

export async function moveMarkdownFile(command: MoveMarkdownFileCommand): Promise<void> {
  await invokeCommand("move_markdown_file", { change: command });
}

export async function refreshNoteIndexes(command: RefreshNoteIndexesCommand): Promise<void> {
  await invokeCommand("refresh_note_indexes", { refresh: command });
}

export async function scanMarkdownWorkspace(): Promise<ScannedMarkdownNote[]> {
  const result = await invokeCommandResult("scan_markdown_workspace", {});

  if (!isScannedMarkdownNotes(result)) {
    throw new Error("The desktop scan command returned an invalid note list.");
  }

  return result;
}

export async function createMarkdownNote(
  command: CreateMarkdownNoteCommand,
): Promise<ScannedMarkdownNote> {
  const result = await invokeCommandResult("create_markdown_note", { note: command });

  if (!isScannedMarkdownNote(result)) {
    throw new Error("The desktop create command returned invalid note metadata.");
  }

  return result;
}

export async function readMarkdownNote(command: ReadMarkdownNoteCommand): Promise<string> {
  const result = await invokeCommandResult("read_markdown_note", { note: command });

  if (typeof result !== "string") {
    throw new Error("The desktop read command returned invalid note content.");
  }

  return result;
}

export async function writeMarkdownNote(
  command: WriteMarkdownNoteCommand,
): Promise<ScannedMarkdownNote> {
  const result = await invokeCommandResult("write_markdown_note", { note: command });

  if (!isScannedMarkdownNote(result)) {
    throw new Error("The desktop write command returned invalid note metadata.");
  }

  return result;
}

async function invokeCommand(commandName: string, payload: Record<string, unknown>): Promise<void> {
  await invokeCommandResult(commandName, payload);
}

async function invokeCommandResult(
  commandName: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  try {
    return await invoke(commandName, payload);
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

function isScannedMarkdownNotes(value: unknown): value is ScannedMarkdownNote[] {
  return Array.isArray(value) && value.every(isScannedMarkdownNote);
}

function isScannedMarkdownNote(value: unknown): value is ScannedMarkdownNote {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "updatedAtUnixMs" in value &&
    typeof value.updatedAtUnixMs === "number" &&
    Number.isFinite(value.updatedAtUnixMs) &&
    value.updatedAtUnixMs >= 0
  );
}
