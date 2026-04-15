import { describe, expect, it } from "vitest";

import { normalizeFolderPath, normalizeNoteFilePath } from "@grove/core";
import type { FolderWorkspaceState } from "./folderWorkspaceState";
import {
  completeNextOperationStep,
  createPathChangeOperation,
  failNextOperationStep,
  getFailedOperationSteps,
  getNextPendingOperationStep,
  isPathChangeOperationComplete,
  moveNoteInFolderWorkspace,
  reconcileFolderWorkspaceState,
  renameFolderInWorkspace,
  retryOperationStep,
  runNextOperationStep,
} from "./folderWorkspaceState";

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
    expect(result.pathChanges).toStrictEqual([
      {
        noteId: "note-plan",
        previousPath: "Projects/Grove/Plan.md",
        nextPath: "Reading/Plan.md",
      },
    ]);
    expect(result.indexRefresh).toStrictEqual({
      noteIds: ["note-plan"],
      reason: "note-move",
    });
    expect(result.state.notes.find((note) => note.id === "note-plan")?.path).toBe(
      "Reading/Plan.md",
    );
    expect(result.state.selectedFolderPath).toBe("Reading");
    expect(result.state.explicitFolders).toStrictEqual(workspaceState.explicitFolders);
  });

  it("expands ancestors when a note moves into a nested folder", () => {
    const result = moveNoteInFolderWorkspace(
      workspaceState,
      "note-root",
      normalizeFolderPath("Projects/Grove/Ideas"),
    );

    expect(result.state.notes.find((note) => note.id === "note-root")?.path).toBe(
      "Projects/Grove/Ideas/Inbox.md",
    );
    expect(result.state.expandedFolderPaths).toStrictEqual([
      "Projects",
      "Projects/Grove",
      "Projects/Grove/Research",
    ]);
    expect(result.state.selectedFolderPath).toBe("Projects/Grove/Ideas");
  });

  it("rejects moves that would overwrite an existing note path", () => {
    expect(() =>
      moveNoteInFolderWorkspace(
        {
          ...workspaceState,
          notes: [
            ...workspaceState.notes,
            {
              id: "note-reading-plan",
              title: "Reading Plan",
              path: normalizeNoteFilePath("Reading/Plan.md"),
              updatedLabel: "Today",
            },
          ],
        },
        "note-plan",
        normalizeFolderPath("Reading"),
      ),
    ).toThrow("target Markdown path");
  });
});

describe("createPathChangeOperation", () => {
  it("creates a pending file and index operation for changed note paths", () => {
    const mutation = moveNoteInFolderWorkspace(
      workspaceState,
      "note-plan",
      normalizeFolderPath("Reading"),
    );

    expect(createPathChangeOperation("operation-1", mutation)).toStrictEqual({
      id: "operation-1",
      reason: "note-move",
      affectedNoteIds: ["note-plan"],
      pathChanges: [
        {
          noteId: "note-plan",
          previousPath: "Projects/Grove/Plan.md",
          nextPath: "Reading/Plan.md",
        },
      ],
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
    });
  });

  it("does not create an operation when paths are unchanged", () => {
    const mutation = moveNoteInFolderWorkspace(
      workspaceState,
      "note-plan",
      normalizeFolderPath("Projects/Grove"),
    );

    expect(createPathChangeOperation("operation-1", mutation)).toBeNull();
  });
});

describe("path change operation steps", () => {
  it("completes file moves before index refreshes", () => {
    const mutation = moveNoteInFolderWorkspace(
      workspaceState,
      "note-plan",
      normalizeFolderPath("Reading"),
    );
    const operation = createPathChangeOperation("operation-1", mutation);

    if (operation === null) {
      throw new Error("Expected path change operation.");
    }

    const afterFileMove = completeNextOperationStep([operation], "operation-1")[0];

    expect(afterFileMove?.steps).toStrictEqual([
      {
        id: "file-move",
        status: "completed",
      },
      {
        id: "index-refresh",
        status: "pending",
      },
    ]);
    expect(
      afterFileMove === undefined ? null : getNextPendingOperationStep(afterFileMove)?.id,
    ).toBe("index-refresh");

    const afterIndexRefresh = completeNextOperationStep([afterFileMove], "operation-1")[0];

    expect(
      afterIndexRefresh === undefined ? false : isPathChangeOperationComplete(afterIndexRefresh),
    ).toBe(true);
  });

  it("blocks later steps until a failed step is retried", () => {
    const mutation = renameFolderInWorkspace(
      workspaceState,
      normalizeFolderPath("Projects/Grove"),
      normalizeFolderPath("Areas/Grove"),
    );
    const operation = createPathChangeOperation("operation-1", mutation);

    if (operation === null) {
      throw new Error("Expected path change operation.");
    }

    const failedOperations = failNextOperationStep(
      [operation],
      "operation-1",
      "The target Markdown file already exists.",
    );
    const failedOperation = failedOperations[0];

    expect(
      failedOperation === undefined ? null : getNextPendingOperationStep(failedOperation),
    ).toBe(null);
    expect(
      failedOperation === undefined ? [] : getFailedOperationSteps(failedOperation),
    ).toStrictEqual([
      {
        id: "file-move",
        errorMessage: "The target Markdown file already exists.",
        status: "failed",
      },
    ]);

    const retryOperations = retryOperationStep(failedOperations, "operation-1", "file-move");
    const retryOperation = retryOperations[0];

    expect(
      retryOperation === undefined ? null : getNextPendingOperationStep(retryOperation)?.id,
    ).toBe("file-move");
    expect(retryOperation?.steps[0]).toStrictEqual({
      id: "file-move",
      status: "pending",
    });
  });

  it("runs file move and index refresh steps through the executor", async () => {
    const mutation = moveNoteInFolderWorkspace(
      workspaceState,
      "note-plan",
      normalizeFolderPath("Reading"),
    );
    const operation = createPathChangeOperation("operation-1", mutation);
    const executedSteps: string[] = [];

    if (operation === null) {
      throw new Error("Expected path change operation.");
    }

    const afterFileMove = await runNextOperationStep(operation, {
      async moveMarkdownFiles(pathChanges) {
        executedSteps.push(`file:${pathChanges.length}`);
      },
      async refreshIndexes(indexRefresh) {
        executedSteps.push(`index:${indexRefresh.noteIds.length}`);
      },
    });
    const afterIndexRefresh = await runNextOperationStep(afterFileMove, {
      async moveMarkdownFiles(pathChanges) {
        executedSteps.push(`file:${pathChanges.length}`);
      },
      async refreshIndexes(indexRefresh) {
        executedSteps.push(`index:${indexRefresh.noteIds.length}`);
      },
    });

    expect(executedSteps).toStrictEqual(["file:1", "index:1"]);
    expect(afterFileMove.steps[0]).toStrictEqual({
      id: "file-move",
      status: "completed",
    });
    expect(isPathChangeOperationComplete(afterIndexRefresh)).toBe(true);
  });

  it("marks the active step failed when executor work rejects", async () => {
    const mutation = moveNoteInFolderWorkspace(
      workspaceState,
      "note-plan",
      normalizeFolderPath("Reading"),
    );
    const operation = createPathChangeOperation("operation-1", mutation);

    if (operation === null) {
      throw new Error("Expected path change operation.");
    }

    const failedOperation = await runNextOperationStep(operation, {
      async moveMarkdownFiles() {
        throw new Error("The target Markdown file already exists.");
      },
      async refreshIndexes() {
        throw new Error("Index refresh should not run.");
      },
    });

    expect(failedOperation.steps[0]).toStrictEqual({
      id: "file-move",
      errorMessage: "The target Markdown file already exists.",
      status: "failed",
    });
    expect(getNextPendingOperationStep(failedOperation)).toBe(null);
  });
});

