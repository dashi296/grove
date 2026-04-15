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
  reason: "note-move" | "folder-rename";
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

export type FolderWorkspacePathChangeOperation = {
  id: string;
  reason: FolderWorkspaceIndexRefreshReason;
  pathChanges: readonly FolderWorkspacePathChange[];
  affectedNoteIds: readonly string[];
  steps: readonly FolderWorkspaceOperationStep[];
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
