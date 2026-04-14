import { describe, expect, it } from "vitest";

import { appName, definePlugin } from "./index";

describe("appName", () => {
  it("equals Grove", () => {
    expect(appName).toBe("Grove");
  });
});

describe("definePlugin", () => {
  it("returns the plugin definition unchanged", () => {
    const plugin = definePlugin({
      id: "test.plugin",
      name: "Test Plugin",
      provides: {},
    });

    expect(plugin.id).toBe("test.plugin");
    expect(plugin.name).toBe("Test Plugin");
    expect(plugin.provides).toStrictEqual({});
  });

  it("returns the same object reference", () => {
    const input = { id: "ref.plugin", name: "Ref Plugin", provides: {} };
    expect(definePlugin(input)).toBe(input);
  });
});
