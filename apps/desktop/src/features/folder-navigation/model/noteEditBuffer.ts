import type { NoteFilePath } from "@grove/core";

export type NoteEditBufferStatus = "clean" | "dirty" | "saving" | "error";

export type NoteEditBuffer = {
  noteId: string;
  path: NoteFilePath;
  baseContent: string;
  draftContent: string;
  status: NoteEditBufferStatus;
  errorMessage: string | null;
};

type DirtyNoteEditBuffer = NoteEditBuffer & {
  status: "dirty";
};

export function createCleanNoteEditBuffer(
  noteId: string,
  path: NoteFilePath,
  content: string,
): NoteEditBuffer {
  return {
    noteId,
    path,
    baseContent: content,
    draftContent: content,
    status: "clean",
    errorMessage: null,
  };
}

export function createErroredNoteEditBuffer(
  noteId: string,
  path: NoteFilePath,
  errorMessage: string,
): NoteEditBuffer {
  return {
    noteId,
    path,
    baseContent: "",
    draftContent: "",
    status: "error",
    errorMessage,
  };
}

export function updateNoteEditDraft(buffer: NoteEditBuffer, draftContent: string): NoteEditBuffer {
  return {
    ...buffer,
    draftContent,
    status: draftContent === buffer.baseContent ? "clean" : "dirty",
    errorMessage: null,
  };
}

export function markNoteEditBufferSaving(buffer: DirtyNoteEditBuffer): NoteEditBuffer {
  return {
    ...buffer,
    status: "saving",
    errorMessage: null,
  };
}

export function canSaveNoteEditBuffer(
  buffer: NoteEditBuffer | null,
): buffer is DirtyNoteEditBuffer {
  return buffer?.status === "dirty";
}

export function isNoteEditBufferBlockingWorkspaceChange(buffer: NoteEditBuffer | null): boolean {
  return buffer?.status === "dirty" || buffer?.status === "saving";
}

export function markNoteEditBufferSaveFailed(
  buffer: NoteEditBuffer,
  errorMessage: string,
): NoteEditBuffer {
  return {
    ...buffer,
    status: "dirty",
    errorMessage,
  };
}

export function markNoteEditBufferSaved(
  buffer: NoteEditBuffer,
  savedContent: string,
): NoteEditBuffer {
  const status = buffer.draftContent === savedContent ? "clean" : "dirty";

  return {
    ...buffer,
    baseContent: savedContent,
    status,
    errorMessage: null,
  };
}

export function discardNoteEditDraft(buffer: NoteEditBuffer): NoteEditBuffer {
  return {
    ...buffer,
    draftContent: buffer.baseContent,
    status: "clean",
    errorMessage: null,
  };
}
