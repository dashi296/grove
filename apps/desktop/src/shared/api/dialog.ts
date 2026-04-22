import { open } from "@tauri-apps/plugin-dialog";

export async function selectWorkspaceFolder(): Promise<string | null> {
  const selectedPath = await open({
    directory: true,
    multiple: false,
    title: "Choose workspace folder",
  });

  return typeof selectedPath === "string" ? selectedPath : null;
}
