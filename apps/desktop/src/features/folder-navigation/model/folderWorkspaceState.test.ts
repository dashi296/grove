import { describe, expect, it } from "vitest";

import { normalizeFolderPath, normalizeNoteFilePath } from "@grove/core";
import type { FolderWorkspaceState } from "./folderWorkspaceState";
import { moveNoteInFolderWorkspace, renameFolderInWorkspace } from "./folderWorkspaceState";

const workspaceState: FolderWorkspaceState = {
  notes: [
    {
      id: "note-root",
      title: "Inbox",
      path: normalizeNoteFilePath("Inbox.md"),
      updatedLabel: "Today",
    },
    {
      id: "note-plan",
      title: "Plan",
      path: normalizeNoteFilePath("Projects/Grove/Plan.md"),
      updatedLabel: "Yesterday",
    },
    {
      id: "note-research",
      title: "Research",
      path: normalizeNoteFilePath("Projects/Grove/Research/Notes.md"),
      updatedLabel: "Apr 12",
    },
  ],
  explicitFolders: [normalizeFolderPath("Projects/Grove/Ideas"), normalizeFolderPath("Reading")],
  selectedFolderPath: normalizeFolderPath("Projects/Grove"),
  expandedFolderPaths: ["Projects", "Projects/Grove", "Projects/Grove/Research"],
};

describe("moveNoteInFolderWorkspace", () => {
  it("moves the selected note and selects the target folder scope", () => {
    const result = moveNoteInFolderWorkspace(
      workspaceState,
      "note-plan",
      normalizeFolderPath("Reading"),
    );

    expect(result.affectedNoteIds).toStrictEqual(["note-plan"]);
    expect(result.state.notes.find((note) => note.id === "note-plan")?.path).toBe(
      "Reading/Plan.md",
    );
    expect(result.state.selectedFolderPath).toBe("Reading");
    expect(result.state.explicitFolders).toStrictEqual(workspaceState.explicitFolders);
  });
});

describe("renameFolderInWorkspace", () => {
  it("renames descendant notes and explicit empty folders as one state change", () => {
    const result = renameFolderInWorkspace(
      workspaceState,
      normalizeFolderPath("Projects/Grove"),
      normalizeFolderPath("Areas/Grove"),
    );

    expect(result.affectedNoteIds).toStrictEqual(["note-plan", "note-research"]);
    expect(result.state.notes.map((note) => note.path)).toStrictEqual([
      "Inbox.md",
      "Areas/Grove/Plan.md",
      "Areas/Grove/Research/Notes.md",
    ]);
    expect(result.state.explicitFolders).toStrictEqual(["Areas/Grove/Ideas", "Reading"]);
    expect(result.state.expandedFolderPaths).toStrictEqual([
      "Areas",
      "Areas/Grove",
      "Areas/Grove/Research",
      "Projects",
    ]);
    expect(result.state.selectedFolderPath).toBe("Areas/Grove");
  });

  it("moves renamed folder contents to the workspace root", () => {
    const result = renameFolderInWorkspace(
      workspaceState,
      normalizeFolderPath("Projects/Grove"),
      null,
    );

    expect(result.state.notes.map((note) => note.path)).toStrictEqual([
      "Inbox.md",
      "Plan.md",
      "Research/Notes.md",
    ]);
    expect(result.state.explicitFolders).toStrictEqual(["Ideas", "Reading"]);
    expect(result.state.expandedFolderPaths).toStrictEqual(["Projects", "Research"]);
    expect(result.state.selectedFolderPath).toBeNull();
  });

  it("rejects moving a folder into its own descendant", () => {
    expect(() =>
      renameFolderInWorkspace(
        workspaceState,
        normalizeFolderPath("Projects/Grove"),
        normalizeFolderPath("Projects/Grove/Research"),
      ),
    ).toThrow("outside the selected folder");
  });
});
