# Issue 75 Desktop Contextual Actions Design

## Summary

Simplify the desktop editor surface by removing always-visible workspace-management controls from the main pane. Keep note move, folder rename, and note delete available through explicit contextual disclosure panels so the default state stays focused on reading and editing Markdown.

## Scope

- Move the always-visible `Move selected note` form out of the default editor flow.
- Move the always-visible `Rename selected folder` form out of the default editor flow.
- Move `Delete note` behind the same contextual disclosure pattern instead of leaving it permanently visible.
- Preserve existing dirty-draft, pending-path-change, and path-conflict guardrails.

## Out Of Scope

- Redesigning the two-pane layout introduced by issue #74.
- Changing the underlying folder workspace mutation model or path change queue semantics.
- Hiding tags, links, backlinks, or diagnostics by default beyond what is necessary to keep the action sections contextual.
- Introducing a new modal or dialog infrastructure.

## Current State

`ActivePane` in `apps/desktop/src/features/folder-navigation/ui/FolderNavigationWorkspace.tsx` renders the editor together with:

- the note path
- the links/backlinks sections
- the move-note form
- the delete-note action
- the rename-folder form

This keeps workspace-management controls in view even when the user only wants to read or edit a note.

## Goals

The default right-pane state should read as:

- note title
- save state and edit controls
- Markdown editor

Secondary actions should still be reachable without moving them to a different pane or changing the existing mutation logic.

## Chosen Approach

Use inline disclosure sections in the right pane:

- `Note actions`
- `Folder actions`

The disclosures are collapsed by default. Users opt in to seeing move / delete / rename controls by expanding the relevant section.

This approach is preferred because it:

- preserves the existing two-pane information architecture from issue #74
- keeps actions close to the edited note and current folder context
- avoids adding modal state or new shared UI primitives for a narrowly scoped cleanup
- leaves a natural place for future details-oriented UI work in issue #73

## Component Design

### ActivePane

`ActivePane` will remain responsible for the right-pane composition, but its default visible stack will be reduced.

Default visible content:

- active note heading
- development-only path change diagnostics toggle
- note path text, unchanged in the default view for this issue
- `NoteEditor`

Contextual content:

- `Note actions` disclosure
- `Folder actions` disclosure
- development-only path change queue when expanded

### Note Actions Disclosure

Visible only when a note is selected.

Contents:

- existing move-note control
- existing delete-note action block

Behavior:

- collapsed by default
- keeps the current move mutation flow
- keeps the current delete blocking and error messages
- delete copy should remain explicit that the Markdown file is permanently removed

### Folder Actions Disclosure

Visible regardless of note selection because folder context comes from the selected folder.

Contents:

- existing rename-folder control
- operation feedback message currently shown below the editor

Behavior:

- collapsed by default
- workspace root keeps the rename input and button disabled
- descendant-path validation remains unchanged

## Guardrails To Preserve

- Dirty note drafts must still block workspace changes through the existing note buffer checks.
- Pending path changes must still block save and delete when the existing model says they should.
- Existing path-conflict validation for move / rename must stay in the folder workspace model.
- Path change queue execution remains automatic and development-only diagnostics remain opt-in.

## Testing Strategy

Update `apps/desktop/src/features/folder-navigation/ui/FolderNavigationWorkspace.test.tsx` first.

Add or adjust tests to verify:

- default `ActivePane` markup does not include always-visible move / rename / delete controls
- expanded `Note actions` markup includes move and delete controls
- expanded `Folder actions` markup includes rename controls and operation messaging
- the diagnostics toggle behavior from issue #74 still works

Implementation should follow TDD:

1. write or update failing UI markup tests
2. run the focused desktop test file and confirm the expected failure
3. implement the minimal disclosure UI changes
4. rerun the focused tests
5. run broader desktop verification as needed

## Risks And Mitigations

- Risk: action controls become harder to discover
  - Mitigation: use explicit disclosure labels (`Note actions`, `Folder actions`) instead of ambiguous icon-only menus
- Risk: disclosure state adds noise to `ActivePane`
  - Mitigation: keep state local and minimal, without changing workspace model boundaries
- Risk: accidental behavior regression in move / rename / delete flows
  - Mitigation: reuse existing handlers and preserve validation paths instead of rewriting mutations

## Acceptance Criteria

- the primary editor surface shows only reading/editing controls by default
- move, rename, and delete remain available through deliberate contextual interaction
- delete remains a clearly destructive action
- existing save/path-change guardrails still apply
- the implementation can land independently after issue #74 without waiting on issue #73
