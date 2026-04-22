import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const desktopSrc = resolve(__dirname, "..");

async function readDesktopFile(path: string) {
  return readFile(resolve(desktopSrc, path), "utf8");
}

describe("desktop color tokens", () => {
  test("defines shared CSS custom properties for colors", async () => {
    const tokensCss = await readDesktopFile("shared/tokens.css");

    expect(tokensCss).toContain(":root");
    expect(tokensCss).toContain("--color-surface: #ffffff;");
    expect(tokensCss).toContain("--color-border: #dce4dd;");
    expect(tokensCss).toContain("--color-bg: #f7f8f5;");
    expect(tokensCss).toContain("--color-text: #17211b;");
    expect(tokensCss).toContain("--color-text-muted: #5f6d64;");
  });

  test("loads tokens before the app renders", async () => {
    const mainTsx = await readDesktopFile("main.tsx");

    expect(mainTsx).toContain('import "./shared/tokens.css";');
  });

  test("folder navigation styles reference color tokens instead of literals", async () => {
    const workspaceCss = await readDesktopFile(
      "features/folder-navigation/ui/FolderNavigationWorkspace.css",
    );

    expect(workspaceCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(workspaceCss).toContain("var(--color-surface)");
    expect(workspaceCss).toContain("var(--color-border)");
    expect(workspaceCss).toContain("var(--color-bg)");
    expect(workspaceCss).toContain("var(--color-text)");
    expect(workspaceCss).toContain("var(--color-text-muted)");
  });

  test("shared shell UI references color tokens instead of literals", async () => {
    const shellCardTsx = await readDesktopFile("shared/ui/ShellCard.tsx");

    expect(shellCardTsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(shellCardTsx).toContain("var(--color-shell-card-bg)");
    expect(shellCardTsx).toContain("var(--shadow-shell-card)");
  });
});
