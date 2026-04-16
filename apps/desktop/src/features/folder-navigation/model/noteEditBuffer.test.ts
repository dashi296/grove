import { normalizeNoteFilePath } from "@grove/core";
import { describe, expect, it } from "vitest";

import {
  canSaveNoteEditBuffer,
  createCleanNoteEditBuffer,
  createErroredNoteEditBuffer,
  discardNoteEditDraft,
  isNoteEditBufferBlockingWorkspaceChange,
  markNoteEditBufferSaved,
  markNoteEditBufferSaveFailed,
  markNoteEditBufferSaving,
  updateNoteEditBufferPath,
  updateNoteEditDraft,
} from "./noteEditBuffer";

const notePath = normalizeNoteFilePath("Projects/Plan.md");

function createDirtyBuffer() {
  const buffer = updateNoteEditDraft(
    createCleanNoteEditBuffer("note-plan", notePath, "# Plan"),
    "# Plan\n\nNext",
  );

  if (!canSaveNoteEditBuffer(buffer)) {
    throw new Error("Expected a dirty edit buffer.");
  }

  return buffer;
}

describe("note edit buffer", () => {
  it("creates a clean buffer from loaded Markdown content", () => {
    const buffer = createCleanNoteEditBuffer("note-plan", notePath, "# Plan");

    expect(buffer).toStrictEqual({
      noteId: "note-plan",
      path: "Projects/Plan.md",
      baseContent: "# Plan",
      draftContent: "# Plan",
      status: "clean",
      errorMessage: null,
    });
  });

  it("marks the buffer dirty when the draft differs from loaded content", () => {
    const buffer = createCleanNoteEditBuffer("note-plan", notePath, "# Plan");

    expect(updateNoteEditDraft(buffer, "# Plan\n\nNext").status).toBe("dirty");
  });

  it("returns the buffer to clean when the draft matches loaded content", () => {
    const buffer = updateNoteEditDraft(
      createCleanNoteEditBuffer("note-plan", notePath, "# Plan"),
      "# Plan\n\nNext",
    );

    expect(updateNoteEditDraft(buffer, "# Plan").status).toBe("clean");
  });

  it("updates the backing Markdown path without changing loaded content or draft state", () => {
    const buffer = createDirtyBuffer();

    expect(
      updateNoteEditBufferPath(buffer, normalizeNoteFilePath("Projects/Moved.md")),
    ).toMatchObject({
      path: "Projects/Moved.md",
      baseContent: "# Plan",
      draftContent: "# Plan\n\nNext",
      status: "dirty",
    });
  });

  it("only allows dirty buffers to be saved", () => {
    const cleanBuffer = createCleanNoteEditBuffer("note-plan", notePath, "# Plan");
    const dirtyBuffer = createDirtyBuffer();
    const savingBuffer = markNoteEditBufferSaving(dirtyBuffer);
    const erroredBuffer = createErroredNoteEditBuffer("note-plan", notePath, "Disk read failed.");

    expect(canSaveNoteEditBuffer(null)).toBe(false);
    expect(canSaveNoteEditBuffer(cleanBuffer)).toBe(false);
    expect(canSaveNoteEditBuffer(dirtyBuffer)).toBe(true);
    expect(canSaveNoteEditBuffer(savingBuffer)).toBe(false);
    expect(canSaveNoteEditBuffer(erroredBuffer)).toBe(false);
  });

  it("blocks workspace changes only while dirty or saving", () => {
    const cleanBuffer = createCleanNoteEditBuffer("note-plan", notePath, "# Plan");
    const dirtyBuffer = createDirtyBuffer();
    const savingBuffer = markNoteEditBufferSaving(dirtyBuffer);
    const erroredBuffer = createErroredNoteEditBuffer("note-plan", notePath, "Disk read failed.");

    expect(isNoteEditBufferBlockingWorkspaceChange(null)).toBe(false);
    expect(isNoteEditBufferBlockingWorkspaceChange(cleanBuffer)).toBe(false);
    expect(isNoteEditBufferBlockingWorkspaceChange(dirtyBuffer)).toBe(true);
    expect(isNoteEditBufferBlockingWorkspaceChange(savingBuffer)).toBe(true);
    expect(isNoteEditBufferBlockingWorkspaceChange(erroredBuffer)).toBe(false);
  });

  it("keeps a failed save dirty without discarding the draft", () => {
    const dirtyBuffer = createDirtyBuffer();
    const savingBuffer = markNoteEditBufferSaving(dirtyBuffer);
    const erroredBuffer = markNoteEditBufferSaveFailed(savingBuffer, "Disk write failed.");

    expect(savingBuffer.status).toBe("saving");
    expect(erroredBuffer).toMatchObject({
      draftContent: "# Plan\n\nNext",
      status: "dirty",
      errorMessage: "Disk write failed.",
    });
  });

  it("marks a saved draft clean and updates the loaded content", () => {
    const dirtyBuffer = updateNoteEditDraft(
      createCleanNoteEditBuffer("note-plan", notePath, "# Plan"),
      "# Plan\n\nNext",
    );

    expect(markNoteEditBufferSaved(dirtyBuffer, "# Plan\n\nNext")).toMatchObject({
      baseContent: "# Plan\n\nNext",
      draftContent: "# Plan\n\nNext",
      status: "clean",
      errorMessage: null,
    });
  });

  it("keeps newer edits dirty when an earlier save completes", () => {
    const dirtyBuffer = updateNoteEditDraft(
      createCleanNoteEditBuffer("note-plan", notePath, "# Plan"),
      "# Saved",
    );

    if (!canSaveNoteEditBuffer(dirtyBuffer)) {
      throw new Error("Expected a dirty edit buffer.");
    }

    const savingBuffer = markNoteEditBufferSaving(dirtyBuffer);
    const editedAgainBuffer = updateNoteEditDraft(savingBuffer, "# Saved\n\nMore");

    expect(markNoteEditBufferSaved(editedAgainBuffer, "# Saved")).toMatchObject({
      baseContent: "# Saved",
      draftContent: "# Saved\n\nMore",
      status: "dirty",
      errorMessage: null,
    });
  });

  it("creates an errored buffer for failed note reads", () => {
    const buffer = createErroredNoteEditBuffer(
      "note-plan",
      notePath,
      "The Markdown file could not be read.",
    );

    expect(buffer).toMatchObject({
      noteId: "note-plan",
      path: "Projects/Plan.md",
      status: "error",
      errorMessage: "The Markdown file could not be read.",
    });
  });

  it("discards a draft back to the loaded content", () => {
    const buffer = updateNoteEditDraft(
      createCleanNoteEditBuffer("note-plan", notePath, "# Plan"),
      "# Plan\n\nNext",
    );

    expect(discardNoteEditDraft(buffer)).toMatchObject({
      draftContent: "# Plan",
      status: "clean",
      errorMessage: null,
    });
  });
});
