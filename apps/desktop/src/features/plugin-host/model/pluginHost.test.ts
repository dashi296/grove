import { describe, expect, it } from "vitest";

import type {
  GrovePlugin,
  PluginHostServices,
  PluginManifest,
  PluginProvides,
} from "@grove/plugin-api";
import {
  activatePluginHostRecord,
  createDiscoveredPluginHostRecord,
  createPermissionedPluginHostServices,
  disablePluginHostRecord,
  enablePluginHostRecord,
  PluginPermissionError,
  validatePluginManifest,
  validatePluginProvides,
  verifyPluginHostRecord,
} from "./pluginHost";

const syncManifest: PluginManifest = {
  id: "sync-r2",
  name: "Cloudflare R2 Sync",
  version: "0.1.0",
  apiVersion: 1,
  entry: "./src/index.ts",
  capabilities: ["syncProvider"],
  permissions: ["network", "secrets:read"],
};

const services: PluginHostServices = {
  settings: {
    get: async () => undefined,
    set: async () => undefined,
    delete: async () => undefined,
  },
  secrets: {
    get: async () => "secret",
    set: async () => undefined,
    delete: async () => undefined,
  },
  network: {
    request: async () => ({
      status: 200,
      headers: {},
      body: new Uint8Array([1, 2, 3]),
    }),
  },
  workspace: {
    read: async () => new Uint8Array([4, 5, 6]),
    write: async () => undefined,
    list: async () => [],
    delete: async () => undefined,
  },
};

const syncProvider: PluginProvides = {
  syncProvider: {
    id: "r2",
    name: "Cloudflare R2",
    upload: async () => undefined,
    download: async () => new Uint8Array(),
    list: async () => [],
    delete: async () => undefined,
    isAvailable: async () => true,
  },
};

describe("validatePluginManifest", () => {
  it("accepts a supported manifest", () => {
    expect(validatePluginManifest(syncManifest)).toStrictEqual({
      ok: true,
      manifest: syncManifest,
      issues: [],
    });
  });

  it("rejects unsupported api versions, package escapes, and unknown values", () => {
    const result = validatePluginManifest({
      id: "sync-r2",
      name: "Cloudflare R2 Sync",
      version: "0.1.0",
      apiVersion: 2,
      entry: "../dist/index.js",
      capabilities: ["syncProvider", "syncProvider", "unsafeCapability"],
      permissions: ["network", "filesystem"],
    });

    expect(result.ok).toBe(false);

    if (result.ok) {
      throw new Error("Expected manifest validation to fail.");
    }

    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          field: "apiVersion",
          message: "apiVersion must be 1.",
        },
        {
          field: "entry",
          message: "entry must stay inside the plugin package.",
        },
        {
          field: "capabilities",
          message: "capabilities must not contain duplicates.",
        },
        {
          field: "capabilities",
          message: "Unsupported capability: unsafeCapability.",
        },
        {
          field: "permissions",
          message: "Unsupported permission: filesystem.",
        },
      ]),
    );
  });

  it("rejects absolute and URL entry paths", () => {
    const entries = [
      "/tmp/plugin.js",
      "\\\\server\\plugin.js",
      "C:\\plugin.js",
      "https://example.com/plugin.js",
    ];

    for (const entry of entries) {
      const result = validatePluginManifest({
        ...syncManifest,
        entry,
      });

      expect(result).toMatchObject({
        ok: false,
        issues: [
          {
            field: "entry",
            message: "entry must stay inside the plugin package.",
          },
        ],
      });
    }
  });
});

describe("plugin host lifecycle", () => {
  it("moves a valid manifest from verified to enabled to active", async () => {
    const discovered = createDiscoveredPluginHostRecord("sync-r2");
    const verified = verifyPluginHostRecord(discovered, syncManifest);
    const enabled = enablePluginHostRecord(verified);
    const plugin: GrovePlugin = {
      id: "sync-r2",
      name: "Cloudflare R2 Sync",
      activate: async () => syncProvider,
    };

    const result = await activatePluginHostRecord(enabled, plugin, services);

    expect(discovered.state).toBe("discovered");
    expect(verified.state).toBe("verified");
    expect(enabled.state).toBe("enabled");
    expect(result.ok).toBe(true);
    expect(result.record.state).toBe("active");
    expect(result.record.provides?.syncProvider?.id).toBe("r2");
  });

  it("records invalid manifests as errors without throwing", () => {
    const record = verifyPluginHostRecord(createDiscoveredPluginHostRecord("broken"), {
      id: "broken",
      apiVersion: 1,
      entry: "./src/index.ts",
      capabilities: [],
      permissions: [],
    });

    expect(record.state).toBe("error");
    expect(record.errorMessage).toBe("Plugin manifest is invalid.");
    expect(record.issues).toEqual(
      expect.arrayContaining([
        {
          field: "name",
          message: "name must be a non-empty string.",
        },
      ]),
    );
  });

  it("rejects manifests that do not match the discovered plugin id", () => {
    const record = verifyPluginHostRecord(createDiscoveredPluginHostRecord("sync-r2"), {
      ...syncManifest,
      id: "other-plugin",
    });

    expect(record).toStrictEqual({
      id: "sync-r2",
      state: "error",
      errorMessage: "Plugin manifest id does not match discovered plugin id.",
      issues: [
        {
          field: "id",
          message: "id must match the discovered plugin id.",
        },
      ],
    });
  });

  it("returns enabled or active records to verified when disabled", () => {
    const enabled = enablePluginHostRecord(
      verifyPluginHostRecord(createDiscoveredPluginHostRecord("sync-r2"), syncManifest),
    );

    expect(disablePluginHostRecord(enabled)).toMatchObject({
      id: "sync-r2",
      state: "verified",
      manifest: syncManifest,
    });
  });
});

