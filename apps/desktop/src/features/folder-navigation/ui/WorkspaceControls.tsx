import { appName } from "@grove/core";
import { useId, useState } from "react";

import type { DesktopWorkspace } from "../../../shared";
import type { WorkspaceLoadState } from "../model/useWorkspaceStore";

type WorkspaceSwitcherSlice = {
  activeWorkspaceName: string;
  recentWorkspaces: readonly DesktopWorkspace[];
  switchBlockedReason: string | null;
  onSwitchWorkspace: (id: string) => Promise<void>;
  onAddWorkspace: (name: string, rootPath: string) => Promise<void>;
  onRenameWorkspace: (name: string) => Promise<void>;
  onRemoveWorkspace: () => Promise<void>;
};

type WorkspaceSwitcherProps = WorkspaceSwitcherSlice & {
  initiallyOpen?: boolean;
  initialView?: PopoverView;
};

type PopoverView = "list" | "add" | "settings";

type PopoverOperationState = {
  status: "idle" | "pending" | "failed";
  errorMessage: string | null;
};

type WorkspaceSetupFormProps = {
  submitLabel: string;
  pendingLabel: string;
  onAddWorkspace: (name: string, rootPath: string) => Promise<void>;
  switchBlockedReason?: string | null;
  onCancel?: () => void;
};

type WorkspaceSetupRequiredProps = {
  loadState: WorkspaceLoadState;
  onAddWorkspace: (name: string, rootPath: string) => Promise<void>;
};

type WorkspaceSetupLoadingProps = {
  loadState?: WorkspaceLoadState;
};

type WorkspaceSwitcherPopoverProps = WorkspaceSwitcherSlice & {
  id: string;
  initialView?: PopoverView;
};

export function getActiveWorkspaceName(
  activeWorkspace: DesktopWorkspace | null,
  workspaceLoadState: WorkspaceLoadState,
): string {
  if (activeWorkspace !== null) {
    return activeWorkspace.name;
  }

  if (workspaceLoadState.status === "loading") {
    return "Loading...";
  }

  if (workspaceLoadState.status === "failed") {
    return "Workspace unavailable";
  }

  return "No workspace selected";
}

