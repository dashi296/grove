import type {
  FolderWorkspaceIndexRefresh,
  FolderWorkspacePathChange,
  FolderWorkspacePathChangeExecutor,
} from "./folderWorkspaceState";

export type DesktopPathChangeFileGateway = {
  moveMarkdownFile: (pathChange: FolderWorkspacePathChange) => Promise<void>;
};

export type DesktopPathChangeIndexGateway = {
  refreshNoteIndexes: (indexRefresh: FolderWorkspaceIndexRefresh) => Promise<void>;
};

export type DesktopPathChangeExecutorDependencies = {
  fileGateway: DesktopPathChangeFileGateway;
  indexGateway: DesktopPathChangeIndexGateway;
};

export function createDesktopPathChangeExecutor({
  fileGateway,
  indexGateway,
}: DesktopPathChangeExecutorDependencies): FolderWorkspacePathChangeExecutor {
  return {
    async moveMarkdownFiles(pathChanges) {
      assertUniqueTargetPaths(pathChanges);

      for (const pathChange of sortPathChangesForMove(pathChanges)) {
        await fileGateway.moveMarkdownFile(pathChange);
      }
    },
    async refreshIndexes(indexRefresh) {
      await indexGateway.refreshNoteIndexes(indexRefresh);
    },
  };
}

function assertUniqueTargetPaths(pathChanges: readonly FolderWorkspacePathChange[]): void {
  const targetPaths = new Set<string>();

  for (const pathChange of pathChanges) {
    if (targetPaths.has(pathChange.nextPath)) {
      throw new Error("Multiple notes target the same Markdown path.");
    }

    targetPaths.add(pathChange.nextPath);
  }
}

function sortPathChangesForMove(
  pathChanges: readonly FolderWorkspacePathChange[],
): FolderWorkspacePathChange[] {
  const orderedPathChanges: FolderWorkspacePathChange[] = [];
  const sourcePathOwners = new Map<string, FolderWorkspacePathChange>();
  const visitingSourcePaths = new Set<string>();
  const visitedSourcePaths = new Set<string>();

  for (const pathChange of pathChanges) {
    if (sourcePathOwners.has(pathChange.previousPath)) {
      throw new Error("Multiple notes move from the same Markdown path.");
    }

    sourcePathOwners.set(pathChange.previousPath, pathChange);
  }

  for (const pathChange of pathChanges) {
    visitPathChange(pathChange, {
      orderedPathChanges,
      sourcePathOwners,
      visitedSourcePaths,
      visitingSourcePaths,
    });
  }

  return orderedPathChanges;
}

type PathChangeSortState = {
  orderedPathChanges: FolderWorkspacePathChange[];
  sourcePathOwners: ReadonlyMap<string, FolderWorkspacePathChange>;
  visitedSourcePaths: Set<string>;
  visitingSourcePaths: Set<string>;
};

function visitPathChange(
  pathChange: FolderWorkspacePathChange,
  {
    orderedPathChanges,
    sourcePathOwners,
    visitedSourcePaths,
    visitingSourcePaths,
  }: PathChangeSortState,
): void {
  if (visitedSourcePaths.has(pathChange.previousPath)) {
    return;
  }

  if (visitingSourcePaths.has(pathChange.previousPath)) {
    throw new Error("Circular Markdown path moves need a temporary path.");
  }

  visitingSourcePaths.add(pathChange.previousPath);

  const blockingPathChange = sourcePathOwners.get(pathChange.nextPath);

  if (blockingPathChange !== undefined && blockingPathChange.noteId !== pathChange.noteId) {
    visitPathChange(blockingPathChange, {
      orderedPathChanges,
      sourcePathOwners,
      visitedSourcePaths,
      visitingSourcePaths,
    });
  }

  visitingSourcePaths.delete(pathChange.previousPath);
  visitedSourcePaths.add(pathChange.previousPath);
  orderedPathChanges.push(pathChange);
}
