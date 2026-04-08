# Plugin API Specification

## Status

- Version: `1.0.0-draft`
- Plugin API version: `1`
- Target app: Grove

This document defines the formal runtime contract between Grove and third-party plugins.

---

## Goals

- Keep `packages/core` independent from plugin implementations
- Allow `sync` and `ai` plugins to share one host architecture
- Enforce permissions at the host boundary instead of trusting plugin code
- Keep desktop and mobile compatible through a runtime-agnostic bridge

---

## Non-Goals

- Direct plugin access to Rust commands
- Direct plugin access to SQLite or local Markdown files
- Rendering arbitrary plugin UI inside the app shell in v1
- Allowing plugins to perform encryption, merge, or conflict resolution for sync

---

## Terminology

- Host: Grove application process that loads and manages plugins
- Runtime: isolated JavaScript execution environment used for plugin code
- Bridge: RPC channel between runtime and host
- Capability: category of feature a plugin may provide
- Permission: host-approved action a plugin may perform
- Registration: feature implementation returned by `activate()`

---

## Module Contract

Each plugin entry file must export exactly one default plugin module.

```ts
export default definePlugin({
  async activate(context) {
    return {
      syncProvider: {
        id: "r2",
        name: "Cloudflare R2",
        async isAvailable() {
          return true
        },
        async getAuthStatus() {
          return "authenticated"
        },
        async list(prefix) {
          return []
        },
        async upload(path, data) {},
        async download(path) {
          return new Uint8Array()
        },
        async delete(path) {},
      },
    }
  },
})
```

The host must reject plugins that do not provide a default export compatible with `GrovePluginModule`.

---

## Top-Level Types

```ts
export type PluginApiVersion = "1"

export type Capability =
  | "sync"
  | "ai"

export type Permission =
  | "network.outbound"
  | "storage.secret.read"
  | "storage.secret.write"
  | "settings.read"
  | "settings.write"
  | "sync.provider"
  | "ai.provider"

export type PluginManifest = {
  id: string
  name: string
  version: string
  apiVersion: PluginApiVersion
  entry: string
  description?: string
  author?: {
    name: string
    url?: string
  }
  homepage?: string
  repository?: string
  license?: string
  keywords?: string[]
  platforms: Array<"desktop" | "mobile">
  minAppVersion?: string
  capabilities: Capability[]
  permissions: Permission[]
}

export type GrovePluginModule = {
  activate(context: PluginContext): Promise<PluginRegistration>
  deactivate?(): Promise<void>
}

export type PluginRegistration = {
  syncProvider?: SyncProvider
  aiProvider?: AiProvider
  settings?: PluginSettingsDefinition
}
```

---

## `definePlugin`

`definePlugin` is a zero-runtime helper used for type narrowing.

```ts
export function definePlugin(plugin: GrovePluginModule): GrovePluginModule
```

Host behavior:

- The host must not depend on `definePlugin` at runtime
- The host must validate the exported object after loading the module

---

## `PluginContext`

```ts
export type PluginContext = {
  manifest: PluginManifest
  platform: "desktop" | "mobile"
  logger: PluginLogger
  permissions: PermissionChecker
  settings: PluginSettingsStore
  secrets: SecretStore
  network?: NetworkClient
}
```

Field rules:

- `manifest` is the validated, read-only representation of `grove-plugin.json`
- `platform` is set by the host
- `logger`, `settings`, and `permissions` are always present
- `secrets` is always present, but each method must enforce permission checks
- `network` is only present when `network.outbound` is granted

The host must reject any plugin attempt to access APIs beyond granted permissions.

---

## Host Service Interfaces

### `PluginLogger`

```ts
export interface PluginLogger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}
```

Rules:

- Log entries must be tagged with plugin id by the host
- Host may drop `debug` logs in production builds
- Logged metadata must be JSON-serializable

### `PermissionChecker`

```ts
export interface PermissionChecker {
  has(permission: Permission): boolean
  require(permission: Permission): void
}
```

Rules:

- `require()` must throw a host-defined permission error if the permission is missing
- Plugin code may call `has()` for branching, but host enforcement must still happen inside each privileged API

### `PluginSettingsStore`

```ts
export interface PluginSettingsStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  listKeys(): Promise<string[]>
}
```

Rules:

- Keys are scoped per plugin id
- Values must be JSON-serializable
- `get`, `listKeys` require `settings.read`
- `set`, `delete` require `settings.write`

### `SecretStore`

```ts
export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  listKeys(): Promise<string[]>
}
```

Rules:

- Keys are scoped per plugin id
- Values must be UTF-8 strings
- `get`, `listKeys` require `storage.secret.read`
- `set`, `delete` require `storage.secret.write`
- Host should back this store with OS-managed secure storage whenever available

### `NetworkClient`

```ts
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD"

export type HttpRequest = {
  method: HttpMethod
  url: string
  headers?: Record<string, string>
  body?: Uint8Array | string
  timeoutMs?: number
}

export type HttpResponse = {
  status: number
  headers: Record<string, string>
  body: Uint8Array
}

export interface NetworkClient {
  request(input: HttpRequest): Promise<HttpResponse>
}
```

Rules:

- `NetworkClient` requires `network.outbound`
- Only `http` and `https` URLs are allowed
- Host may enforce allowlists, timeout caps, and body size limits
- Redirect handling is host-defined and must be documented in implementation

---

## Capability Interfaces

### `SyncProvider`

