import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  moveMarkdownFile,
  readMarkdownNote,
  refreshNoteIndexes,
  scanMarkdownWorkspace,
  writeMarkdownNote,
} from "./commands";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

describe("desktop command wrappers", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("invokes the Markdown file move command with the expected payload", async () => {
    invokeMock.mockResolvedValue(undefined);

    await moveMarkdownFile({
      noteId: "note-plan",
      previousPath: "Projects/Grove/Plan.md",
      nextPath: "Reading/Plan.md",
    });

    expect(invokeMock).toHaveBeenCalledWith("move_markdown_file", {
      change: {
        noteId: "note-plan",
        previousPath: "Projects/Grove/Plan.md",
        nextPath: "Reading/Plan.md",
      },
    });
  });

  it("invokes the note index refresh command with the expected payload", async () => {
    invokeMock.mockResolvedValue(undefined);

    await refreshNoteIndexes({
      noteIds: ["note-plan"],
      reason: "note-save",
    });

    expect(invokeMock).toHaveBeenCalledWith("refresh_note_indexes", {
      refresh: {
        noteIds: ["note-plan"],
        reason: "note-save",
      },
    });
  });

  it("invokes the Markdown workspace scan command", async () => {
    invokeMock.mockResolvedValue([
      {
        path: "Projects/Grove/Plan.md",
        title: "Workspace plan",
        updatedAtUnixMs: 1776265200000,
      },
    ]);

    await expect(scanMarkdownWorkspace()).resolves.toStrictEqual([
      {
        path: "Projects/Grove/Plan.md",
        title: "Workspace plan",
        updatedAtUnixMs: 1776265200000,
      },
    ]);
    expect(invokeMock).toHaveBeenCalledWith("scan_markdown_workspace", {});
  });

  it("invokes the Markdown note read command", async () => {
    invokeMock.mockResolvedValue("# Workspace plan\n\nDraft");

    await expect(readMarkdownNote({ path: "Projects/Grove/Plan.md" })).resolves.toBe(
      "# Workspace plan\n\nDraft",
    );
    expect(invokeMock).toHaveBeenCalledWith("read_markdown_note", {
      note: {
        path: "Projects/Grove/Plan.md",
      },
    });
  });

  it("invokes the Markdown note write command", async () => {
    invokeMock.mockResolvedValue({
      path: "Projects/Grove/Plan.md",
      title: "Workspace plan",
      updatedAtUnixMs: 1776265200000,
    });

    await expect(
      writeMarkdownNote({
        path: "Projects/Grove/Plan.md",
        content: "# Workspace plan\n\nSaved",
      }),
    ).resolves.toStrictEqual({
      path: "Projects/Grove/Plan.md",
      title: "Workspace plan",
      updatedAtUnixMs: 1776265200000,
    });
    expect(invokeMock).toHaveBeenCalledWith("write_markdown_note", {
      note: {
        path: "Projects/Grove/Plan.md",
        content: "# Workspace plan\n\nSaved",
      },
    });
  });

  it("rejects invalid Markdown note read results", async () => {
    invokeMock.mockResolvedValue({ content: "# Plan" });

    await expect(readMarkdownNote({ path: "Projects/Grove/Plan.md" })).rejects.toThrow(
      "invalid note content",
    );
  });

  it("rejects invalid Markdown note write metadata", async () => {
    invokeMock.mockResolvedValue({ path: "Projects/Grove/Plan.md", title: "Plan" });

    await expect(
      writeMarkdownNote({
        path: "Projects/Grove/Plan.md",
        content: "# Plan",
      }),
    ).rejects.toThrow("invalid note metadata");
  });

  it("rejects invalid Markdown workspace scan results", async () => {
    invokeMock.mockResolvedValue([{ path: "/Users/me/Notes/Plan.md", title: "Plan" }]);

    await expect(scanMarkdownWorkspace()).rejects.toThrow("invalid note list");
  });

  it("rejects non-finite Markdown workspace scan timestamps", async () => {
    invokeMock.mockResolvedValue([
      {
        path: "Projects/Grove/Plan.md",
        title: "Plan",
        updatedAtUnixMs: Number.POSITIVE_INFINITY,
      },
    ]);

    await expect(scanMarkdownWorkspace()).rejects.toThrow("invalid note list");
  });

  it("preserves structured Tauri command messages when a command fails", async () => {
    invokeMock.mockRejectedValue({
      code: "file_move_failed",
      message: "The target Markdown file already exists.",
    });

    await expect(
      moveMarkdownFile({
        noteId: "note-plan",
        previousPath: "Projects/Grove/Plan.md",
        nextPath: "Reading/Plan.md",
      }),
    ).rejects.toThrow("The target Markdown file already exists.");
  });
});