export function WorkspaceSwitcher({
  activeWorkspaceName,
  recentWorkspaces,
  switchBlockedReason,
  onSwitchWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
  initiallyOpen = false,
  initialView = "list",
}: WorkspaceSwitcherProps) {
  const popoverId = useId();
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  return (
    <div className="folder-navigation__workspace-switcher">
      <button
        type="button"
        className="folder-navigation__workspace-switcher-button"
        onClick={() => setIsOpen((currentIsOpen) => !currentIsOpen)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
      >
        <span className="folder-navigation__workspace-name">{activeWorkspaceName}</span>
        <span className="folder-navigation__workspace-hint">Switch workspace</span>
      </button>
      {isOpen ? (
        <WorkspaceSwitcherPopover
          id={popoverId}
          activeWorkspaceName={activeWorkspaceName}
          recentWorkspaces={recentWorkspaces}
          switchBlockedReason={switchBlockedReason}
          initialView={initialView}
          onSwitchWorkspace={async (id) => {
            await onSwitchWorkspace(id);
            setIsOpen(false);
          }}
          onAddWorkspace={async (name, rootPath) => {
            await onAddWorkspace(name, rootPath);
            setIsOpen(false);
          }}
          onRenameWorkspace={async (name) => {
            await onRenameWorkspace(name);
            setIsOpen(false);
          }}
          onRemoveWorkspace={async () => {
            await onRemoveWorkspace();
            setIsOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function WorkspaceSetupForm({
  submitLabel,
  pendingLabel,
  onAddWorkspace,
  switchBlockedReason = null,
  onCancel,
}: WorkspaceSetupFormProps) {
  const [operation, setOperation] = useState<PopoverOperationState>({
    status: "idle",
    errorMessage: null,
  });
  const formId = useId();
  const [name, setName] = useState("");
  const [rootPath, setRootPath] = useState("");
  const nameInputId = `${formId}-workspace-name`;
  const pathInputId = `${formId}-workspace-path`;

  async function handleAdd(): Promise<void> {
    if (switchBlockedReason !== null) {
      setOperation({ status: "failed", errorMessage: switchBlockedReason });
      return;
    }

    if (name.trim() === "" || rootPath.trim() === "") return;
    setOperation({ status: "pending", errorMessage: null });
    try {
      await onAddWorkspace(name.trim(), rootPath.trim());
    } catch (error) {
      setOperation({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to add workspace.",
      });
    }
  }

  return (
    <form
      className="folder-navigation__operation"
      onSubmit={(event) => {
        event.preventDefault();
        void handleAdd();
      }}
    >
      <label className="folder-navigation__label" htmlFor={nameInputId}>
        Name
      </label>
      <input
        id={nameInputId}
        className="folder-navigation__input"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="My Notes"
        disabled={operation.status === "pending"}
      />
      <label className="folder-navigation__label" htmlFor={pathInputId}>
        Folder path
      </label>
      <input
        id={pathInputId}
        className="folder-navigation__input"
        value={rootPath}
        onChange={(event) => setRootPath(event.target.value)}
        placeholder="/Users/you/Notes"
        disabled={operation.status === "pending"}
      />
      {operation.errorMessage !== null ? (
        <p className="folder-navigation__step-error">{operation.errorMessage}</p>
      ) : null}
      <div className="folder-navigation__workspace-popover-actions">
        <button
          type="submit"
          className="folder-navigation__action"
          disabled={
            switchBlockedReason !== null ||
            operation.status === "pending" ||
            name.trim() === "" ||
            rootPath.trim() === ""
          }
        >
          {operation.status === "pending" ? pendingLabel : submitLabel}
        </button>
        {onCancel === undefined ? null : (
          <button
            type="button"
            className="folder-navigation__secondary-action"
            onClick={onCancel}
            disabled={operation.status === "pending"}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export function WorkspaceSetupRequired({ loadState, onAddWorkspace }: WorkspaceSetupRequiredProps) {
  return (
    <section className="folder-navigation folder-navigation--setup">
      <div className="folder-navigation__setup">
        <p className="folder-navigation__eyebrow">{appName}</p>
        <h1 className="folder-navigation__title">Set up a workspace</h1>
        <p className="folder-navigation__muted">
          Choose the local folder where Grove will store Markdown notes before creating notes.
        </p>
        {loadState.status === "failed" ? (
          <p className="folder-navigation__step-error">
            {loadState.errorMessage ?? "The workspace operation failed."}
          </p>
        ) : null}
        <WorkspaceSetupForm
          submitLabel="Create workspace"
          pendingLabel="Creating..."
          onAddWorkspace={onAddWorkspace}
        />
      </div>
    </section>
  );
}

export function WorkspaceSetupLoading({ loadState }: WorkspaceSetupLoadingProps = {}) {
  const isFailed = loadState?.status === "failed";

  return (
    <section className="folder-navigation folder-navigation--setup">
      <div className="folder-navigation__setup">
        <p className="folder-navigation__eyebrow">{appName}</p>
        <h1 className="folder-navigation__title">
          {isFailed ? "Workspace unavailable" : "Loading workspace"}
        </h1>
        {isFailed ? (
          <p className="folder-navigation__step-error">
            {loadState.errorMessage ?? "The workspace operation failed."}
          </p>
        ) : (
          <p className="folder-navigation__muted">
            Grove is checking the local workspace registry before notes can be created.
          </p>
        )}
      </div>
    </section>
  );
}

function WorkspaceSwitcherPopover({
  id,
  activeWorkspaceName,
  recentWorkspaces,
  switchBlockedReason,
  initialView = "list",
  onSwitchWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
  onRemoveWorkspace,
}: WorkspaceSwitcherPopoverProps) {
  const [view, setView] = useState<PopoverView>(initialView);
  const [operation, setOperation] = useState<PopoverOperationState>({
    status: "idle",
    errorMessage: null,
  });
  const [renameName, setRenameName] = useState(activeWorkspaceName);
  const renameInputId = `${id}-rename-workspace-name`;

  function switchView(nextView: PopoverView): void {
    setView(nextView);
    setOperation({ status: "idle", errorMessage: null });
  }

  function resetToList(): void {
    switchView("list");
    setRenameName(activeWorkspaceName);
  }

  async function handleSwitch(workspaceId: string): Promise<void> {
    if (switchBlockedReason !== null) {
      setOperation({ status: "failed", errorMessage: switchBlockedReason });
      return;
    }

    setOperation({ status: "pending", errorMessage: null });
    try {
      await onSwitchWorkspace(workspaceId);
    } catch (error) {
      setOperation({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to switch workspace.",
      });
    }
  }

  async function handleRename(): Promise<void> {
    if (renameName.trim() === "" || renameName.trim() === activeWorkspaceName) return;
    setOperation({ status: "pending", errorMessage: null });
    try {
      await onRenameWorkspace(renameName.trim());
    } catch (error) {
      setOperation({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to rename workspace.",
      });
    }
  }

  async function handleRemove(): Promise<void> {
    if (switchBlockedReason !== null) {
      setOperation({ status: "failed", errorMessage: switchBlockedReason });
      return;
    }

    const confirmed = window.confirm(
      `Remove "${activeWorkspaceName}" from Grove? Your Markdown files will not be deleted.`,
    );
    if (!confirmed) return;
    setOperation({ status: "pending", errorMessage: null });
    try {
      await onRemoveWorkspace();
    } catch (error) {
      setOperation({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to remove workspace.",
      });
    }
  }

  return (
    <div
      id={id}
      className="folder-navigation__workspace-popover"
      role="dialog"
      aria-label="Workspace switcher"
    >
      <p className="folder-navigation__eyebrow">Current workspace</p>
      <p className="folder-navigation__workspace-popover-title">{activeWorkspaceName}</p>

      {switchBlockedReason !== null ? (
        <p className="folder-navigation__step-error">{switchBlockedReason}</p>
      ) : operation.status === "failed" && view === "list" ? (
        <p className="folder-navigation__step-error">{operation.errorMessage}</p>
      ) : null}

      {view === "list" ? (
        <>
          <div className="folder-navigation__workspace-popover-section">
            <p className="folder-navigation__group-heading">Recent workspaces</p>
            {recentWorkspaces.length > 0 ? (
              <ul className="folder-navigation__workspace-list">
                {recentWorkspaces.map((workspace) => (
                  <li key={workspace.id}>
                    <button
                      type="button"
                      className="folder-navigation__workspace-action"
                      onClick={() => {
                        void handleSwitch(workspace.id);
                      }}
                      disabled={switchBlockedReason !== null || operation.status === "pending"}
                    >
                      {workspace.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="folder-navigation__muted">No recent workspaces yet.</p>
            )}
          </div>
          <div className="folder-navigation__workspace-popover-actions">
            <button
              type="button"
              className="folder-navigation__workspace-action"
              onClick={() => switchView("add")}
              disabled={switchBlockedReason !== null}
            >
              Add workspace
            </button>
            <button
              type="button"
              className="folder-navigation__workspace-action"
              onClick={() => switchView("settings")}
            >
              Workspace settings
            </button>
          </div>
        </>
      ) : null}

      {view === "add" ? (
        <div className="folder-navigation__workspace-popover-section">
          <p className="folder-navigation__group-heading">Add workspace</p>
          <WorkspaceSetupForm
            submitLabel="Add"
            pendingLabel="Adding..."
            switchBlockedReason={switchBlockedReason}
            onAddWorkspace={onAddWorkspace}
            onCancel={resetToList}
          />
        </div>
      ) : null}

      {view === "settings" ? (
        <div className="folder-navigation__workspace-popover-section">
          <p className="folder-navigation__group-heading">Workspace settings</p>
          <div className="folder-navigation__operation">
            <label className="folder-navigation__label" htmlFor={renameInputId}>
              Name
            </label>
            <input
              id={renameInputId}
              className="folder-navigation__input"
              value={renameName}
              onChange={(event) => setRenameName(event.target.value)}
              disabled={operation.status === "pending"}
            />
            {operation.errorMessage !== null ? (
              <p className="folder-navigation__step-error">{operation.errorMessage}</p>
            ) : null}
            <div className="folder-navigation__workspace-popover-actions">
              <button
                type="button"
                className="folder-navigation__action"
                onClick={() => {
                  void handleRename();
                }}
                disabled={
                  operation.status === "pending" ||
                  renameName.trim() === "" ||
                  renameName.trim() === activeWorkspaceName
                }
              >
                {operation.status === "pending" ? "Renaming..." : "Rename"}
              </button>
              <button
                type="button"
                className="folder-navigation__secondary-action"
                onClick={resetToList}
                disabled={operation.status === "pending"}
              >
                Cancel
              </button>
            </div>
            <div className="folder-navigation__operation">
              <button
                type="button"
                className="folder-navigation__secondary-action"
                onClick={() => {
                  void handleRemove();
                }}
                disabled={switchBlockedReason !== null || operation.status === "pending"}
              >
                Remove from Grove
              </button>
              <p className="folder-navigation__muted">
                Removes this workspace from Grove without deleting your Markdown files.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
