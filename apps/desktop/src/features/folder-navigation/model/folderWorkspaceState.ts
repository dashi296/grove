import {
  compareWorkspacePaths,
  moveNoteToFolder,
  normalizeFolderPath,
  renameFolderInNotePath,
} from "@grove/core";
import type { FolderPath, FolderScope, NoteFilePath } from "@grove/core";

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

export type FolderWorkspaceMutation = {
  state: FolderWorkspaceState;
  affectedNoteIds: readonly string[];
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

export function isDescendantFolderPath(
  folderPath: FolderPath,
  parentFolderPath: FolderPath,
): boolean {
  return folderPath.startsWith(`${parentFolderPath}/`);
}

export function moveNoteInFolderWorkspace(
  state: FolderWorkspaceState,
  noteId: string,
  targetFolderPath: FolderScope,
): FolderWorkspaceMutation {
  const affectedNoteIds: string[] = [];
  const notes = state.notes.map((note) => {
    if (note.id !== noteId) {
      return note;
    }

    const nextPath = moveNoteToFolder(note.path, targetFolderPath);

    if (nextPath !== note.path) {
      affectedNoteIds.push(note.id);
    }

    return { ...note, path: nextPath };
  });

  return {
    affectedNoteIds,
    state: {
      ...state,
      notes,
      selectedFolderPath: targetFolderPath,
    },
  };
}

export function renameFolderInWorkspace(
  state: FolderWorkspaceState,
  sourceFolderPath: FolderPath,
  targetFolderPath: FolderScope,
): FolderWorkspaceMutation {
  if (targetFolderPath !== null && isDescendantFolderPath(targetFolderPath, sourceFolderPath)) {
    throw new Error("Choose a folder outside the selected folder.");
  }

  const affectedNoteIds: string[] = [];
  const notes = state.notes.map((note) => {
    const nextPath = renameFolderInNotePath(note.path, sourceFolderPath, targetFolderPath);

    if (nextPath !== note.path) {
      affectedNoteIds.push(note.id);
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

  return {
    affectedNoteIds,
    state: {
      ...state,
      notes,
      explicitFolders,
      expandedFolderPaths,
      selectedFolderPath: targetFolderPath,
    },
  };
}
