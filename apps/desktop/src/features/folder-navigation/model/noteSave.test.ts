import { normalizeFolderPath, normalizeNoteFilePath } from "@grove/core";
import { describe, expect, it } from "vitest";

import type {
  FolderWorkspacePathChangeOperation,
  FolderWorkspaceState,
} from "./folderWorkspaceState";
import {
  applySavedNoteMetadataToWorkspaceState,
  isNoteAffectedByPathChange,
  isNoteSaveBlockedByPathChange,
  isNoteSaveKeyboardShortcut,
} from "./noteSave";

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

describe("isNoteAffectedByPathChange", () => {
  const pendingOperation: FolderWorkspacePathChangeOperation = {
    id: "path-change-1",
    affectedNoteIds: ["note-plan"],
    pathChanges: [
      {
        noteId: "note-plan",
        previousPath: normalizeNoteFilePath("Projects/Grove/Plan.md"),
        nextPath: normalizeNoteFilePath("Archive/Plan.md"),
      },
    ],
    reason: "note-move",
    steps: [
      {
        id: "file-move",
        status: "pending",
      },
      {
        id: "index-refresh",
        status: "pending",
      },
    ],
  };

  it("tracks whether a note still has unfinished path changes", () => {
    expect(isNoteAffectedByPathChange([pendingOperation], "note-plan")).toBe(true);
  });

  it("ignores unrelated notes and completed path changes", () => {
    const completedOperation: FolderWorkspacePathChangeOperation = {
      ...pendingOperation,
      steps: pendingOperation.steps.map((step) => ({
        ...step,
        status: "completed",
      })),
    };

    expect(isNoteAffectedByPathChange([pendingOperation], "note-research")).toBe(false);
    expect(isNoteAffectedByPathChange([completedOperation], "note-plan")).toBe(false);
  });
});

describe("isNoteSaveBlockedByPathChange", () => {
  it("keeps save-specific callers aligned with the generic path-change guard", () => {
    const pendingOperation: FolderWorkspacePathChangeOperation = {
      id: "path-change-1",
      affectedNoteIds: ["note-plan"],
      pathChanges: [
        {
          noteId: "note-plan",
          previousPath: normalizeNoteFilePath("Projects/Grove/Plan.md"),
          nextPath: normalizeNoteFilePath("Archive/Plan.md"),
        },
      ],
      reason: "note-move",
      steps: [
        {
          id: "file-move",
          status: "pending",
        },
        {
          id: "index-refresh",
          status: "pending",
        },
      ],
    };

    expect(isNoteSaveBlockedByPathChange([pendingOperation], "note-plan")).toBe(
      isNoteAffectedByPathChange([pendingOperation], "note-plan"),
    );
  });
});

describe("isNoteSaveKeyboardShortcut", () => {
  it("matches common save shortcuts", () => {
    expect(isNoteSaveKeyboardShortcut({ ctrlKey: true, key: "s", metaKey: false })).toBe(true);
    expect(isNoteSaveKeyboardShortcut({ ctrlKey: false, key: "S", metaKey: true })).toBe(true);
  });

  it("ignores unrelated key combinations", () => {
    expect(isNoteSaveKeyboardShortcut({ ctrlKey: false, key: "s", metaKey: false })).toBe(false);
    expect(isNoteSaveKeyboardShortcut({ ctrlKey: true, key: "p", metaKey: false })).toBe(false);
  });
});
