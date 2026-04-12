export const pluginApiVersion = "1" as const

export const capabilityValues = ["sync", "ai"] as const
export const permissionValues = [
  "network.outbound",
  "storage.secret.read",
  "storage.secret.write",
  "settings.read",
  "settings.write",
  "sync.provider",
  "ai.provider",
] as const
export const platformValues = ["desktop", "mobile"] as const

export type PluginApiVersion = typeof pluginApiVersion
export type Capability = (typeof capabilityValues)[number]
export type Permission = (typeof permissionValues)[number]
export type Platform = (typeof platformValues)[number]

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
  platforms: Platform[]
  minAppVersion?: string
  capabilities: Capability[]
  permissions: Permission[]
}

export interface PluginLogger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface PermissionChecker {
  has(permission: Permission): boolean
  require(permission: Permission): void
}

export interface PluginSettingsStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  listKeys(): Promise<string[]>
}

export interface SecretStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  listKeys(): Promise<string[]>
}

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

export type SyncAuthStatus = "authenticated" | "unauthenticated" | "expired"

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
    options?: { ifMatch?: string },
  ): Promise<void>
  download(path: string): Promise<Uint8Array>
  delete(path: string): Promise<void>
}

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

export type PluginRegistration = {
  syncProvider?: SyncProvider
  aiProvider?: AiProvider
  settings?: PluginSettingsDefinition
}

export type PluginContext = {
  manifest: PluginManifest
  platform: Platform
  logger: PluginLogger
  permissions: PermissionChecker
  settings: PluginSettingsStore
  secrets: SecretStore
  network?: NetworkClient
}

export type GrovePluginModule = {
  activate(context: PluginContext): Promise<PluginRegistration>
  deactivate?(): Promise<void>
}

export function definePlugin(plugin: GrovePluginModule): GrovePluginModule {
  return plugin
}

export type PluginLifecycleState =
  | "discovered"
  | "installed"
  | "verified"
  | "disabled"
  | "enabled"
  | "active"
  | "error"
