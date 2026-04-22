import { describe, expect, it } from "vitest";

import { chooseWorkspaceFolder } from "./workspaceFolderPicker";

describe("chooseWorkspaceFolder", () => {
  it("returns the selected folder path", async () => {
    await expect(chooseWorkspaceFolder(async () => "/Users/me/Notes")).resolves.toEqual({
      errorMessage: null,
      path: "/Users/me/Notes",
    });
  });

  it("leaves the path unchanged when folder selection is cancelled", async () => {
    await expect(chooseWorkspaceFolder(async () => null)).resolves.toEqual({
      errorMessage: null,
      path: null,
    });
  });

  it("returns a user-facing error when the native folder picker fails", async () => {
    await expect(
      chooseWorkspaceFolder(async () => {
        throw new Error("Dialog unavailable");
      }),
    ).resolves.toEqual({
      errorMessage: "Dialog unavailable",
      path: null,
    });
  });
});
