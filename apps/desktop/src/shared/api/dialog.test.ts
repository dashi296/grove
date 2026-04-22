import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("desktop dialog permissions", () => {
  it("grants the native folder picker permission to the main window", () => {
    const capabilityPath = resolve("src-tauri/capabilities/default.json");
    const capability = JSON.parse(readFileSync(capabilityPath, "utf8")) as {
      permissions?: unknown;
      windows?: unknown;
    };

    expect(capability.windows).toContain("main");
    expect(capability.permissions).toContain("dialog:allow-open");
  });
});
