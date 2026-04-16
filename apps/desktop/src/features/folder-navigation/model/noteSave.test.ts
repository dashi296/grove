import { normalizeFolderPath, normalizeNoteFilePath } from "@grove/core";
import { describe, expect, it } from "vitest";

import type { FolderWorkspaceState } from "./folderWorkspaceState";
import { applySavedNoteMetadataToWorkspaceState } from "./noteSave";

const workspaceState: FolderWorkspaceState = {
  notes: [
    {
      id: "note-plan",
      path: normalizeNoteFilePath("Projects/Grove/Plan.md"),
      title: "Plan",
      updatedLabel: "Apr 12",
    },
    {
      id: "note-research",
      path: normalizeNoteFilePath("Projects/Grove/Research.md"),
      title: "Research",
      updatedLabel: "Apr 11",
    },
  ],
  explicitFolders: [normalizeFolderPath("Projects/Grove")],
  selectedFolderPath: normalizeFolderPath("Projects/Grove"),
  expandedFolderPaths: ["Projects", "Projects/Grove"],
};

describe("applySavedNoteMetadataToWorkspaceState", () => {
  it("updates saved note metadata while keeping the stable note id", () => {
    const state = applySavedNoteMetadataToWorkspaceState(workspaceState, {
      noteId: "note-plan",
      previousPath: normalizeNoteFilePath("Projects/Grove/Plan.md"),
      savedNote: {
        path: "Projects/Grove/Plan.md",
        title: "Updated plan",
        updatedAtUnixMs: Date.UTC(2026, 3, 15),
      },
    });

    expect(state.notes[0]).toStrictEqual({
      id: "note-plan",
      path: "Projects/Grove/Plan.md",
      title: "Updated plan",
      updatedLabel: "Apr 15",
    });
  });

  it("does not overwrite a newer local path for the same note", () => {
    const movedState: FolderWorkspaceState = {
      ...workspaceState,
      notes: workspaceState.notes.map((note) =>
        note.id === "note-plan"
          ? {
              ...note,
              path: normalizeNoteFilePath("Projects/Grove/Moved.md"),
            }
          : note,
      ),
    };

    const state = applySavedNoteMetadataToWorkspaceState(movedState, {
      noteId: "note-plan",
      previousPath: normalizeNoteFilePath("Projects/Grove/Plan.md"),
      savedNote: {
        path: "Projects/Grove/Plan.md",
        title: "Updated plan",
        updatedAtUnixMs: Date.UTC(2026, 3, 15),
      },
    });

    expect(state.notes[0]).toMatchObject({
      id: "note-plan",
      path: "Projects/Grove/Moved.md",
      title: "Updated plan",
    });
  });
});
