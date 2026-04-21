import { beforeEach, describe, expect, it, vi } from "vitest";

import * as commands from "../../../shared";
import { getRecentWorkspaces, useWorkspaceStore } from "./useWorkspaceStore";

vi.mock("../../../shared", async (importOriginal) => {
  const actual = await importOriginal<typeof commands>();
  return {
    ...actual,
    getActiveWorkspace: vi.fn(),
    listWorkspaces: vi.fn(),
    addWorkspace: vi.fn(),
    switchWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
    removeWorkspace: vi.fn(),
  };
});

const getActiveWorkspaceMock = vi.mocked(commands.getActiveWorkspace);
const listWorkspacesMock = vi.mocked(commands.listWorkspaces);
const switchWorkspaceMock = vi.mocked(commands.switchWorkspace);
const addWorkspaceMock = vi.mocked(commands.addWorkspace);
const renameWorkspaceMock = vi.mocked(commands.renameWorkspace);
const removeWorkspaceMock = vi.mocked(commands.removeWorkspace);

const workspaceA = {
  id: "ws-a",
  name: "Personal Notes",
  rootPath: "/Users/me/notes",
  lastOpenedAtUnixMs: 2000,
};

const workspaceB = {
  id: "ws-b",
  name: "Work Notes",
  rootPath: "/Users/me/work",
  lastOpenedAtUnixMs: 1000,
};

const workspaceC = {
  id: "ws-c",
  name: "Archive",
  rootPath: "/Users/me/archive",
  lastOpenedAtUnixMs: 3000,
};

beforeEach(() => {
  useWorkspaceStore.setState({
    activeWorkspace: null,
    allWorkspaces: [],
    loadState: { status: "idle", errorMessage: null },
  });
  vi.resetAllMocks();
});

describe("loadWorkspaces", () => {
  it("loads the active workspace and all workspaces on success", async () => {
    getActiveWorkspaceMock.mockResolvedValue(workspaceA);
    listWorkspacesMock.mockResolvedValue([workspaceA, workspaceB]);

    await useWorkspaceStore.getState().loadWorkspaces();

    const state = useWorkspaceStore.getState();
    expect(state.activeWorkspace).toEqual(workspaceA);
    expect(state.allWorkspaces).toEqual([workspaceA, workspaceB]);
    expect(state.loadState.status).toBe("ready");
  });

  it("sets failed state when the command throws", async () => {
    getActiveWorkspaceMock.mockRejectedValue(new Error("No workspace found"));
    listWorkspacesMock.mockResolvedValue([]);

    await useWorkspaceStore.getState().loadWorkspaces();

    const state = useWorkspaceStore.getState();
    expect(state.loadState.status).toBe("failed");
    expect(state.loadState.errorMessage).toBe("No workspace found");
    expect(state.activeWorkspace).toBeNull();
  });
});

describe("switchTo", () => {
  it("updates the active workspace and refreshes the list on switch", async () => {
    const switched = { ...workspaceB, lastOpenedAtUnixMs: 4000 };
    switchWorkspaceMock.mockResolvedValue(switched);
    listWorkspacesMock.mockResolvedValue([workspaceA, switched]);

    await useWorkspaceStore.getState().switchTo("ws-b");

    const state = useWorkspaceStore.getState();
    expect(state.activeWorkspace).toEqual(switched);
    expect(switchWorkspaceMock).toHaveBeenCalledWith({ id: "ws-b" });
  });
});

describe("addNew", () => {
  it("adds a workspace and makes it the active workspace", async () => {
    const newWorkspace = {
      id: "ws-new",
      name: "Research",
      rootPath: "/Users/me/research",
      lastOpenedAtUnixMs: 5000,
    };
    addWorkspaceMock.mockResolvedValue(newWorkspace);
    listWorkspacesMock.mockResolvedValue([workspaceA, newWorkspace]);

    await useWorkspaceStore.getState().addNew("Research", "/Users/me/research");

    const state = useWorkspaceStore.getState();
    expect(state.activeWorkspace).toEqual(newWorkspace);
    expect(addWorkspaceMock).toHaveBeenCalledWith({ name: "Research", rootPath: "/Users/me/research" });
  });
});

describe("renameCurrent", () => {
  it("renames the workspace and updates it in the list", async () => {
    const renamed = { ...workspaceA, name: "My Notes" };
    renameWorkspaceMock.mockResolvedValue(renamed);
    useWorkspaceStore.setState({
      activeWorkspace: workspaceA,
      allWorkspaces: [workspaceA, workspaceB],
    });

    await useWorkspaceStore.getState().renameCurrent("ws-a", "My Notes");

    const state = useWorkspaceStore.getState();
    expect(state.activeWorkspace?.name).toBe("My Notes");
    expect(state.allWorkspaces.find((ws) => ws.id === "ws-a")?.name).toBe("My Notes");
    expect(renameWorkspaceMock).toHaveBeenCalledWith({ id: "ws-a", name: "My Notes" });
  });
});

describe("removeCurrent", () => {
  it("removes the workspace and sets the new active workspace", async () => {
    removeWorkspaceMock.mockResolvedValue(undefined);
    listWorkspacesMock.mockResolvedValue([workspaceB]);
    getActiveWorkspaceMock.mockResolvedValue(workspaceB);

    useWorkspaceStore.setState({
      activeWorkspace: workspaceA,
      allWorkspaces: [workspaceA, workspaceB],
    });

    await useWorkspaceStore.getState().removeCurrent("ws-a");

    const state = useWorkspaceStore.getState();
    expect(state.activeWorkspace).toEqual(workspaceB);
    expect(state.allWorkspaces).toEqual([workspaceB]);
    expect(removeWorkspaceMock).toHaveBeenCalledWith({ id: "ws-a" });
  });
});

describe("getRecentWorkspaces", () => {
  it("returns all workspaces except the active one, sorted by lastOpenedAtUnixMs descending", () => {
    const recent = getRecentWorkspaces([workspaceA, workspaceB, workspaceC], "ws-a");

    expect(recent.map((ws) => ws.id)).toEqual(["ws-c", "ws-b"]);
  });

  it("returns an empty list when there are no other workspaces", () => {
    const recent = getRecentWorkspaces([workspaceA], "ws-a");

    expect(recent).toHaveLength(0);
  });

  it("returns all workspaces when there is no active workspace", () => {
    const recent = getRecentWorkspaces([workspaceA, workspaceB], undefined);

    expect(recent).toHaveLength(2);
  });
});
