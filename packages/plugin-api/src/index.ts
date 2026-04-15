import type { SyncProvider as CoreSyncProvider } from "@grove/core";

export type PluginApiVersion = 1;

export type PluginCapability = "syncProvider" | "aiProvider";

export type PluginPermission =
  | "network"
  | "settings:read"
  | "settings:write"
  | "secrets:read"
  | "secrets:write"
  | "workspace:read"
  | "workspace:write";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  apiVersion: PluginApiVersion;
  entry: string;
  capabilities: PluginCapability[];
  permissions: PluginPermission[];
  description?: string;
  author?: string;
};

export type PluginSettingValue = string | number | boolean | null;

export type PluginSettingsService = {
  get(key: string): Promise<PluginSettingValue | undefined>;
  set(key: string, value: PluginSettingValue): Promise<void>;
  delete(key: string): Promise<void>;
};

export type PluginSecretsService = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type PluginNetworkRequest = {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: Uint8Array | string;
};

export type PluginNetworkResponse = {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
};

export type PluginNetworkService = {
  request(request: PluginNetworkRequest): Promise<PluginNetworkResponse>;
};

export type PluginWorkspaceFileEntry = {
  path: string;
  hash: string;
  updatedAt: Date;
  size: number;
};

export type PluginWorkspaceFileService = {
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  list(prefix?: string): Promise<PluginWorkspaceFileEntry[]>;
  delete(path: string): Promise<void>;
};

export type PluginHostServices = {
  readonly settings: PluginSettingsService;
  readonly secrets: PluginSecretsService;
  readonly network: PluginNetworkService;
  readonly workspace: PluginWorkspaceFileService;
};

export type PluginContext = {
  readonly manifest: PluginManifest;
  readonly services: PluginHostServices;
};

export type AiMessageRole = "system" | "user" | "assistant";

export type AiMessage = {
  role: AiMessageRole;
  content: string;
};

export type AiGenerationRequest = {
  messages: AiMessage[];
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type AiGenerationResult = {
  text: string;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
};

export interface AiProvider {
  readonly id: string;
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generate(request: AiGenerationRequest): Promise<AiGenerationResult>;
}

export type SyncProvider = CoreSyncProvider;

export type PluginProvides = {
  syncProvider?: SyncProvider;
  aiProvider?: AiProvider;
};

export type GrovePlugin = {
  readonly id: string;
  readonly name: string;
  readonly manifest?: PluginManifest;
  activate(context: PluginContext): Promise<PluginProvides> | PluginProvides;
  deactivate?(): Promise<void> | void;
};

export function definePlugin<const Plugin extends GrovePlugin>(plugin: Plugin): Plugin {
  return plugin;
}
