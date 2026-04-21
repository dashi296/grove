import { create } from "zustand";

import {
  addWorkspace,
  getActiveWorkspace,
  listWorkspaces,
  removeWorkspace,
  renameWorkspace,
  switchWorkspace,
} from "../../../shared";
import type { DesktopWorkspace } from "../../../shared";

type WorkspaceLoadState = {
  status: "idle" | "loading" | "ready" | "failed";
  errorMessage: string | null;
};

type WorkspaceStore = {
  activeWorkspace: DesktopWorkspace | null;
  allWorkspaces: readonly DesktopWorkspace[];
  loadState: WorkspaceLoadState;
  loadWorkspaces: () => Promise<void>;
  switchTo: (id: string) => Promise<DesktopWorkspace>;
  addNew: (name: string, rootPath: string) => Promise<DesktopWorkspace>;
  renameCurrent: (id: string, name: string) => Promise<DesktopWorkspace>;
  removeCurrent: (id: string) => Promise<void>;
};

function getWorkspaceErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The workspace operation failed.";
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  activeWorkspace: null,
  allWorkspaces: [],
  loadState: { status: "idle", errorMessage: null },

  loadWorkspaces: async () => {
    set({ loadState: { status: "loading", errorMessage: null } });
    try {
      const [active, all] = await Promise.all([getActiveWorkspace(), listWorkspaces()]);
      set({ activeWorkspace: active, allWorkspaces: all, loadState: { status: "ready", errorMessage: null } });
    } catch (error) {
      set({
        activeWorkspace: null,
        allWorkspaces: [],
        loadState: { status: "failed", errorMessage: getWorkspaceErrorMessage(error) },
      });
    }
  },

  switchTo: async (id: string) => {
    const workspace = await switchWorkspace({ id });
    const all = await listWorkspaces();
    set({
      activeWorkspace: workspace,
      allWorkspaces: all,
      loadState: { status: "ready", errorMessage: null },
    });
    return workspace;
  },

  addNew: async (name: string, rootPath: string) => {
    const workspace = await addWorkspace({ name, rootPath });
    const all = await listWorkspaces();
    set({
      activeWorkspace: workspace,
      allWorkspaces: all,
      loadState: { status: "ready", errorMessage: null },
    });
    return workspace;
  },

  renameCurrent: async (id: string, name: string) => {
    const workspace = await renameWorkspace({ id, name });
    set((state) => ({
      activeWorkspace: state.activeWorkspace?.id === id ? workspace : state.activeWorkspace,
      allWorkspaces: state.allWorkspaces.map((ws) => (ws.id === id ? workspace : ws)),
      loadState: { status: "ready", errorMessage: null },
    }));
    return workspace;
  },

  removeCurrent: async (id: string) => {
    await removeWorkspace({ id });
    const all = await listWorkspaces();
    try {
      const newActive = await getActiveWorkspace();
      set({
        activeWorkspace: newActive,
        allWorkspaces: all,
        loadState: { status: "ready", errorMessage: null },
      });
    } catch {
      set({
        activeWorkspace: null,
        allWorkspaces: all,
        loadState: { status: "ready", errorMessage: null },
      });
    }
  },
}));

export function getRecentWorkspaces(
  allWorkspaces: readonly DesktopWorkspace[],
  activeWorkspaceId: string | undefined,
): DesktopWorkspace[] {
  return [...allWorkspaces]
    .filter((ws) => ws.id !== activeWorkspaceId)
    .sort((a, b) => b.lastOpenedAtUnixMs - a.lastOpenedAtUnixMs);
}
