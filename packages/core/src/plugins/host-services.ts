import { PluginHostError } from "./errors.js"
import type {
  HttpRequest,
  HttpResponse,
  NetworkClient,
  Permission,
  PermissionChecker,
  PluginContext,
  PluginLogger,
  PluginManifest,
  PluginSettingsStore,
  SecretStore,
  Platform,
} from "./types.js"

type ScopedStore = Map<string, Map<string, unknown>>
type ScopedSecretStore = Map<string, Map<string, string>>
type NetworkHandler = (pluginId: string, request: HttpRequest) => Promise<HttpResponse>

export type HostServicesOptions = {
  manifest: PluginManifest
  platform: Platform
  grantedPermissions: Iterable<Permission>
  settingsStore?: ScopedStore
  secretStore?: ScopedSecretStore
  networkHandler?: NetworkHandler
  logger?: PluginLogger
}

export type HostServices = Pick<
  PluginContext,
  "logger" | "permissions" | "settings" | "secrets"
> & { network?: NetworkClient }

export function createHostServices(options: HostServicesOptions): HostServices {
  const grantedPermissions = new Set(options.grantedPermissions)
  const settingsStore = options.settingsStore ?? new Map()
  const secretStore = options.secretStore ?? new Map()
  const permissions = createPermissionChecker(grantedPermissions)
  const logger = options.logger ?? createPluginLogger(options.manifest.id)

  const services: HostServices = {
    logger,
    permissions,
    settings: createPluginSettingsStore(
      options.manifest.id,
      permissions,
      settingsStore,
    ),
    secrets: createSecretStore(options.manifest.id, permissions, secretStore),
  }

  if (grantedPermissions.has("network.outbound")) {
    services.network = createNetworkClient(
      options.manifest.id,
      permissions,
      options.networkHandler,
    )
  }

  return services
}

export function createPermissionChecker(
  grantedPermissions: Iterable<Permission>,
): PermissionChecker {
  const granted = new Set(grantedPermissions)
  return {
    has(permission) {
      return granted.has(permission)
    },
    require(permission) {
      if (!granted.has(permission)) {
        throw new PluginHostError(
          "PLUGIN_PERMISSION_DENIED",
          `Permission "${permission}" was not granted.`,
        )
      }
    },
  }
}

export function createPluginLogger(pluginId: string): PluginLogger {
  return {
    debug(message, meta) {
      emitLog("debug", pluginId, message, meta)
    },
    info(message, meta) {
      emitLog("info", pluginId, message, meta)
    },
    warn(message, meta) {
      emitLog("warn", pluginId, message, meta)
    },
    error(message, meta) {
      emitLog("error", pluginId, message, meta)
    },
  }
}

export function createPluginSettingsStore(
  pluginId: string,
  permissions: PermissionChecker,
  backingStore: ScopedStore,
): PluginSettingsStore {
  return {
    async get<T>(key: string) {
      permissions.require("settings.read")
      return (getScopedMap(backingStore, pluginId).get(key) as T | undefined) ?? null
    },
    async set<T>(key: string, value: T) {
      permissions.require("settings.write")
      ensureJsonSerializable(value)
      getScopedMap(backingStore, pluginId).set(key, value)
    },
    async delete(key: string) {
      permissions.require("settings.write")
      getScopedMap(backingStore, pluginId).delete(key)
    },
    async listKeys() {
      permissions.require("settings.read")
      return [...getScopedMap(backingStore, pluginId).keys()]
    },
  }
}

export function createSecretStore(
  pluginId: string,
  permissions: PermissionChecker,
  backingStore: ScopedSecretStore,
): SecretStore {
  return {
    async get(key) {
      permissions.require("storage.secret.read")
      return getScopedSecretMap(backingStore, pluginId).get(key) ?? null
    },
    async set(key, value) {
      permissions.require("storage.secret.write")
      getScopedSecretMap(backingStore, pluginId).set(key, value)
    },
    async delete(key) {
      permissions.require("storage.secret.write")
      getScopedSecretMap(backingStore, pluginId).delete(key)
    },
    async listKeys() {
      permissions.require("storage.secret.read")
      return [...getScopedSecretMap(backingStore, pluginId).keys()]
    },
  }
}

export function createNetworkClient(
  pluginId: string,
  permissions: PermissionChecker,
  networkHandler?: NetworkHandler,
): NetworkClient {
  return {
    async request(input) {
      permissions.require("network.outbound")
      ensureHttpUrl(input.url)
      if (networkHandler === undefined) {
        throw new PluginHostError(
          "PLUGIN_RUNTIME_ERROR",
          `No network handler is configured for plugin "${pluginId}".`,
        )
      }
      return networkHandler(pluginId, input)
    },
  }
}

function emitLog(
  level: "debug" | "info" | "warn" | "error",
  pluginId: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  if (meta !== undefined) {
    ensureJsonSerializable(meta)
  }

  const method = level === "error" ? console.error : console[level]
  method(`[plugin:${pluginId}] ${message}`, meta ?? {})
}

function ensureJsonSerializable(value: unknown): void {
  try {
    JSON.stringify(value)
  } catch {
    throw new PluginHostError(
      "PLUGIN_RUNTIME_ERROR",
      "Settings values and log metadata must be JSON-serializable.",
    )
  }
}

function ensureHttpUrl(urlValue: string): void {
  let parsed: URL
  try {
    parsed = new URL(urlValue)
  } catch {
    throw new PluginHostError(
      "PLUGIN_RUNTIME_ERROR",
      `Invalid URL "${urlValue}".`,
    )
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PluginHostError(
      "PLUGIN_RUNTIME_ERROR",
      `Unsupported URL protocol "${parsed.protocol}".`,
    )
  }
}

function getScopedMap(
  store: ScopedStore,
  pluginId: string,
): Map<string, unknown> {
  let scoped = store.get(pluginId)
  if (scoped === undefined) {
    scoped = new Map()
    store.set(pluginId, scoped)
  }
  return scoped
}

function getScopedSecretMap(
  store: ScopedSecretStore,
  pluginId: string,
): Map<string, string> {
  let scoped = store.get(pluginId)
  if (scoped === undefined) {
    scoped = new Map()
    store.set(pluginId, scoped)
  }
  return scoped
}
