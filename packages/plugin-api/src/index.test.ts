import { describe, expect, it } from "vitest";

import { definePlugin, type PluginContext, type PluginManifest } from "./index";

const manifest: PluginManifest = {
  id: "sync-r2",
  name: "Cloudflare R2 Sync",
  version: "0.1.0",
  apiVersion: 1,
  entry: "./src/index.ts",
  capabilities: ["syncProvider"],
  permissions: ["network", "secrets:read"],
};

const context = {
  manifest,
  services: {
    settings: {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    },
    secrets: {
      get: async () => undefined,
      set: async () => undefined,
      delete: async () => undefined,
    },
    network: {
      request: async () => ({
        status: 200,
        headers: {},
        body: new Uint8Array(),
      }),
    },
    workspace: {
      read: async () => new Uint8Array(),
      write: async () => undefined,
      list: async () => [],
      delete: async () => undefined,
    },
  },
} satisfies PluginContext;

describe("definePlugin", () => {
  it("returns the exact plugin definition", async () => {
    const plugin = definePlugin({
      id: "sync-r2",
      name: "Cloudflare R2 Sync",
      activate: (_context: PluginContext) => ({
        syncProvider: {
          id: "r2",
          name: "Cloudflare R2",
          upload: async () => undefined,
          download: async () => new Uint8Array(),
          list: async () => [],
          delete: async () => undefined,
          isAvailable: async () => true,
        },
      }),
    });

    const provides = await plugin.activate(context);

    expect(plugin.id).toBe("sync-r2");
    expect(provides.syncProvider?.id).toBe("r2");
  });

  it("supports ai provider registrations", async () => {
    const plugin = definePlugin({
      id: "ai-claude",
      name: "Claude AI",
      activate: (_context: PluginContext) => ({
        aiProvider: {
          id: "claude",
          name: "Claude",
          isAvailable: async () => true,
          generate: async (_request) => ({
            text: "Generated note",
            usage: {
              inputTokens: 4,
              outputTokens: 2,
            },
          }),
        },
      }),
    });

    const provides = await plugin.activate(context);

    await expect(provides.aiProvider?.generate({ messages: [] })).resolves.toMatchObject({
      text: "Generated note",
    });
  });
});
