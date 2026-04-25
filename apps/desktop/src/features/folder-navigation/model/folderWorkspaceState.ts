import {
  buildFolderTree,
  compareWorkspacePaths,
  moveNoteToFolder,
  normalizeFolderPath,
  renameFolderInNotePath,
} from "@grove/core";
import type { FolderPath, FolderScope, FolderTreeNode, NoteFilePath } from "@grove/core";

export type FolderNavigationNote = {
  id: string;
  title: string;
  path: NoteFilePath;
  content?: string;
  tags: readonly string[];
  updatedLabel: string;
};

export type FolderWorkspaceState = {
  notes: readonly FolderNavigationNote[];
  explicitFolders: readonly FolderPath[];
  selectedFolderPath: FolderScope;
  expandedFolderPaths: readonly string[];
};

export type FolderWorkspacePathChange = {
  noteId: string;
  previousPath: NoteFilePath;
  nextPath: NoteFilePath;
};

export type FolderWorkspaceIndexRefresh = {
  noteIds: readonly string[];
  reason: "note-move" | "folder-rename" | "note-delete";
};

type FolderWorkspaceIndexRefreshReason = FolderWorkspaceIndexRefresh["reason"];

export type FolderWorkspaceOperationStepId = "file-move" | "index-refresh";

export type FolderWorkspaceOperationStepStatus = "pending" | "completed" | "failed";

export type FolderWorkspaceOperationStep = {
  id: FolderWorkspaceOperationStepId;
  status: FolderWorkspaceOperationStepStatus;
  errorMessage?: string;
};

export type FolderWorkspaceMutation = {
  state: FolderWorkspaceState;
  pathChanges: readonly FolderWorkspacePathChange[];
  affectedNoteIds: readonly string[];
  indexRefresh: FolderWorkspaceIndexRefresh;
};

export type FolderWorkspaceDeleteMutation = {
  mutation: FolderWorkspaceMutation;
  nextSelectedNoteId: string;
};

export type FolderWorkspacePathChangeOperation = {
  id: string;
  reason: FolderWorkspaceIndexRefreshReason;
  pathChanges: readonly FolderWorkspacePathChange[];
  affectedNoteIds: readonly string[];
  steps: readonly FolderWorkspaceOperationStep[];
};

export type FolderWorkspacePathChangeExecutor = {
  moveMarkdownFiles: (pathChanges: readonly FolderWorkspacePathChange[]) => Promise<void>;
  refreshIndexes: (indexRefresh: FolderWorkspaceIndexRefresh) => Promise<void>;
};

function isFolderPathWithin(folderPath: FolderPath, parentFolderPath: FolderPath): boolean {
  return folderPath === parentFolderPath || folderPath.startsWith(`${parentFolderPath}/`);
}

function replaceFolderPrefix(
  folderPath: FolderPath,
  fromFolderPath: FolderPath,
  toFolderPath: FolderScope,
): FolderScope {
  if (!isFolderPathWithin(folderPath, fromFolderPath)) {
    return folderPath;
  }

  const suffix = folderPath === fromFolderPath ? "" : folderPath.slice(fromFolderPath.length + 1);

  if (toFolderPath === null) {
    return suffix === "" ? null : normalizeFolderPath(suffix);
  }

  return normalizeFolderPath(suffix === "" ? toFolderPath : `${toFolderPath}/${suffix}`);
}

function dedupeAndSortFolderPaths(folderPaths: readonly FolderPath[]): FolderPath[] {
  return [...new Set(folderPaths)].sort(compareWorkspacePaths);
}

function dedupeExpandedFolderPaths(folderPaths: readonly string[]): string[] {
  return [...new Set(folderPaths)].sort(compareWorkspacePaths);
}

function getFolderPathAncestors(folderPath: FolderPath): FolderPath[] {
  const segments = folderPath.split("/");
  const ancestors: FolderPath[] = [];

  for (let index = 1; index < segments.length; index += 1) {
    ancestors.push(normalizeFolderPath(segments.slice(0, index).join("/")));
  }

  return ancestors;
}

function flattenFolderTreePaths(folderTree: readonly FolderTreeNode[]): FolderPath[] {
  return folderTree.flatMap((node) => [node.path, ...flattenFolderTreePaths(node.children)]);
}

