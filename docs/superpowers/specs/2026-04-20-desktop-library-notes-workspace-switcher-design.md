# Desktop Library Notes Workspace Switcher Design

## Summary
Unify the desktop `Library` and `Notes` experience around an Inkdrop-style structure while keeping Grove's own visual language. The left side becomes the navigation area, the middle column shows notes for the selected scope, and the right pane remains the Markdown editor. Add a small bottom-left workspace switcher that opens a popover for switching and managing workspaces.

## Scope
- Restructure the desktop navigation surface into three visible regions:
  - Library navigation
  - scoped note list
  - editor pane
- Keep the current folder scope model: selecting a folder changes the note list scope.
- Add a bottom-left workspace switcher entry to the Library navigation area.
- Make the workspace switcher open a lightweight popover.
- Remove sync timestamp/status copy from the default workspace switcher UI.

## Out Of Scope
- Implementing non-plugin sync behavior.
- Showing sync timestamps or sync status in the workspace switcher.
- Adding bundled sync providers.
- Redesigning the editor internals.
- Changing Markdown file path semantics, folder path normalization, or path change queue behavior.
- Adding mobile navigation changes.

## Current State
`apps/desktop/src/features/folder-navigation/ui/FolderNavigationWorkspace.tsx` already composes a folder tree, a scoped note list, and an editor pane. Recent work simplified the desktop surface toward a two-pane layout, with `Sidebar` and `NoteList` grouped inside a single navigation column.

The current UI labels the folder tree as `Library` and the note list as `Notes`. This is directionally correct, but the experience should read less like two unrelated sections and more like one coherent navigation system.

## Goals
- Make `Library` and `Notes` feel like one desktop navigation flow.
- Keep folder selection and note selection visually distinct enough to remain understandable.
- Reserve the left-bottom area for current workspace identity and switching.
- Avoid implying that Grove has built-in sync when sync is plugin-only.
- Preserve existing local-first folder and note state boundaries.

## Chosen Approach
Adopt the structure of Inkdrop's desktop UI, but not its dark visual style.

The chosen layout:
- left column: `Library`
- middle column: `Notes`
- right column: editor

The Library column contains workspace-wide navigation and folder scope controls. The Notes column contains notes for the selected folder or all-notes scope. This gives the product the integrated feel of Inkdrop without copying its palette or density.

This approach is preferred because it:
- matches Grove's existing folder scope model
- keeps folder navigation and note browsing visible at the same time
- avoids hiding core navigation behind a hamburger menu or modal
- creates a stable home for workspace switching
- can be implemented by reshaping the existing `FolderNavigationWorkspace` UI instead of replacing the feature model

## Layout Design
### Library Column
The Library column is the leftmost column.

Default contents:
- Grove app label
- `Library` heading
- `All Notes`
- `Pinned Notes` placeholder if supported by the current UI slice, otherwise leave it out until the model exists
- `Folders` group
- folder tree with note counts
- `Tools` group for existing non-folder destinations when available
- bottom-left workspace switcher

The Library column should use Grove's light visual treatment:
- light background
- subtle borders
- selected folder or all-notes state using the existing green accent
- no dark Inkdrop-style sidebar

### Notes Column
The Notes column sits between Library and the editor.

Default contents:
- selected scope label, such as `All Notes`, `Projects`, or `Mobile app`
- `Notes` heading
- search field scoped to the current folder selection
- `New` action for creating a note in the current scope
- note list for `scopedNotes`

Selecting a folder updates the Notes column but does not close the active editor content. This preserves the existing distinction between browse scope and active note editing.

### Editor Pane
The editor pane remains the rightmost pane.

The design does not require editor behavior changes. Existing note load, save, dirty buffer, path change blocking, note links, backlinks, and contextual action behavior remain governed by the current folder-navigation feature model.

## Workspace Switcher
The workspace switcher is fixed at the bottom of the Library column.

Collapsed state:
- shows the current workspace name
- shows a neutral action hint such as `Switch workspace`
- does not show sync timestamps
- does not show sync state

Example copy:

```text
Personal Notes
Switch workspace
```

Popover contents:
- current workspace name
- recent workspaces
- `Add workspace`
- `Workspace settings`

The popover should be lightweight and local to the desktop shell. It should not become a full workspace management page for this slice.

## Sync Display Policy
Do not show sync date, sync status, or cloud status in this design.

Reason:
- Grove currently has no built-in sync outside plugins.
- Sync is default-off and provider-backed by plugins.
- Showing `Synced at ...` would imply a first-party sync system exists.

Future plugin-backed sync UI can add provider-specific status later through a dedicated plugin or sync surface. The workspace switcher may link to sync settings in the future, but it should not display sync state until the product has an explicit source for that state.

## State And Data Flow
Preserve the current folder-navigation state boundaries:
- `selectedFolderPath` controls the note list scope.
- `expandedFolderPaths` controls folder tree expansion.
- `scopedNotes` is derived from `notes` and `selectedFolderPath`.
- active editor content remains selected by note id and note edit buffer state.

Workspace switcher state should be separate from folder navigation state:
- current workspace identity belongs to workspace state
- popover open/closed state can stay local to the UI component
- recent workspaces belong to workspace management state once that model exists

Do not store absolute workspace paths in folder navigation state. If a workspace path is displayed later, derive a shortened display label from workspace state rather than mixing it into folder path semantics.

## Component Direction
Expected UI decomposition:
- `LibraryColumn`
- `FolderTree`
- `WorkspaceSwitcher`
- `WorkspaceSwitcherPopover`
- `NotesColumn`
- existing editor pane components

`FolderNavigationWorkspace` can remain the feature entry point. The internal component names can change as needed, but FSD boundaries should remain unchanged under `features/folder-navigation`.

## Testing Strategy
Add or update focused component tests for `FolderNavigationWorkspace`.

Test coverage should verify:
- the Library column contains all-notes and folder navigation
- selecting a folder changes the Notes column scope
- the Notes column renders notes for the selected folder scope
- the workspace switcher is visible at the bottom of the Library column
- opening the workspace switcher shows recent workspace, add workspace, and settings actions once those props/state exist
- the workspace switcher does not render sync timestamp or sync status copy
- existing note selection and editor loading behavior still works

Model tests should only be added if workspace switching introduces a new workspace state helper. This design should not require changes to `packages/core` folder semantics.

## Risks And Mitigations
- Risk: the UI appears like a three-column regression after recent two-pane simplification.
  - Mitigation: treat the left and middle columns as one navigation system visually, with consistent spacing and shared hierarchy.
- Risk: workspace switching scope grows into full workspace management.
  - Mitigation: keep this slice to a bottom-left trigger and a small popover.
- Risk: sync copy leaks back into the UI.
  - Mitigation: make "no sync timestamp/status" an explicit acceptance criterion and test assertion.
- Risk: `Pinned Notes` or `Tools` imply unavailable features.
  - Mitigation: only render items backed by current behavior, or mark them as separate follow-up slices.

## Acceptance Criteria
- Library and Notes read as a unified desktop navigation experience.
- The desktop layout follows the structure: Library column, Notes column, editor pane.
- Grove keeps a light visual style rather than an Inkdrop dark sidebar.
- The bottom-left workspace switcher is present.
- Clicking the workspace switcher opens a popover for recent workspaces, adding a workspace, and workspace settings.
- The workspace switcher does not show sync timestamps or sync status.
- Existing folder selection, note selection, note creation, save, delete, move, rename, and path-change guardrails remain intact.
