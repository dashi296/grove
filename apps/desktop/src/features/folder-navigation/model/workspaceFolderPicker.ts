export type WorkspaceFolderPicker = () => Promise<string | null>;

type WorkspaceFolderChoice = {
  path: string | null;
  errorMessage: string | null;
};

export async function chooseWorkspaceFolder(
  pickWorkspaceFolder: WorkspaceFolderPicker,
): Promise<WorkspaceFolderChoice> {
  try {
    return {
      path: await pickWorkspaceFolder(),
      errorMessage: null,
    };
  } catch (error) {
    return {
      path: null,
      errorMessage: error instanceof Error ? error.message : "Failed to choose a workspace folder.",
    };
  }
}
