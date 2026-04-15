import type {
  GrovePlugin,
  PluginCapability,
  PluginHostServices,
  PluginManifest,
  PluginPermission,
  PluginProvides,
} from "@grove/plugin-api";

const supportedApiVersion = 1;

const supportedCapabilities = ["syncProvider", "aiProvider"] satisfies PluginCapability[];
const supportedPermissions = [
  "network",
  "settings:read",
  "settings:write",
  "secrets:read",
  "secrets:write",
  "workspace:read",
  "workspace:write",
] satisfies PluginPermission[];

const capabilitySet = new Set<string>(supportedCapabilities);
const permissionSet = new Set<string>(supportedPermissions);

export type PluginHostLifecycleState = "discovered" | "verified" | "enabled" | "active" | "error";

export type PluginHostValidationIssue = {
  field: string;
  message: string;
};

export type PluginHostValidationResult =
  | {
      ok: true;
      manifest: PluginManifest;
      issues: readonly [];
    }
  | {
      ok: false;
      issues: readonly PluginHostValidationIssue[];
    };

export type PluginHostRecord = {
  id: string;
  state: PluginHostLifecycleState;
  manifest?: PluginManifest;
  provides?: PluginProvides;
  errorMessage?: string;
  issues: readonly PluginHostValidationIssue[];
};

export type PluginHostActivationResult =
  | {
      ok: true;
      record: PluginHostRecord & {
        state: "active";
        manifest: PluginManifest;
        provides: PluginProvides;
      };
    }
  | {
      ok: false;
      record: PluginHostRecord & {
        state: "error";
      };
    };

export class PluginPermissionError extends Error {
  readonly permission: PluginPermission;

  constructor(permission: PluginPermission) {
    super(`Plugin permission required: ${permission}`);
    this.name = "PluginPermissionError";
    this.permission = permission;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function hasDuplicates(entries: readonly string[]): boolean {
  return new Set(entries).size !== entries.length;
}

function isPluginCapability(value: string): value is PluginCapability {
  return capabilitySet.has(value);
}

function isPluginPermission(value: string): value is PluginPermission {
  return permissionSet.has(value);
}

function validateStringField(
  input: Record<string, unknown>,
  field: keyof PluginManifest,
  issues: PluginHostValidationIssue[],
): void {
  if (!isNonEmptyString(input[field])) {
    issues.push({
      field,
      message: `${field} must be a non-empty string.`,
    });
  }
}

function validateEntry(input: Record<string, unknown>, issues: PluginHostValidationIssue[]): void {
  const entry = input.entry;

  if (!isNonEmptyString(entry)) {
    issues.push({
      field: "entry",
      message: "entry must be a non-empty string.",
    });
    return;
  }

  if (
    entry.startsWith("/") ||
    entry.startsWith("\\") ||
    entry.includes("..") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(entry)
  ) {
    issues.push({
      field: "entry",
      message: "entry must stay inside the plugin package.",
    });
  }
}

function validateApiVersion(
  input: Record<string, unknown>,
  issues: PluginHostValidationIssue[],
): void {
  if (input.apiVersion !== supportedApiVersion) {
    issues.push({
      field: "apiVersion",
      message: `apiVersion must be ${supportedApiVersion}.`,
    });
  }
}

function validateEnumArray(
  input: Record<string, unknown>,
  field: "capabilities" | "permissions",
  knownValueLabel: string,
  isKnownValue: (value: string) => boolean,
  issues: PluginHostValidationIssue[],
): void {
  const value = input[field];

  if (!isStringArray(value)) {
    issues.push({
      field,
      message: `${field} must be an array of ${knownValueLabel}.`,
    });
    return;
  }

  if (hasDuplicates(value)) {
    issues.push({
      field,
      message: `${field} must not contain duplicates.`,
    });
  }

  for (const entry of value) {
    if (!isKnownValue(entry)) {
      issues.push({
        field,
        message: `Unsupported ${knownValueLabel}: ${entry}.`,
      });
    }
  }
}

function validateOptionalStringField(
  input: Record<string, unknown>,
  field: "description" | "author",
  issues: PluginHostValidationIssue[],
): void {
  const value = input[field];

  if (value !== undefined && typeof value !== "string") {
    issues.push({
      field,
      message: `${field} must be a string when present.`,
    });
  }
}

function toManifest(input: Record<string, unknown>): PluginManifest {
  return {
    id: input.id as string,
    name: input.name as string,
    version: input.version as string,
    apiVersion: supportedApiVersion,
    entry: input.entry as string,
    capabilities: (input.capabilities as string[]).filter(isPluginCapability),
    permissions: (input.permissions as string[]).filter(isPluginPermission),
    ...(typeof input.description === "string" ? { description: input.description } : {}),
    ...(typeof input.author === "string" ? { author: input.author } : {}),
  };
}

export function validatePluginManifest(input: unknown): PluginHostValidationResult {
  const issues: PluginHostValidationIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          field: "manifest",
          message: "Plugin manifest must be an object.",
        },
      ],
    };
  }

  validateStringField(input, "id", issues);
  validateStringField(input, "name", issues);
  validateStringField(input, "version", issues);
  validateApiVersion(input, issues);
  validateEntry(input, issues);
  validateEnumArray(input, "capabilities", "capability", isPluginCapability, issues);
  validateEnumArray(input, "permissions", "permission", isPluginPermission, issues);
  validateOptionalStringField(input, "description", issues);
  validateOptionalStringField(input, "author", issues);

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    manifest: toManifest(input),
    issues: [],
  };
}