```ts
export type SyncAuthStatus =
  | "authenticated"
  | "unauthenticated"
  | "expired"

export type SyncEntry = {
  path: string
  hash: string
  updatedAt: string
  size: number
  etag?: string
}

export interface SyncProvider {
  readonly id: string
  readonly name: string
  isAvailable(): Promise<boolean>
  getAuthStatus(): Promise<SyncAuthStatus>
  list(prefix?: string): Promise<SyncEntry[]>
  upload(
    path: string,
    data: Uint8Array,
    options?: { ifMatch?: string }
  ): Promise<void>
  download(path: string): Promise<Uint8Array>
  delete(path: string): Promise<void>
}
```

Rules:

- Registration requires `sync.provider`
- Registration requires declared capability `sync`
- `path` is a normalized relative blob path and must not be treated as a local file path
- `data` is always encrypted application output; plugins must not attempt to encrypt or decrypt it
- Providers must not parse note content or infer note semantics
- `updatedAt` must be an ISO 8601 UTC string
- `hash` must represent the remote object payload hash exposed by the provider or a stable equivalent

### `AiProvider`

```ts
export type AiMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type AiCompletionRequest = {
  messages: AiMessage[]
  model?: string
  temperature?: number
  maxOutputTokens?: number
}

export type AiCompletionResponse = {
  text: string
  finishReason: "stop" | "length" | "error"
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export interface AiProvider {
  readonly id: string
  readonly name: string
  isAvailable(): Promise<boolean>
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>
}
```

Rules:

- Registration requires `ai.provider`
- Registration requires declared capability `ai`
- Host is responsible for choosing what note content is sent to the provider
- Providers must not be given unrestricted access to the note store in API v1

---

## Settings Definition Interface

API v1 uses schema-driven settings instead of arbitrary plugin-rendered UI.

```ts
export type PluginSettingsDefinition = {
  sections: PluginSettingsSection[]
}

export type PluginSettingsSection = {
  title: string
  fields: PluginSettingsField[]
}

export type PluginSettingsField =
  | {
      key: string
      type: "text"
      label: string
      secret?: boolean
      placeholder?: string
    }
  | {
      key: string
      type: "select"
      label: string
      options: string[]
    }
  | {
      key: string
      type: "boolean"
      label: string
    }
```

Rules:

- Field keys must be unique within a plugin
- `secret: true` fields must be stored through `SecretStore`
- Non-secret fields must be stored through `PluginSettingsStore`
- Returning `settings` does not require a dedicated capability
- A plugin may expose a settings schema even if it provides only `sync` or `ai`

---

## Lifecycle

Plugin lifecycle states:

- `discovered`
- `installed`
- `verified`
- `disabled`
- `enabled`
- `active`
- `error`

Activation sequence:

1. Host reads `grove-plugin.json`
2. Host validates schema and `apiVersion`
3. Host verifies package integrity
4. Host checks user-granted permissions
5. Host loads entry module into runtime
6. Host calls `activate(context)`
7. Host validates returned registration against declared capabilities and permissions
8. Host registers features into host registries

Deactivation sequence:

1. Host unregisters all features provided by the plugin
2. Host calls `deactivate()` if present
3. Host tears down the runtime

Failure rules:

- Activation failure must move the plugin to `error`
- A plugin in `error` must not crash the host app
- Hosts may auto-disable repeatedly failing plugins

---

## Validation Rules

The host must enforce the following:

- Plugin capability registrations must match `capabilities` declared in `grove-plugin.json`
- Privileged APIs must require the matching declared permission
- A plugin may return `settings` without declaring an additional capability
- Unknown capabilities or permissions must reject the plugin
- Missing required exports must reject the plugin
- Duplicate plugin ids must reject installation

Examples:

- A plugin that returns `syncProvider` without `capabilities: ["sync"]` is invalid
- A plugin that declares `sync` but lacks `sync.provider` permission is invalid
- A plugin that returns `settings` alongside `syncProvider` is valid without any extra capability
- A plugin that requests `network.outbound` but never uses it is valid; the host does not infer permissions from code

---

## Serialization Rules

Because plugins run behind a bridge, all host-plugin boundary values must be serializable.

Rules:

- `Date` objects must not cross the boundary; use ISO strings
- Errors must be converted to structured error payloads by the host runtime
- Binary payloads must use `Uint8Array`
- Functions may only appear in in-process plugin module exports, never in serialized settings schemas or persisted metadata

---

## Error Model

Host-defined error codes:

- `PLUGIN_MANIFEST_INVALID`
- `PLUGIN_API_VERSION_UNSUPPORTED`
- `PLUGIN_PERMISSION_DENIED`
- `PLUGIN_ACTIVATION_FAILED`
- `PLUGIN_REGISTRATION_INVALID`
- `PLUGIN_RUNTIME_ERROR`

The exact runtime exception class is implementation-defined, but the error code must be preserved in logs and diagnostics.

---

## Compatibility Rules

- Patch and minor changes to this spec must remain backward compatible within API version `1`
- Breaking changes require a new `apiVersion`
- Hosts may support multiple `apiVersion` values simultaneously
- Plugins must declare exactly one `apiVersion`

---

## Security Requirements

- Plugin code must run in an isolated runtime
- Plugins must not receive raw file-system or database handles
- Secrets must never be written to plain plugin settings
- Network access must be denied by default
- Sync plugins must only handle encrypted bytes, never plaintext note content

---

## Deferred Items

The following are explicitly out of scope for API version `1`:

- Arbitrary custom UI rendering
- Background daemons that survive app shutdown
- Command palette or toolbar command registration
- Inter-plugin communication
- Native binary plugins
- Direct streaming APIs for AI providers
