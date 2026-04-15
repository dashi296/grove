import { describe, expect, it } from "vitest";

import { normalizeNoteFilePath } from "@grove/core";
import { createDesktopPathChangeExecutor } from "./folderPathChangeExecutor";
import type { FolderWorkspacePathChange } from "./folderWorkspaceState";

const pathChange: FolderWorkspacePathChange = {
  noteId: "note-plan",
  previousPath: normalizeNoteFilePath("Projects/Grove/Plan.md"),
  nextPath: normalizeNoteFilePath("Reading/Plan.md"),
};

describe("createDesktopPathChangeExecutor", () => {
  it("moves markdown files before refreshing affected note indexes", async () => {
    const calls: string[] = [];
    const executor = createDesktopPathChangeExecutor({
      fileGateway: {
        async moveMarkdownFile(change) {
          calls.push(`move:${change.previousPath}->${change.nextPath}`);
        },
      },
      indexGateway: {
        async refreshNoteIndexes(indexRefresh) {
          calls.push(`index:${indexRefresh.reason}:${indexRefresh.noteIds.join(",")}`);
        },
      },
    });

    await executor.moveMarkdownFiles([pathChange]);
    await executor.refreshIndexes({
      noteIds: [pathChange.noteId],
      reason: "note-move",
    });

    expect(calls).toStrictEqual([
      "move:Projects/Grove/Plan.md->Reading/Plan.md",
      "index:note-move:note-plan",
    ]);
  });

  it("rejects duplicate target paths before moving any file", async () => {
    const calls: string[] = [];
    const executor = createDesktopPathChangeExecutor({
      fileGateway: {
        async moveMarkdownFile(change) {
          calls.push(change.noteId);
        },
      },
      indexGateway: {
        async refreshNoteIndexes() {
          calls.push("index");
        },
      },
    });

    await expect(
      executor.moveMarkdownFiles([
        pathChange,
        {
          ...pathChange,
          noteId: "note-copy",
          previousPath: normalizeNoteFilePath("Projects/Grove/Copy.md"),
        },
      ]),
    ).rejects.toThrow("same Markdown path");
    expect(calls).toStrictEqual([]);
  });

  it("moves files that vacate target paths before their replacements", async () => {
    const calls: string[] = [];
    const executor = createDesktopPathChangeExecutor({
      fileGateway: {
        async moveMarkdownFile(change) {
          calls.push(`${change.previousPath}->${change.nextPath}`);
        },
      },
      indexGateway: {
        async refreshNoteIndexes() {
          calls.push("index");
        },
      },
    });

    await executor.moveMarkdownFiles([
      {
        noteId: "note-nested-plan",
        previousPath: normalizeNoteFilePath("Projects/Grove/Grove/Plan.md"),
        nextPath: normalizeNoteFilePath("Projects/Grove/Plan.md"),
      },
      {
        noteId: "note-plan",
        previousPath: normalizeNoteFilePath("Projects/Grove/Plan.md"),
        nextPath: normalizeNoteFilePath("Projects/Plan.md"),
      },
    ]);

    expect(calls).toStrictEqual([
      "Projects/Grove/Plan.md->Projects/Plan.md",
      "Projects/Grove/Grove/Plan.md->Projects/Grove/Plan.md",
    ]);
  });

  it("rejects circular path moves before moving any file", async () => {
    const calls: string[] = [];
    const executor = createDesktopPathChangeExecutor({
      fileGateway: {
        async moveMarkdownFile(change) {
          calls.push(change.noteId);
        },
      },
      indexGateway: {
        async refreshNoteIndexes() {
          calls.push("index");
        },
      },
    });

    await expect(
      executor.moveMarkdownFiles([
        {
          noteId: "note-a",
          previousPath: normalizeNoteFilePath("A.md"),
          nextPath: normalizeNoteFilePath("B.md"),
        },
        {
          noteId: "note-b",
          previousPath: normalizeNoteFilePath("B.md"),
          nextPath: normalizeNoteFilePath("A.md"),
        },
      ]),
    ).rejects.toThrow("temporary path");
    expect(calls).toStrictEqual([]);
  });
});