export function createDiscoveredPluginHostRecord(id: string): PluginHostRecord {
  return {
    id,
    state: "discovered",
    issues: [],
  };
}

export function verifyPluginHostRecord(
  record: PluginHostRecord,
  manifestInput: unknown,
): PluginHostRecord {
  const validation = validatePluginManifest(manifestInput);

  if (!validation.ok) {
    return {
      id: record.id,
      state: "error",
      errorMessage: "Plugin manifest is invalid.",
      issues: validation.issues,
    };
  }

  if (validation.manifest.id !== record.id) {
    return {
      id: record.id,
      state: "error",
      errorMessage: "Plugin manifest id does not match discovered plugin id.",
      issues: [
        {
          field: "id",
          message: "id must match the discovered plugin id.",
        },
      ],
    };
  }

  return {
    id: validation.manifest.id,
    state: "verified",
    manifest: validation.manifest,
    issues: [],
  };
}

export function enablePluginHostRecord(record: PluginHostRecord): PluginHostRecord {
  if (record.state !== "verified" || record.manifest === undefined) {
    return record;
  }

  return {
    ...record,
    state: "enabled",
  };
}

export function disablePluginHostRecord(record: PluginHostRecord): PluginHostRecord {
  if (record.state !== "enabled" && record.state !== "active") {
    return record;
  }

  return {
    id: record.id,
    state: "verified",
    manifest: record.manifest,
    issues: [],
  };
}

export function validatePluginProvides(
  manifest: PluginManifest,
  provides: PluginProvides,
): readonly PluginHostValidationIssue[] {
  const issues: PluginHostValidationIssue[] = [];

  for (const capability of supportedCapabilities) {
    const isDeclared = manifest.capabilities.includes(capability);
    const isRegistered = provides[capability] !== undefined;

    if (isDeclared && !isRegistered) {
      issues.push({
        field: "capabilities",
        message: `Declared capability was not registered: ${capability}.`,
      });
    }

    if (!isDeclared && isRegistered) {
      issues.push({
        field: "capabilities",
        message: `Registered capability was not declared: ${capability}.`,
      });
    }

    if (isRegistered && !isValidCapabilityRegistration(capability, provides[capability])) {
      issues.push({
        field: "capabilities",
        message: `Registered capability is invalid: ${capability}.`,
      });
    }
  }

  return issues;
}

