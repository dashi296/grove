export const appName = "Grove";

export {
  buildFolderTree,
  compareWorkspacePaths,
  getFolderDisplayName,
  getFolderPathForNote,
  getWorkspacePathDepth,
  isNoteInFolderScope,
  moveNoteToFolder,
  normalizeFolderPath,
  normalizeFolderScope,
  normalizeNoteFilePath,
  renameFolderInNotePath,
} from "./folders";
export type { FolderPath, FolderScope, FolderTreeNode, NoteFilePath } from "./folders";
export { deriveNoteTitle, renameNoteFilePath } from "./titles";
export type { DerivedNoteTitle, DerivedNoteTitleSource } from "./titles";
export { parseWikiLinks, resolveWikiLinks } from "./wikiLinks";
export type {
  ParsedWikiLink,
  ResolvedNoteLinks,
  ResolvedWikiLink,
  WikiLinkNote,
} from "./wikiLinks";

export type NoteLink = {
  fromId: string;
  toId: string;
  alias: string | null;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  filePath: string;
  tags: string[];
  links: NoteLink[];
  createdAt: Date;
  updatedAt: Date;
  syncedAt: Date | null;
};

export type SyncEntry = {
  path: string;
  hash: string;
  updatedAt: Date;
  size: number;
};

export interface SyncProvider {
  readonly id: string;
  readonly name: string;
  upload(path: string, data: Uint8Array): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  list(prefix?: string): Promise<SyncEntry[]>;
  delete(path: string): Promise<void>;
  isAvailable(): Promise<boolean>;
}

export type Tag = {
  id: string;
  name: string;
  noteCount: number;
};

export type GrovePlugin = {
  id: string;
  name: string;
  provides: {
    syncProvider?: SyncProvider;
  };
};

export function definePlugin(plugin: GrovePlugin): GrovePlugin {
  return plugin;
}
