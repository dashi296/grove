type Opaque<Type, Token extends string> = Type & { readonly __type: Token };

export type FolderPath = Opaque<string, "FolderPath">;
export type NoteFilePath = Opaque<string, "NoteFilePath">;
export type FolderScope = FolderPath | null;

export type FolderTreeNode = {
  path: FolderPath;
  name: string;
  depth: number;
  directNoteCount: number;
  totalNoteCount: number;
  children: FolderTreeNode[];
};

type MutableFolderTreeNode = Omit<FolderTreeNode, "children"> & {
  children: MutableFolderTreeNode[];
};

const WINDOWS_DRIVE_PATH = /^[a-zA-Z]:[\\/]/;

function normalizeWorkspacePath(input: string): string {
  if (input.length === 0) {
    throw new Error("Workspace relative path must not be empty.");
  }

  if (WINDOWS_DRIVE_PATH.test(input)) {
    throw new Error("Workspace relative path must not include a drive prefix.");
  }

  const normalizedSeparators = input.replaceAll("\\", "/");

  if (normalizedSeparators.startsWith("/")) {
    throw new Error("Workspace relative path must not be absolute.");
  }

  const segments = normalizedSeparators.split("/").filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    throw new Error("Workspace relative path must include at least one segment.");
  }

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Workspace relative path must not include dot segments.");
  }

  return segments.join("/");
}

function asFolderPath(path: string): FolderPath {
  return path as FolderPath;
}

function asNoteFilePath(path: string): NoteFilePath {
  return path as NoteFilePath;
}

function getSegments(path: string): string[] {
  return path.split("/");
}

function getParentFolderPath(path: FolderPath): FolderPath | null {
  const segments = getSegments(path);

  if (segments.length === 1) {
    return null;
  }

  return asFolderPath(segments.slice(0, -1).join("/"));
}

function ensureFolderNode(
  nodes: Map<string, MutableFolderTreeNode>,
  path: FolderPath,
): MutableFolderTreeNode {
  const existingNode = nodes.get(path);

  if (existingNode !== undefined) {
    return existingNode;
  }

  const node: MutableFolderTreeNode = {
    path,
    name: getFolderDisplayName(path),
    depth: getWorkspacePathDepth(path),
    directNoteCount: 0,
    totalNoteCount: 0,
    children: [],
  };
  nodes.set(path, node);

  const parentPath = getParentFolderPath(path);

  if (parentPath !== null) {
    ensureFolderNode(nodes, parentPath).children.push(node);
  }

  return node;
}

function incrementAncestorCounts(
  nodes: Map<string, MutableFolderTreeNode>,
  folderPath: FolderPath | null,
): void {
  let currentPath = folderPath;

  while (currentPath !== null) {
    const node = ensureFolderNode(nodes, currentPath);
    node.totalNoteCount += 1;
    currentPath = getParentFolderPath(currentPath);
  }
}

function sortFolderTreeNodes(nodes: MutableFolderTreeNode[]): FolderTreeNode[] {
  return [...nodes]
    .sort((left, right) => compareWorkspacePaths(left.path, right.path))
    .map((node) => ({
      ...node,
      children: sortFolderTreeNodes(node.children),
    }));
}

export function normalizeFolderPath(input: string): FolderPath {
  return asFolderPath(normalizeWorkspacePath(input));
}

export function normalizeFolderScope(input: string | null): FolderScope {
  if (input === null || input === "") {
    return null;
  }

  return normalizeFolderPath(input);
}

export function normalizeNoteFilePath(input: string): NoteFilePath {
  const path = normalizeWorkspacePath(input);

  if (!path.toLowerCase().endsWith(".md")) {
    throw new Error("Note file path must point to a Markdown file.");
  }

  return asNoteFilePath(path);
}

export function getFolderPathForNote(notePath: NoteFilePath): FolderPath | null {
  const segments = getSegments(notePath);

  if (segments.length === 1) {
    return null;
  }

  return asFolderPath(segments.slice(0, -1).join("/"));
}

export function getWorkspacePathDepth(path: FolderPath | NoteFilePath): number {
  return getSegments(path).length;
}

export function getFolderDisplayName(folderPath: FolderScope): string {
  if (folderPath === null) {
    return "All Notes";
  }

  const segments = getSegments(folderPath);
  return segments[segments.length - 1] ?? "All Notes";
}

export function isNoteInFolderScope(notePath: NoteFilePath, folderScope: FolderScope): boolean {
  if (folderScope === null) {
    return true;
  }

  return notePath.startsWith(`${folderScope}/`);
}

export function moveNoteToFolder(
  notePath: NoteFilePath,
  targetFolderPath: FolderScope,
): NoteFilePath {
  const fileName = getSegments(notePath).at(-1);

  if (fileName === undefined) {
    throw new Error("Note file path must include a file name.");
  }

  if (targetFolderPath === null) {
    return asNoteFilePath(fileName);
  }

  return asNoteFilePath(`${targetFolderPath}/${fileName}`);
}

export function renameFolderInNotePath(
  notePath: NoteFilePath,
  fromFolderPath: FolderPath,
  toFolderPath: FolderScope,
): NoteFilePath {
  if (!isNoteInFolderScope(notePath, fromFolderPath)) {
    return notePath;
  }

  const suffix = notePath.slice(fromFolderPath.length + 1);

  if (toFolderPath === null) {
    return asNoteFilePath(suffix);
  }

  return asNoteFilePath(`${toFolderPath}/${suffix}`);
}

export function compareWorkspacePaths(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

export function buildFolderTree(
  notePaths: readonly NoteFilePath[],
  explicitFolderPaths: readonly FolderPath[] = [],
): FolderTreeNode[] {
  const nodes = new Map<string, MutableFolderTreeNode>();

  for (const folderPath of explicitFolderPaths) {
    ensureFolderNode(nodes, folderPath);
  }

  for (const notePath of notePaths) {
    const folderPath = getFolderPathForNote(notePath);

    if (folderPath === null) {
      continue;
    }

    const node = ensureFolderNode(nodes, folderPath);
    node.directNoteCount += 1;
    incrementAncestorCounts(nodes, folderPath);
  }

  const rootNodes = [...nodes.values()].filter((node) => getParentFolderPath(node.path) === null);
  return sortFolderTreeNodes(rootNodes);
}