function getExistingFolderPathSet(state: FolderWorkspaceState): Set<string> {
  const folderTree = buildFolderTree(
    state.notes.map((note) => note.path),
    state.explicitFolders,
  );

  return new Set(flattenFolderTreePaths(folderTree));
}

function createWorkspaceMutation(
  state: FolderWorkspaceState,
  pathChanges: readonly FolderWorkspacePathChange[],
  reason: FolderWorkspaceIndexRefreshReason,
): FolderWorkspaceMutation {
  const affectedNoteIds = pathChanges.map((pathChange) => pathChange.noteId);

  return {
    affectedNoteIds,
    indexRefresh: {
      noteIds: affectedNoteIds,
      reason,
    },
    pathChanges,
    state,
  };
}

function assertPathChangesDoNotConflict(
  notes: readonly FolderNavigationNote[],
  pathChanges: readonly FolderWorkspacePathChange[],
): void {
  if (pathChanges.length === 0) {
    return;
  }

  const pathChangesByNoteId = new Map<string, FolderWorkspacePathChange>();
  const finalPathOwners = new Map<NoteFilePath, string[]>();

  for (const pathChange of pathChanges) {
    pathChangesByNoteId.set(pathChange.noteId, pathChange);
  }

  for (const note of notes) {
    const finalPath = pathChangesByNoteId.get(note.id)?.nextPath ?? note.path;
    const ownerIds = finalPathOwners.get(finalPath) ?? [];

    finalPathOwners.set(finalPath, [...ownerIds, note.id]);
  }

  for (const pathChange of pathChanges) {
    const ownerIds = finalPathOwners.get(pathChange.nextPath) ?? [];

    if (ownerIds.some((ownerId) => ownerId !== pathChange.noteId)) {
      throw new Error("A note already uses the target Markdown path.");
    }
  }
}

