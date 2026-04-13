import { describe, expect, it } from "vitest";

import { appName, definePlugin } from "./index";

describe("definePlugin", () => {
  it("returns the plugin definition unchanged", () => {
    const plugin = definePlugin({
      id: "test.plugin",
      name: "Test Plugin",
      provides: {},
    });

    expect(appName).toBe("Grove");
    expect(plugin.id).toBe("test.plugin");
    expect(plugin.name).toBe("Test Plugin");
  });
});
