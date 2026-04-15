# Note App MVP Plan

## Goal

Grove の次の実装目標は、desktop で実際の Markdown ノートを作成、編集、保存、再読み込みできる状態にすることです。
Obsidian のようなノートアプリとして成立する最小単位は、UI shell や folder navigation ではなく、ローカル Markdown ファイルを正本にした note lifecycle です。

この計画では、desktop を最初の実装対象にします。
mobile は同じ core semantics と persistence contract を使いますが、foundation と navigation の未完了 issue が残っているため、desktop MVP の後に接続します。

## Current State

実装済み:

- Tauri + React desktop shell
- folder path semantics in `packages/core`
- desktop folder tree / scoped note list UI
- desktop folder move / rename state model
- Tauri command 境界の型付き wrapper
- plugin API package
- desktop plugin host validation

不足しているもの:

- workspace 配下の Markdown file scan
- note creation
- note body editing
- local Markdown file read / write
- editor package integration
- title derivation / rename behavior
- WikiLink parsing and backlinks
- full-text search
- delete / archive behavior

## Product Scope

### MVP

MVP は desktop で以下を満たす状態です。

- workspace を選ぶと `.md` files が note list と folder tree に反映される
- folder scope 内で新規 note を作成できる
- note を選択して Markdown content を編集できる
- save すると Markdown file が workspace に保存される
- app を再起動しても Markdown file から note が復元される
- file path collision、保存失敗、外部変更の最低限の error state を表示する

### Post-MVP

MVP 後に Obsidian らしい体験へ拡張します。

- Markdown editor commands
- WikiLink parsing and backlinks
- search
- tags
- attachments
- graph view
- plugin store UI
- sync settings

## Architecture

### Source of Truth

Markdown file が note content の正本です。
React state と SQLite index は派生状態として扱います。

```text
workspace Markdown files
  -> workspace scan
  -> Note[]
  -> folder tree / note list / editor selection
  -> edit buffer
  -> Markdown file write
  -> index refresh
```

### Boundaries

- `packages/core`
  - note path normalization
  - folder semantics
  - pure note metadata derivation
  - WikiLink and tag parsing rules
- `packages/db`
  - derived SQLite index
  - search-facing query API
  - rebuild / refresh orchestration
- `packages/editor`
  - editor adapter contract
  - Markdown command intent model
- `apps/desktop`
  - Tauri command bridge
  - workspace scan / file read / write UI flow
  - note creation and editing screens
  - desktop-specific error presentation
- `apps/desktop/src-tauri`
  - async file I/O
  - file watcher
  - native dialog and workspace access

### State Model

The desktop note workspace should separate persisted notes from editing buffers.

```typescript
type DesktopNoteSummary = {
  id: string;
  title: string;
  filePath: NoteFilePath;
  updatedAt: Date;
};

type DesktopNoteDocument = DesktopNoteSummary & {
  content: string;
};

type NoteEditBuffer = {
  noteId: string;
  baseContent: string;
  draftContent: string;
  status: "clean" | "dirty" | "saving" | "error";
  errorMessage: string | null;
};
```

Notes loaded from disk should be treated as snapshots.
The editor owns draft state until save succeeds.

## Implementation Issues

Created GitHub issues:

- #46 Implement desktop workspace Markdown scan
- #51 Implement desktop note creation flow
- #47 Implement desktop note loading and editor draft state
- #50 Persist desktop note edits to Markdown files
- #49 Connect desktop folder navigation to real note state
- #48 Integrate Markdown editor package on desktop
- #52 Define note title derivation and rename semantics
- #56 Implement WikiLink parsing and backlinks
- #55 Implement local note search
- #54 Implement desktop note delete or archive behavior
- #53 Track desktop note app MVP implementation

### 1. Implement desktop workspace Markdown scan

Load real Markdown files from a selected workspace and replace the current mock note list.

Scope:

- add Tauri command to recursively list Markdown files under the workspace
- reject paths outside the workspace
- normalize returned paths as `NoteFilePath`
- derive note summary metadata from file path, first heading, and file modified time
- expose a typed command wrapper in `apps/desktop/src/shared/api`
- connect folder navigation to scan results

Acceptance criteria:

- desktop folder tree is built from real workspace Markdown files
- non-Markdown files are ignored
- absolute paths are not stored in React state
- scan errors are shown without crashing the app
- tests cover path normalization and scan result mapping

### 2. Implement desktop note creation flow

Create a new Markdown note from the current folder scope.

Scope:

- add New note action to the desktop folder navigation UI
- generate a safe file name from title or untitled fallback
- create notes in the selected `FolderScope`
- prevent collisions with existing note paths
- create the file through Tauri async file I/O
- select and open the new note after creation

Acceptance criteria:

- New note creates a Markdown file in the selected folder
- root folder creation writes to workspace root
- duplicate names are rejected or disambiguated predictably
- note list and folder tree update after creation
- tests cover root, nested folder, and collision cases

### 3. Implement desktop note loading and editor draft state

Open a note and edit its Markdown content in memory.

Scope:

- add Tauri command to read a Markdown file by workspace-relative path
- add desktop note editor UI for selected note content
- track clean / dirty / error edit buffer state
- preserve unsaved edits while switching folder scope
- warn or block when changing selected note would discard dirty content

Acceptance criteria:

- selecting a note loads its Markdown content
- editing content marks the buffer dirty
- folder selection does not discard the active editor buffer
- read errors are displayed in the editor pane
- tests cover buffer transitions

### 4. Persist desktop note edits to Markdown files

Save editor draft content back to disk and refresh derived state.

Scope:

- add Tauri command to write Markdown content by workspace-relative path
- connect Save action and keyboard shortcut
- update note metadata after save
- trigger derived index refresh after successful write
- keep dirty state when save fails

Acceptance criteria:

- edited content is written to the correct Markdown file
- successful save returns the buffer to clean
- failed save leaves the draft intact and shows an error
- app restart reloads saved content from disk
- tests cover save success and failure paths

### 5. Connect desktop folder navigation to real note state

Replace mock `initialNotes` and `initialExplicitFolders` with workspace-backed state.

Scope:

- introduce a desktop note workspace model for notes, explicit folders, selected folder, selected note, and operations
- feed real notes into `buildFolderTree`
- reconcile stale selected folder and selected note after scan refresh
- keep move / rename operations working with real note paths
- remove mock-only updated labels or derive them from file metadata

Acceptance criteria:

- folder navigation displays real workspace content
- moving or renaming paths updates real state and re-scan output
- stale folder selection falls back to root
- selected note remains open when folder scope changes
- tests cover reconciliation with real note summaries

### 6. Integrate Markdown editor package on desktop

Replace placeholder editor package usage with a real Markdown editor adapter.

Scope:

- define `packages/editor` public editor adapter contract
- add CodeMirror 6 desktop implementation or an integration wrapper
- expose Markdown command intents for bold, italic, heading, link, and code
- connect the editor component to desktop draft state
- keep package API independent of Tauri and React Router

Acceptance criteria:

- desktop editor can edit Markdown with a usable text area or CodeMirror surface
- editor value is controlled by the note draft state
- basic Markdown commands can be invoked through the adapter
- package and desktop tests cover value changes and command dispatch

### 7. Define note title derivation and rename semantics

Make note titles predictable and compatible with local Markdown files.

Scope:

- define precedence: frontmatter title, first H1, file stem
- add pure title derivation helper in `packages/core`
- define when editing title renames a file versus only changes metadata
- validate rename collisions using existing path semantics
- document behavior in `packages/core/README.md`

Acceptance criteria:

- note title is derived consistently from Markdown content and file path
- title changes do not silently overwrite existing files
- folder tree and note list stay consistent after rename
- tests cover frontmatter, H1, file stem, and collision cases

### 8. Implement WikiLink parsing and backlinks

Add the first Obsidian-like linking feature.

Scope:

- parse `[[Title]]` and `[[Title|Alias]]` in `packages/core`
- resolve links against the loaded note collection
- expose backlinks as derived note metadata
- show backlinks in desktop note pane
- keep unresolved links visible as unresolved references

Acceptance criteria:

- links are parsed from Markdown content
- backlinks update after note save and scan refresh
- unresolved links do not crash resolution
- tests cover aliases, duplicate titles, and unresolved links

### 9. Implement local note search

Search notes by title, path, and content.

Scope:

- start with in-memory search over loaded notes if SQLite FTS is not ready
- define the query API boundary so SQLite FTS can replace it later
- support current folder scope as an optional filter
- open selected search result in the desktop editor

Acceptance criteria:

- search returns matching notes from title, path, and body
- folder scope filter narrows results
- selecting a result opens the note
- tests cover title, content, path, and folder-filtered search

### 10. Implement desktop note delete or archive behavior

Support removing notes safely.

Scope:

- decide delete versus trash/archive for MVP
- implement Tauri command for the selected behavior
- update note list, folder tree, selected note, and open editor state
- prevent accidental deletion through confirmation
- document recovery expectations

Acceptance criteria:

- user can remove a note from the desktop UI
- deleted note disappears from scan-derived state
- deleting an open note clears or changes the active editor state safely
- errors are shown without losing local UI state
- tests cover selected and unselected note deletion

## Suggested Milestones

### Milestone 1: Real Files

Issues 1 through 5.

Outcome:

- Grove can load, create, edit, save, and reload real Markdown notes on desktop.

### Milestone 2: Better Editing

Issues 6 and 7.

Outcome:

- Grove has a usable Markdown editing surface and stable title behavior.

### Milestone 3: Knowledge Features

Issues 8 through 10.

Outcome:

- Grove starts behaving like a linked knowledge base rather than only a file-backed editor.

## Verification Baseline

Each implementation PR should run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format
git diff --check
```

Desktop-facing implementation PRs should also run:

```bash
pnpm --filter @grove/desktop test
pnpm --filter @grove/desktop typecheck
pnpm --filter @grove/desktop build
```

Rust command changes should run the relevant Cargo checks from `apps/desktop/src-tauri`.
