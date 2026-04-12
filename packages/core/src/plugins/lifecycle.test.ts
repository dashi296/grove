import { describe, expect, it } from "vitest"

import { PluginHostError } from "./errors.js"
import { createHostServices } from "./host-services.js"
import { PluginHost } from "./lifecycle.js"
import { compareSemver, validatePluginManifest } from "./manifest.js"
import { definePlugin, type PluginManifest } from "./types.js"

const validManifest = {
  id: "grove.sync.r2",
  name: "Cloudflare R2",
  version: "0.1.0",
  apiVersion: "1",
  entry: "dist/index.js",
  description: "Sync plugin",
  author: {
    name: "Grove",
    url: "https://grove.app",
  },
  homepage: "https://grove.app/plugins/r2",
  repository: "https://github.com/dashi296/grove",
  license: "MIT",
  keywords: ["sync", "r2"],
  platforms: ["desktop"],
  capabilities: ["sync"],
  permissions: [
    "network.outbound",
    "storage.secret.read",
    "storage.secret.write",
    "settings.read",
    "settings.write",
    "sync.provider",
  ],
} satisfies PluginManifest

describe("validatePluginManifest", () => {
  it("orders prerelease versions before stable versions", () => {
    expect(compareSemver("0.1.0-beta.1", "0.1.0")).toBeLessThan(0)
    expect(compareSemver("0.1.0", "0.1.0-beta.1")).toBeGreaterThan(0)
    expect(compareSemver("0.1.0-beta.2", "0.1.0-beta.10")).toBeLessThan(0)
  })

  it("accepts a valid manifest", () => {
    const result = validatePluginManifest(validManifest, {
      strict: true,
      currentAppVersion: "0.1.0",
      currentPlatform: "desktop",
      packageRoot: "/plugins/sync-r2",
    })

    expect(result.manifest.id).toBe("grove.sync.r2")
    expect(result.warnings).toEqual([])
  })

  it("rejects invalid entry escapes and capability/permission mismatches", () => {
    expect(() =>
      validatePluginManifest(
        {
          ...validManifest,
          entry: "../dist/index.js",
          capabilities: ["ai"],
          permissions: ["sync.provider"],
        },
        { strict: true },
      ),
    ).toThrowError(PluginHostError)
  })

  it("rejects unknown top-level fields in strict mode", () => {
    expect(() =>
      validatePluginManifest(
        {
          ...validManifest,
          extraField: true,
        },
        { strict: true },
      ),
    ).toThrowError(PluginHostError)
  })
})

describe("createHostServices", () => {
  it("enforces permission-gated settings and network access", async () => {
    const services = createHostServices({
      manifest: validManifest,
      platform: "desktop",
      grantedPermissions: ["settings.read"],
    })

    await expect(services.settings.get("theme")).resolves.toBeNull()
    await expect(services.settings.set("theme", "leaf")).rejects.toMatchObject({
      code: "PLUGIN_PERMISSION_DENIED",
    })
    expect(services.network).toBeUndefined()
  })
})

describe("PluginHost", () => {
  it("moves a valid plugin through verified, enabled, and active states", async () => {
    const host = new PluginHost({
      appVersion: "0.1.0",
      platform: "desktop",
      strictManifestValidation: true,
    })

    const discovered = host.discoverPlugin({
      manifestJson: validManifest,
      packageRoot: "/plugins/sync-r2",
      grantedPermissions: validManifest.permissions,
      packageIntegrityVerified: true,
    })

    expect(discovered.state).toBe("enabled")
    expect(discovered.transitions.map((transition) => transition.state)).toEqual([
      "discovered",
      "installed",
      "verified",
      "enabled",
    ])

    const module = {
      default: definePlugin({
        async activate() {
          return {
            syncProvider: {
              id: "r2",
              name: "Cloudflare R2",
              async isAvailable() {
                return true
              },
              async getAuthStatus() {
                return "authenticated" as const
              },
              async list() {
                return []
              },
              async upload() {},
              async download() {
                return new Uint8Array()
              },
              async delete() {},
            },
            settings: {
              sections: [
                {
                  title: "R2",
                  fields: [
                    {
                      key: "bucket",
                      type: "text",
                      label: "Bucket",
                    },
                  ],
                },
              ],
            },
          }
        },
      }),
    }

    const active = await host.activatePlugin(validManifest.id, { module })

    expect(active.state).toBe("active")
    expect(active.registration?.syncProvider?.id).toBe("r2")
  })

  it("moves invalid registrations to error without crashing the host", async () => {
    const host = new PluginHost({
      appVersion: "0.1.0",
      platform: "desktop",
    })

    host.discoverPlugin({
      manifestJson: validManifest,
      grantedPermissions: validManifest.permissions,
      packageIntegrityVerified: true,
    })

    const result = await host.activatePlugin(validManifest.id, {
      module: {
        default: definePlugin({
          async activate() {
            return {
              aiProvider: {
                id: "claude",
                name: "Claude",
                async isAvailable() {
                  return true
                },
                async complete() {
                  return {
                    text: "ok",
                    finishReason: "stop" as const,
                  }
                },
              },
            }
          },
        }),
      },
    })

    expect(result.state).toBe("error")
    expect(result.lastError?.code).toBe("PLUGIN_REGISTRATION_INVALID")
  })

  it("rejects malformed settings schemas during activation", async () => {
    const host = new PluginHost({
      appVersion: "0.1.0",
      platform: "desktop",
    })

    host.discoverPlugin({
      manifestJson: validManifest,
      grantedPermissions: validManifest.permissions,
      packageIntegrityVerified: true,
    })

    const result = await host.activatePlugin(validManifest.id, {
      module: {
        default: definePlugin({
          async activate() {
            return {
              settings: {
                sections: [
                  {
                    title: "R2",
                    fields: [
                      {
                        key: "region",
                        type: "select",
                        label: "Region",
                        options: [],
                      },
                    ],
                  },
                ],
              },
            }
          },
        }),
      },
    })

    expect(result.state).toBe("error")
    expect(result.lastError?.code).toBe("PLUGIN_REGISTRATION_INVALID")
    expect(result.lastError?.message).toContain("at least one option")
  })
})
