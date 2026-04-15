import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { moveMarkdownFile, refreshNoteIndexes, scanMarkdownWorkspace } from "./commands";

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
      reason: "note-move",
    });

    expect(invokeMock).toHaveBeenCalledWith("refresh_note_indexes", {
      refresh: {
        noteIds: ["note-plan"],
        reason: "note-move",
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