function hasFunction(value: Record<string, unknown>, field: string): boolean {
  return typeof value[field] === "function";
}

function isValidCapabilityRegistration(capability: PluginCapability, value: unknown): boolean {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.name)) {
    return false;
  }

  if (capability === "syncProvider") {
    return (
      hasFunction(value, "upload") &&
      hasFunction(value, "download") &&
      hasFunction(value, "list") &&
      hasFunction(value, "delete") &&
      hasFunction(value, "isAvailable")
    );
  }

  return hasFunction(value, "isAvailable") && hasFunction(value, "generate");
}

function assertPermission(manifest: PluginManifest, permission: PluginPermission): void {
  if (!manifest.permissions.includes(permission)) {
    throw new PluginPermissionError(permission);
  }
}

export function createPermissionedPluginHostServices(
  manifest: PluginManifest,
  services: PluginHostServices,
): PluginHostServices {
  return {
    settings: {
      get: async (key) => {
        assertPermission(manifest, "settings:read");
        return services.settings.get(key);
      },
      set: async (key, value) => {
        assertPermission(manifest, "settings:write");
        return services.settings.set(key, value);
      },
      delete: async (key) => {
        assertPermission(manifest, "settings:write");
        return services.settings.delete(key);
      },
    },
    secrets: {
      get: async (key) => {
        assertPermission(manifest, "secrets:read");
        return services.secrets.get(key);
      },
      set: async (key, value) => {
        assertPermission(manifest, "secrets:write");
        return services.secrets.set(key, value);
      },
      delete: async (key) => {
        assertPermission(manifest, "secrets:write");
        return services.secrets.delete(key);
      },
    },
    network: {
      request: async (request) => {
        assertPermission(manifest, "network");
        return services.network.request(request);
      },
    },
    workspace: {
      read: async (path) => {
        assertPermission(manifest, "workspace:read");
        return services.workspace.read(path);
      },
      write: async (path, data) => {
        assertPermission(manifest, "workspace:write");
        return services.workspace.write(path, data);
      },
      list: async (prefix) => {
        assertPermission(manifest, "workspace:read");
        return services.workspace.list(prefix);
      },
      delete: async (path) => {
        assertPermission(manifest, "workspace:write");
        return services.workspace.delete(path);
      },
    },
  };
}

function toErrorRecord(
  record: PluginHostRecord,
  errorMessage: string,
  issues: readonly PluginHostValidationIssue[] = [],
): PluginHostRecord & { state: "error" } {
  return {
    id: record.id,
    state: "error",
    manifest: record.manifest,
    errorMessage,
    issues,
  };
}

export async function activatePluginHostRecord(
  record: PluginHostRecord,
  plugin: GrovePlugin,
  services: PluginHostServices,
): Promise<PluginHostActivationResult> {
  if (record.state !== "enabled" || record.manifest === undefined) {
    return {
      ok: false,
      record: toErrorRecord(record, "Plugin must be enabled before activation."),
    };
  }

  if (plugin.id !== record.manifest.id) {
    return {
      ok: false,
      record: toErrorRecord(record, "Plugin id does not match manifest id."),
    };
  }

  try {
    const provides = await plugin.activate({
      manifest: record.manifest,
      services: createPermissionedPluginHostServices(record.manifest, services),
    });
    const issues = validatePluginProvides(record.manifest, provides);

    if (issues.length > 0) {
      return {
        ok: false,
        record: toErrorRecord(record, "Plugin registrations do not match manifest.", issues),
      };
    }

    return {
      ok: true,
      record: {
        id: record.id,
        state: "active",
        manifest: record.manifest,
        provides,
        issues: [],
      },
    };
  } catch (error) {
    return {
      ok: false,
      record: toErrorRecord(
        record,
        error instanceof Error ? error.message : "Plugin activation failed.",
      ),
    };
  }
}