describe("reconcileFolderWorkspaceState", () => {
  it("moves stale folder selection back to the workspace root after a folder disappears", () => {
    const result = reconcileFolderWorkspaceState({
      ...workspaceState,
      notes: workspaceState.notes.filter((note) => !note.path.startsWith("Projects/Grove/")),
      explicitFolders: [normalizeFolderPath("Reading")],
      selectedFolderPath: normalizeFolderPath("Projects/Grove"),
      expandedFolderPaths: ["Projects", "Projects/Grove", "Projects/Grove/Research", "Reading"],
    });

    expect(result.selectedFolderPath).toBeNull();
    expect(result.expandedFolderPaths).toStrictEqual(["Reading"]);
  });

  it("keeps selection for an explicit empty folder that still exists", () => {
    const result = reconcileFolderWorkspaceState({
      ...workspaceState,
      notes: [],
      selectedFolderPath: normalizeFolderPath("Projects/Grove/Ideas"),
      expandedFolderPaths: ["Projects", "Projects/Grove", "Projects/Grove/Ideas"],
    });

    expect(result.selectedFolderPath).toBe("Projects/Grove/Ideas");
    expect(result.expandedFolderPaths).toStrictEqual([
      "Projects",
      "Projects/Grove",
      "Projects/Grove/Ideas",
    ]);
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
    expect(result.pathChanges).toStrictEqual([
      {
        noteId: "note-plan",
        previousPath: "Projects/Grove/Plan.md",
        nextPath: "Areas/Grove/Plan.md",
      },
      {
        noteId: "note-research",
        previousPath: "Projects/Grove/Research/Notes.md",
        nextPath: "Areas/Grove/Research/Notes.md",
      },
    ]);
    expect(result.indexRefresh).toStrictEqual({
      noteIds: ["note-plan", "note-research"],
      reason: "folder-rename",
    });
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

  it("allows parent folder renames when notes vacate each other's old paths", () => {
    const result = renameFolderInWorkspace(
      {
        ...workspaceState,
        notes: [
          {
            id: "note-nested-plan",
            title: "Nested Plan",
            path: normalizeNoteFilePath("Projects/Grove/Grove/Plan.md"),
            updatedLabel: "Today",
          },
          {
            id: "note-plan",
            title: "Plan",
            path: normalizeNoteFilePath("Projects/Grove/Plan.md"),
            updatedLabel: "Yesterday",
          },
        ],
      },
      normalizeFolderPath("Projects/Grove"),
      normalizeFolderPath("Projects"),
    );

    expect(result.pathChanges).toStrictEqual([
      {
        noteId: "note-nested-plan",
        previousPath: "Projects/Grove/Grove/Plan.md",
        nextPath: "Projects/Grove/Plan.md",
      },
      {
        noteId: "note-plan",
        previousPath: "Projects/Grove/Plan.md",
        nextPath: "Projects/Plan.md",
      },
    ]);
    expect(result.state.notes.map((note) => note.path)).toStrictEqual([
      "Projects/Grove/Plan.md",
      "Projects/Plan.md",
    ]);
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

  it("rejects folder renames that would overwrite an existing note path", () => {
    expect(() =>
      renameFolderInWorkspace(
        {
          ...workspaceState,
          notes: [
            ...workspaceState.notes,
            {
              id: "note-area-plan",
              title: "Area Plan",
              path: normalizeNoteFilePath("Areas/Grove/Plan.md"),
              updatedLabel: "Today",
            },
          ],
        },
        normalizeFolderPath("Projects/Grove"),
        normalizeFolderPath("Areas/Grove"),
      ),
    ).toThrow("target Markdown path");
  });
});
