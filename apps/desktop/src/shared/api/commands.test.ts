import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMarkdownNote,
  createMarkdownFolder,
  deleteMarkdownNote,
  addWorkspace,
  listMarkdownFolders,
  getActiveWorkspace,
  listWorkspaces,
  moveMarkdownFile,
  readMarkdownNote,
  refreshNoteIndexes,
  removeWorkspace,
  renameWorkspace,
  scanMarkdownWorkspace,
  switchWorkspace,
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
        content: "# Workspace plan\n\nDraft",
        updatedAtUnixMs: 1776265200000,
      },
    ]);

    await expect(scanMarkdownWorkspace()).resolves.toStrictEqual([
      {
        path: "Projects/Grove/Plan.md",
        title: "Workspace plan",
        content: "# Workspace plan\n\nDraft",
        updatedAtUnixMs: 1776265200000,
      },
    ]);
    expect(invokeMock).toHaveBeenCalledWith("scan_markdown_workspace", {});
  });

  it("invokes the Markdown folder scan command", async () => {
    invokeMock.mockResolvedValue(["Projects/Grove", "Projects/Grove/Ideas"]);

    await expect(listMarkdownFolders()).resolves.toStrictEqual([
      "Projects/Grove",
      "Projects/Grove/Ideas",
    ]);
    expect(invokeMock).toHaveBeenCalledWith("scan_markdown_folders", {});
  });

  it("invokes the Markdown note create command", async () => {
    invokeMock.mockResolvedValue({
      path: "Projects/Grove/Plan.md",
      title: "Plan",
      content: "",
      updatedAtUnixMs: 1776265200000,
    });

    await expect(
      createMarkdownNote({
        path: "Projects/Grove/Plan.md",
        content: "",
      }),
    ).resolves.toStrictEqual({
      path: "Projects/Grove/Plan.md",
      title: "Plan",
      content: "",
      updatedAtUnixMs: 1776265200000,
    });
    expect(invokeMock).toHaveBeenCalledWith("create_markdown_note", {
      note: {
        path: "Projects/Grove/Plan.md",
        content: "",
      },
    });
  });

  it("invokes the Markdown folder create command", async () => {
    invokeMock.mockResolvedValue(undefined);

    await createMarkdownFolder({
      path: "Projects/Grove/Ideas",
    });

    expect(invokeMock).toHaveBeenCalledWith("create_markdown_folder", {
      folder: {
        path: "Projects/Grove/Ideas",
      },
    });
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
      content: "# Workspace plan\n\nSaved",
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
      content: "# Workspace plan\n\nSaved",
      updatedAtUnixMs: 1776265200000,
    });
    expect(invokeMock).toHaveBeenCalledWith("write_markdown_note", {
      note: {
        path: "Projects/Grove/Plan.md",
        content: "# Workspace plan\n\nSaved",
      },
    });
  });

  it("invokes the Markdown note delete command", async () => {
    invokeMock.mockResolvedValue(undefined);

    await deleteMarkdownNote({ path: "Projects/Grove/Plan.md" });

    expect(invokeMock).toHaveBeenCalledWith("delete_markdown_note", {
      note: {
        path: "Projects/Grove/Plan.md",
      },
    });
  });

  it("loads workspace metadata from the desktop host", async () => {
    invokeMock.mockResolvedValue([
      {
        id: "default",
        name: "Personal Notes",
        rootPath: "/Users/me/Library/Application Support/grove/workspaces/default",
        lastOpenedAtUnixMs: 1776265200000,
      },
    ]);

    await expect(listWorkspaces()).resolves.toStrictEqual([
      {
        id: "default",
        name: "Personal Notes",
        rootPath: "/Users/me/Library/Application Support/grove/workspaces/default",
        lastOpenedAtUnixMs: 1776265200000,
      },
    ]);
    expect(invokeMock).toHaveBeenCalledWith("list_workspaces", {});
  });

  it("loads the active workspace from the desktop host", async () => {
    invokeMock.mockResolvedValue({
      id: "default",
      name: "Personal Notes",
      rootPath: "/Users/me/Library/Application Support/grove/workspaces/default",
      lastOpenedAtUnixMs: 1776265200000,
    });

    await expect(getActiveWorkspace()).resolves.toStrictEqual({
      id: "default",
      name: "Personal Notes",
      rootPath: "/Users/me/Library/Application Support/grove/workspaces/default",
      lastOpenedAtUnixMs: 1776265200000,
    });
    expect(invokeMock).toHaveBeenCalledWith("get_active_workspace", {});
  });

  it("invokes workspace mutation commands with typed payloads", async () => {
    invokeMock.mockResolvedValue({
      id: "research",
      name: "Research",
      rootPath: "/Users/me/Notes/Research",
      lastOpenedAtUnixMs: 1776265200000,
    });

    await addWorkspace({ name: "Research", rootPath: "/Users/me/Notes/Research" });
    await switchWorkspace({ id: "research" });
    await renameWorkspace({ id: "research", name: "Archive" });
    await removeWorkspace({ id: "research" });

    expect(invokeMock).toHaveBeenNthCalledWith(1, "add_workspace", {
      workspace: { name: "Research", rootPath: "/Users/me/Notes/Research" },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "switch_workspace", {
      workspace: { id: "research" },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "rename_workspace", {
      workspace: { id: "research", name: "Archive" },
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "remove_workspace", {
      workspace: { id: "research" },
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

  it("rejects invalid Markdown folder scan results", async () => {
    invokeMock.mockResolvedValue(["Projects/Grove", 123]);

    await expect(listMarkdownFolders()).rejects.toThrow("invalid folder list");
  });

  it("rejects non-finite Markdown workspace scan timestamps", async () => {
    invokeMock.mockResolvedValue([
      {
        path: "Projects/Grove/Plan.md",
        title: "Plan",
        content: "",
        updatedAtUnixMs: Number.POSITIVE_INFINITY,
      },
    ]);

    await expect(scanMarkdownWorkspace()).rejects.toThrow("invalid note list");
  });

  it("rejects invalid workspace command results", async () => {
    invokeMock.mockResolvedValue({
      id: "default",
      name: "Personal Notes",
      rootPath: "",
      lastOpenedAtUnixMs: Number.NaN,
    });

    await expect(getActiveWorkspace()).rejects.toThrow("invalid workspace metadata");
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

  it("rejects invalid Markdown note create metadata", async () => {
    invokeMock.mockResolvedValue({ path: "Projects/Grove/Plan.md", title: "Plan" });

    await expect(
      createMarkdownNote({
        path: "Projects/Grove/Plan.md",
        content: "",
      }),
    ).rejects.toThrow("invalid note metadata");
  });
});
