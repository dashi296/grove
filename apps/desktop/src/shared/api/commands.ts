import { invoke } from "@tauri-apps/api/core";

export type MoveMarkdownFileCommand = {
  noteId: string;
  previousPath: string;
  nextPath: string;
};

export type RefreshNoteIndexesCommand = {
  noteIds: readonly string[];
  reason: "note-move" | "folder-rename" | "note-save" | "note-create" | "note-delete";
};

export type ScannedMarkdownNote = {
  path: string;
  title: string;
  content: string;
  updatedAtUnixMs: number;
};

export type DesktopWorkspace = {
  id: string;
  name: string;
  rootPath: string;
  lastOpenedAtUnixMs: number;
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

export type DeleteMarkdownNoteCommand = {
  path: string;
};

export type AddWorkspaceCommand = {
  name: string;
  rootPath: string;
};

export type SwitchWorkspaceCommand = {
  id: string;
};

export type RenameWorkspaceCommand = {
  id: string;
  name: string;
};

export type RemoveWorkspaceCommand = {
  id: string;
};

export async function listWorkspaces(): Promise<DesktopWorkspace[]> {
  const result = await invokeCommandResult("list_workspaces", {});

  if (!isDesktopWorkspaces(result)) {
    throw new Error("The desktop workspace command returned invalid workspace metadata.");
  }

  return result;
}

export async function getActiveWorkspace(): Promise<DesktopWorkspace> {
  const result = await invokeCommandResult("get_active_workspace", {});

  if (!isDesktopWorkspace(result)) {
    throw new Error("The desktop workspace command returned invalid workspace metadata.");
  }

  return result;
}

export async function addWorkspace(command: AddWorkspaceCommand): Promise<DesktopWorkspace> {
  const result = await invokeCommandResult("add_workspace", { workspace: command });

  if (!isDesktopWorkspace(result)) {
    throw new Error("The desktop workspace command returned invalid workspace metadata.");
  }

  return result;
}

export async function switchWorkspace(command: SwitchWorkspaceCommand): Promise<DesktopWorkspace> {
  const result = await invokeCommandResult("switch_workspace", { workspace: command });

  if (!isDesktopWorkspace(result)) {
    throw new Error("The desktop workspace command returned invalid workspace metadata.");
  }

  return result;
}

export async function renameWorkspace(command: RenameWorkspaceCommand): Promise<DesktopWorkspace> {
  const result = await invokeCommandResult("rename_workspace", { workspace: command });

  if (!isDesktopWorkspace(result)) {
    throw new Error("The desktop workspace command returned invalid workspace metadata.");
  }

  return result;
}

export async function removeWorkspace(command: RemoveWorkspaceCommand): Promise<void> {
  await invokeCommand("remove_workspace", { workspace: command });
}

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

export async function deleteMarkdownNote(command: DeleteMarkdownNoteCommand): Promise<void> {
  await invokeCommand("delete_markdown_note", { note: command });
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

function isDesktopWorkspaces(value: unknown): value is DesktopWorkspace[] {
  return Array.isArray(value) && value.every(isDesktopWorkspace);
}

function isDesktopWorkspace(value: unknown): value is DesktopWorkspace {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    "name" in value &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    "rootPath" in value &&
    typeof value.rootPath === "string" &&
    value.rootPath.trim().length > 0 &&
    "lastOpenedAtUnixMs" in value &&
    typeof value.lastOpenedAtUnixMs === "number" &&
    Number.isFinite(value.lastOpenedAtUnixMs) &&
    value.lastOpenedAtUnixMs >= 0
  );
}

function isScannedMarkdownNote(value: unknown): value is ScannedMarkdownNote {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "content" in value &&
    typeof value.content === "string" &&
    "updatedAtUnixMs" in value &&
    typeof value.updatedAtUnixMs === "number" &&
    Number.isFinite(value.updatedAtUnixMs) &&
    value.updatedAtUnixMs >= 0
  );
}