export function createPathChangeOperation(
  id: string,
  mutation: FolderWorkspaceMutation,
): FolderWorkspacePathChangeOperation | null {
  if (mutation.pathChanges.length === 0) {
    return null;
  }

  return {
    id,
    affectedNoteIds: mutation.affectedNoteIds,
    pathChanges: mutation.pathChanges,
    reason: mutation.indexRefresh.reason,
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
}

export function getNextPendingOperationStep(
  operation: FolderWorkspacePathChangeOperation,
): FolderWorkspaceOperationStep | null {
  if (operation.steps.some((step) => step.status === "failed")) {
    return null;
  }

  return operation.steps.find((step) => step.status === "pending") ?? null;
}

export function getFailedOperationSteps(
  operation: FolderWorkspacePathChangeOperation,
): FolderWorkspaceOperationStep[] {
  return operation.steps.filter((step) => step.status === "failed");
}

export function isPathChangeOperationComplete(
  operation: FolderWorkspacePathChangeOperation,
): boolean {
  return operation.steps.every((step) => step.status === "completed");
}

export function clearCompletedPathChangeOperations(
  operations: readonly FolderWorkspacePathChangeOperation[],
): FolderWorkspacePathChangeOperation[] {
  return operations.filter((operation) => !isPathChangeOperationComplete(operation));
}

export function getNextRunnablePathChangeOperationId(
  operations: readonly FolderWorkspacePathChangeOperation[],
  runningOperationIds: readonly string[],
): string | null {
  if (runningOperationIds.length > 0) {
    return null;
  }

  for (const operation of [...operations].reverse()) {
    if (isPathChangeOperationComplete(operation)) {
      continue;
    }

    const nextStep = getNextPendingOperationStep(operation);

    return nextStep === null ? null : operation.id;
  }

  return null;
}

export function completeNextOperationStep(
  operations: readonly FolderWorkspacePathChangeOperation[],
  operationId: string,
): FolderWorkspacePathChangeOperation[] {
  return operations.map((operation) => {
    if (operation.id !== operationId) {
      return operation;
    }

    const nextStep = getNextPendingOperationStep(operation);

    if (nextStep === null) {
      return operation;
    }

    return updateOperationStep(operation, nextStep.id, {
      status: "completed",
    });
  });
}

export function failNextOperationStep(
  operations: readonly FolderWorkspacePathChangeOperation[],
  operationId: string,
  errorMessage: string,
): FolderWorkspacePathChangeOperation[] {
  return operations.map((operation) => {
    if (operation.id !== operationId) {
      return operation;
    }

    const nextStep = getNextPendingOperationStep(operation);

    if (nextStep === null) {
      return operation;
    }

    return updateOperationStep(operation, nextStep.id, {
      errorMessage,
      status: "failed",
    });
  });
}

export function retryOperationStep(
  operations: readonly FolderWorkspacePathChangeOperation[],
  operationId: string,
  stepId: FolderWorkspaceOperationStepId,
): FolderWorkspacePathChangeOperation[] {
  return operations.map((operation) => {
    if (operation.id !== operationId) {
      return operation;
    }

    return updateOperationStep(operation, stepId, {
      status: "pending",
    });
  });
}

export async function runNextOperationStep(
  operation: FolderWorkspacePathChangeOperation,
  executor: FolderWorkspacePathChangeExecutor,
): Promise<FolderWorkspacePathChangeOperation> {
  const nextStep = getNextPendingOperationStep(operation);

  if (nextStep === null) {
    return operation;
  }

  try {
    if (nextStep.id === "file-move") {
      await executor.moveMarkdownFiles(operation.pathChanges);
    } else {
      await executor.refreshIndexes({
        noteIds: operation.affectedNoteIds,
        reason: operation.reason,
      });
    }

    return updateOperationStep(operation, nextStep.id, {
      status: "completed",
    });
  } catch (error) {
    return updateOperationStep(operation, nextStep.id, {
      errorMessage: getOperationErrorMessage(error),
      status: "failed",
    });
  }
}

export function isDescendantFolderPath(
  folderPath: FolderPath,
  parentFolderPath: FolderPath,
): boolean {
  return folderPath.startsWith(`${parentFolderPath}/`);
}

export function reconcileFolderWorkspaceState(state: FolderWorkspaceState): FolderWorkspaceState {
  const existingFolderPaths = getExistingFolderPathSet(state);
  const selectedFolderPath =
    state.selectedFolderPath !== null && existingFolderPaths.has(state.selectedFolderPath)
      ? state.selectedFolderPath
      : null;
  const expandedFolderPaths = dedupeExpandedFolderPaths(
    state.expandedFolderPaths
      .map((folderPath) => normalizeFolderPath(folderPath))
      .filter((folderPath) => existingFolderPaths.has(folderPath)),
  );

  return {
    ...state,
    expandedFolderPaths,
    selectedFolderPath,
  };
}

export function addExplicitFolderToWorkspace(
  state: FolderWorkspaceState,
  folderPath: FolderPath,
): FolderWorkspaceState {
  return reconcileFolderWorkspaceState({
    ...state,
    explicitFolders: dedupeAndSortFolderPaths([...state.explicitFolders, folderPath]),
    expandedFolderPaths: dedupeExpandedFolderPaths([
      ...state.expandedFolderPaths,
      ...getFolderPathAncestors(folderPath),
    ]),
    selectedFolderPath: folderPath,
  });
}

export function moveNoteInFolderWorkspace(
  state: FolderWorkspaceState,
  noteId: string,
  targetFolderPath: FolderScope,
): FolderWorkspaceMutation {
  const pathChanges: FolderWorkspacePathChange[] = [];
  const notes = state.notes.map((note) => {
    if (note.id !== noteId) {
      return note;
    }

    const nextPath = moveNoteToFolder(note.path, targetFolderPath);

    if (nextPath !== note.path) {
      pathChanges.push({
        noteId: note.id,
        previousPath: note.path,
        nextPath,
      });
    }

    return { ...note, path: nextPath };
  });
  assertPathChangesDoNotConflict(state.notes, pathChanges);

  return createWorkspaceMutation(
    {
      ...state,
      notes,
      expandedFolderPaths:
        targetFolderPath === null
          ? state.expandedFolderPaths
          : dedupeExpandedFolderPaths([
              ...state.expandedFolderPaths,
              ...getFolderPathAncestors(targetFolderPath),
            ]),
      selectedFolderPath: targetFolderPath,
    },
    pathChanges,
    "note-move",
  );
}

export function renameFolderInWorkspace(
  state: FolderWorkspaceState,
  sourceFolderPath: FolderPath,
  targetFolderPath: FolderScope,
): FolderWorkspaceMutation {
  if (targetFolderPath !== null && isDescendantFolderPath(targetFolderPath, sourceFolderPath)) {
    throw new Error("Choose a folder outside the selected folder.");
  }

  const pathChanges: FolderWorkspacePathChange[] = [];
  const notes = state.notes.map((note) => {
    const nextPath = renameFolderInNotePath(note.path, sourceFolderPath, targetFolderPath);

    if (nextPath !== note.path) {
      pathChanges.push({
        noteId: note.id,
        previousPath: note.path,
        nextPath,
      });
    }

    return { ...note, path: nextPath };
  });
  assertPathChangesDoNotConflict(state.notes, pathChanges);

  const explicitFolders = dedupeAndSortFolderPaths(
    state.explicitFolders.flatMap((folderPath) => {
      const nextPath = replaceFolderPrefix(folderPath, sourceFolderPath, targetFolderPath);
      return nextPath === null ? [] : [nextPath];
    }),
  );
  const expandedFolderPaths = dedupeExpandedFolderPaths([
    ...state.expandedFolderPaths.flatMap((folderPath) => {
      const nextPath = replaceFolderPrefix(
        normalizeFolderPath(folderPath),
        sourceFolderPath,
        targetFolderPath,
      );
      return nextPath === null ? [] : [nextPath];
    }),
    ...(targetFolderPath === null ? [] : getFolderPathAncestors(targetFolderPath)),
  ]);

  return createWorkspaceMutation(
    {
      ...state,
      notes,
      explicitFolders,
      expandedFolderPaths,
      selectedFolderPath: targetFolderPath,
    },
    pathChanges,
    "folder-rename",
  );
}

export function deleteNoteFromFolderWorkspace(
  state: FolderWorkspaceState,
  noteId: string,
): FolderWorkspaceMutation {
  const noteToDelete = state.notes.find((note) => note.id === noteId);

  if (noteToDelete === undefined) {
    throw new Error("Choose an existing note before deleting it.");
  }

  return {
    affectedNoteIds: [noteToDelete.id],
    indexRefresh: {
      noteIds: [noteToDelete.id],
      reason: "note-delete",
    },
    pathChanges: [],
    state: reconcileFolderWorkspaceState({
      ...state,
      notes: state.notes.filter((note) => note.id !== noteId),
    }),
  };
}

export function getNextSelectedNoteIdAfterDelete(
  notes: readonly FolderNavigationNote[],
  deletedNoteId: string,
  selectedNoteId: string,
): string {
  const deletedIndex = notes.findIndex((note) => note.id === deletedNoteId);

  if (deletedIndex === -1) {
    throw new Error("Choose an existing note before deleting it.");
  }

  const remainingNotes = notes.filter((note) => note.id !== deletedNoteId);

  if (deletedNoteId !== selectedNoteId) {
    return remainingNotes.some((note) => note.id === selectedNoteId) ? selectedNoteId : "";
  }

  return (
    remainingNotes[deletedIndex]?.id ?? remainingNotes[Math.max(0, deletedIndex - 1)]?.id ?? ""
  );
}

export function deleteSelectedNoteFromFolderWorkspace(
  state: FolderWorkspaceState,
  noteId: string,
  selectedNoteId: string,
): FolderWorkspaceDeleteMutation {
  return {
    mutation: deleteNoteFromFolderWorkspace(state, noteId),
    nextSelectedNoteId: getNextSelectedNoteIdAfterDelete(state.notes, noteId, selectedNoteId),
  };
}

function updateOperationStep(
  operation: FolderWorkspacePathChangeOperation,
  stepId: FolderWorkspaceOperationStepId,
  nextStepState: Pick<FolderWorkspaceOperationStep, "status"> &
    Partial<Pick<FolderWorkspaceOperationStep, "errorMessage">>,
): FolderWorkspacePathChangeOperation {
  return {
    ...operation,
    steps: operation.steps.map((step) => {
      if (step.id !== stepId) {
        return step;
      }

      return nextStepState.errorMessage === undefined
        ? {
            id: step.id,
            status: nextStepState.status,
          }
        : {
            id: step.id,
            errorMessage: nextStepState.errorMessage,
            status: nextStepState.status,
          };
    }),
  };
}

function getOperationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The local path change step failed.";
}
