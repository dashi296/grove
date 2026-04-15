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

      for (const pathChange of pathChanges) {
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
