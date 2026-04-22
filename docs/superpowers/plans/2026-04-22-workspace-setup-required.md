# Workspace Setup Required Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an explicit workspace before Grove exposes note creation.

**Architecture:** Desktop backend will represent no active workspace as `activeWorkspaceId: null` and stop creating `Personal Notes` implicitly. The desktop UI will treat an empty ready workspace state as setup-required and render a focused setup surface that reuses the existing add workspace command path.

**Tech Stack:** Tauri v2 Rust commands, React 19, TypeScript strict mode, Zustand, Vitest.

---

### Task 1: Backend Workspace Registry Semantics

**Files:**

- Modify: `apps/desktop/src-tauri/src/main.rs`

- [ ] **Step 1: Write failing Rust tests**

Change `creates_a_default_workspace_registry_on_first_run` so it expects an empty registry with no active workspace, and add coverage that removing the last workspace leaves the registry empty.

Run: `cd apps/desktop/src-tauri && cargo test creates_an_empty_workspace_registry_on_first_run`

Expected: FAIL because the backend still creates `Personal Notes`.

- [ ] **Step 2: Implement nullable active workspace**

Change `WorkspaceRegistry.active_workspace_id` from `String` to `Option<String>`. Initialize missing registries as `{ active_workspace_id: None, workspaces: [] }`, keep `add_and_activate_workspace_in_registry` and `switch_active_workspace_in_registry` setting `Some(id)`, and make last-workspace removal set `None`.

- [ ] **Step 3: Verify Rust tests**

Run: `cd apps/desktop/src-tauri && cargo test workspace`

Expected: PASS.

### Task 2: Desktop Store Empty-State Loading

**Files:**

- Modify: `apps/desktop/src/features/folder-navigation/model/useWorkspaceStore.ts`
- Modify: `apps/desktop/src/features/folder-navigation/model/useWorkspaceStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Add a test where `listWorkspaces()` resolves `[]` and `getActiveWorkspace()` rejects with `No workspace found`; `loadWorkspaces()` should set `activeWorkspace: null`, `allWorkspaces: []`, and `loadState.status: "ready"`.

Run: `pnpm --filter @grove/desktop test -- useWorkspaceStore`

Expected: FAIL because the store currently treats all active workspace failures as load failures.

- [ ] **Step 2: Implement empty ready state**

Load workspace list first. If the list is empty, skip `getActiveWorkspace()` and mark the store ready with no active workspace. If the list is non-empty and active lookup fails, keep the existing failed state.

- [ ] **Step 3: Verify store tests**

Run: `pnpm --filter @grove/desktop test -- useWorkspaceStore`

Expected: PASS.

### Task 3: Setup-First Desktop UI

**Files:**

- Modify: `apps/desktop/src/features/folder-navigation/ui/FolderNavigationWorkspace.tsx`
- Modify: `apps/desktop/src/features/folder-navigation/ui/FolderNavigationWorkspace.css`
- Modify: `apps/desktop/src/features/folder-navigation/ui/FolderNavigationWorkspace.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Add a rendered markup test for `WorkspaceSetupRequired` that contains workspace setup copy and the add workspace form, and assert it does not render `Create note`.

Run: `pnpm --filter @grove/desktop test -- FolderNavigationWorkspace`

Expected: FAIL because the setup component does not exist yet.

- [ ] **Step 2: Implement setup component**

Extract the add workspace form into a reusable `WorkspaceSetupForm`. Use it in the existing switcher popover and a new setup-first screen. In `FolderNavigationWorkspaceContent`, when workspace load is ready and `activeWorkspace === null`, render setup instead of `NavigationPane` and `ActivePane`.

- [ ] **Step 3: Verify UI tests**

Run: `pnpm --filter @grove/desktop test -- FolderNavigationWorkspace`

Expected: PASS.

### Task 4: Full Verification And PR

**Files:**

- Verify all changed files.

- [ ] **Step 1: Run focused checks**

Run:

- `pnpm --filter @grove/desktop test`
- `cd apps/desktop/src-tauri && cargo test`
- `pnpm --filter @grove/desktop typecheck`
- `pnpm --filter @grove/desktop build`

- [ ] **Step 2: Run workspace checks**

Run:

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format`
- `git diff --check`

- [ ] **Step 3: Commit and create PR**

Commit all implementation and plan changes, push `issue-88-workspace-setup-required`, and create a PR referencing `#88`.