describe("validatePluginProvides", () => {
  it("rejects non-object and unsupported capability registrations", () => {
    expect(validatePluginProvides(syncManifest, null)).toStrictEqual([
      {
        field: "capabilities",
        message: "Plugin registrations must be an object.",
      },
    ]);

    expect(
      validatePluginProvides(syncManifest, {
        ...syncProvider,
        filesystemProvider: {},
      }),
    ).toStrictEqual([
      {
        field: "capabilities",
        message: "Unsupported registered capability: filesystemProvider.",
      },
    ]);
  });

  it("rejects missing and undeclared capability registrations", () => {
    expect(validatePluginProvides(syncManifest, {})).toStrictEqual([
      {
        field: "capabilities",
        message: "Declared capability was not registered: syncProvider.",
      },
    ]);

    expect(
      validatePluginProvides(
        {
          ...syncManifest,
          capabilities: [],
        },
        syncProvider,
      ),
    ).toStrictEqual([
      {
        field: "capabilities",
        message: "Registered capability was not declared: syncProvider.",
      },
    ]);
  });

  it("rejects invalid capability registrations", () => {
    const invalidProvides = {
      syncProvider: {
        id: "r2",
        name: "Cloudflare R2",
        upload: async () => undefined,
      },
    } as unknown as PluginProvides;

    expect(validatePluginProvides(syncManifest, invalidProvides)).toStrictEqual([
      {
        field: "capabilities",
        message: "Registered capability is invalid: syncProvider.",
      },
    ]);
  });
});

describe("permissioned plugin host services", () => {
  it("allows services covered by manifest permissions", async () => {
    const permissionedServices = createPermissionedPluginHostServices(syncManifest, services);

    await expect(
      permissionedServices.network.request({ url: "https://example.com" }),
    ).resolves.toMatchObject({
      status: 200,
    });
    await expect(permissionedServices.secrets.get("token")).resolves.toBe("secret");
  });

  it("rejects services that were not granted by the manifest", async () => {
    const permissionedServices = createPermissionedPluginHostServices(syncManifest, services);

    await expect(permissionedServices.settings.get("theme")).rejects.toStrictEqual(
      new PluginPermissionError("settings:read"),
    );
    await expect(
      permissionedServices.workspace.write("note.md", new Uint8Array()),
    ).rejects.toStrictEqual(new PluginPermissionError("workspace:write"));
  });
});

describe("activatePluginHostRecord", () => {
  it("rejects manifest and registration mismatches as host errors", async () => {
    const enabled = enablePluginHostRecord(
      verifyPluginHostRecord(createDiscoveredPluginHostRecord("sync-r2"), syncManifest),
    );
    const plugin: GrovePlugin = {
      id: "sync-r2",
      name: "Cloudflare R2 Sync",
      activate: async () => ({}),
    };

    const result = await activatePluginHostRecord(enabled, plugin, services);

    expect(result.ok).toBe(false);
    expect(result.record).toMatchObject({
      state: "error",
      errorMessage: "Plugin registrations do not match manifest.",
      issues: [
        {
          field: "capabilities",
          message: "Declared capability was not registered: syncProvider.",
        },
      ],
    });
  });

  it("rejects non-object activation results as host errors", async () => {
    const enabled = enablePluginHostRecord(
      verifyPluginHostRecord(createDiscoveredPluginHostRecord("sync-r2"), syncManifest),
    );
    const plugin: GrovePlugin = {
      id: "sync-r2",
      name: "Cloudflare R2 Sync",
      activate: async () => null as unknown as PluginProvides,
    };

    const result = await activatePluginHostRecord(enabled, plugin, services);

    expect(result.ok).toBe(false);
    expect(result.record).toMatchObject({
      state: "error",
      errorMessage: "Plugin registrations do not match manifest.",
      issues: [
        {
          field: "capabilities",
          message: "Plugin registrations must be an object.",
        },
      ],
    });
  });

  it("turns plugin activation failures into error records", async () => {
    const enabled = enablePluginHostRecord(
      verifyPluginHostRecord(createDiscoveredPluginHostRecord("sync-r2"), syncManifest),
    );
    const plugin: GrovePlugin = {
      id: "sync-r2",
      name: "Cloudflare R2 Sync",
      activate: async (context) => {
        await context.services.settings.get("theme");
        return syncProvider;
      },
    };

    const result = await activatePluginHostRecord(enabled, plugin, services);

    expect(result.ok).toBe(false);
    expect(result.record).toMatchObject({
      state: "error",
      errorMessage: "Plugin permission required: settings:read",
    });
  });
});
