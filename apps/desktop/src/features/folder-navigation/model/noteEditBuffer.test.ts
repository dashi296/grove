import { normalizeNoteFilePath } from "@grove/core";
import { describe, expect, it } from "vitest";

import {
  createCleanNoteEditBuffer,
  createErroredNoteEditBuffer,
  discardNoteEditDraft,
  markNoteEditBufferError,
  markNoteEditBufferSaving,
  updateNoteEditDraft,
} from "./noteEditBuffer";

const notePath = normalizeNoteFilePath("Projects/Plan.md");

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

  it("tracks saving and error transitions without discarding the draft", () => {
    const dirtyBuffer = updateNoteEditDraft(
      createCleanNoteEditBuffer("note-plan", notePath, "# Plan"),
      "# Plan\n\nNext",
    );
    const savingBuffer = markNoteEditBufferSaving(dirtyBuffer);
    const erroredBuffer = markNoteEditBufferError(savingBuffer, "Disk read failed.");

    expect(savingBuffer.status).toBe("saving");
    expect(erroredBuffer).toMatchObject({
      draftContent: "# Plan\n\nNext",
      status: "error",
      errorMessage: "Disk read failed.",
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
