import { PluginHostError } from "./errors.js"
import { createHostServices } from "./host-services.js"
import { validatePluginManifest, type ManifestValidationIssue } from "./manifest.js"
import type {
  GrovePluginModule,
  Permission,
  Platform,
  PluginContext,
  PluginLifecycleState,
  PluginManifest,
  PluginRegistration,
  PluginSettingsField,
  PluginSettingsDefinition,
  SyncProvider,
  AiProvider,
} from "./types.js"

type ModuleNamespace = {
  default?: unknown
}

type PluginLoadOptions = {
  manifestJson: unknown
  packageRoot?: string
  grantedPermissions: Permission[]
  packageIntegrityVerified: boolean
  enableOnInstall?: boolean
}

type ActivatePluginOptions = {
  module: unknown
}

export type PluginTransition = {
  state: PluginLifecycleState
  reason?: string
}

export type ManagedPlugin = {
  manifest: PluginManifest
  state: PluginLifecycleState
  grantedPermissions: Permission[]
  warnings: ManifestValidationIssue[]
  registration?: PluginRegistration
  lastError?: PluginHostError
  transitions: PluginTransition[]
}

export type PluginHostOptions = {
  appVersion: string
  platform: Platform
  strictManifestValidation?: boolean
}

export class PluginHost {
  private readonly appVersion: string
  private readonly platform: Platform
  private readonly strictManifestValidation: boolean
  private readonly plugins = new Map<string, ManagedPlugin>()
  private readonly settingsStore = new Map<string, Map<string, unknown>>()
  private readonly secretStore = new Map<string, Map<string, string>>()

  constructor(options: PluginHostOptions) {
    this.appVersion = options.appVersion
    this.platform = options.platform
    this.strictManifestValidation = options.strictManifestValidation ?? false
  }

  discoverPlugin(options: PluginLoadOptions): ManagedPlugin {
    const validationOptions: {
      strict: boolean
      currentAppVersion: string
      currentPlatform: Platform
      packageRoot?: string
    } = {
      strict: this.strictManifestValidation,
      currentAppVersion: this.appVersion,
      currentPlatform: this.platform,
    }

    if (options.packageRoot !== undefined) {
      validationOptions.packageRoot = options.packageRoot
    }

    const { manifest, warnings } = validatePluginManifest(
      options.manifestJson,
      validationOptions,
    )

    if (this.plugins.has(manifest.id)) {
      throw new PluginHostError(
        "PLUGIN_MANIFEST_INVALID",
        `Duplicate plugin id "${manifest.id}" is not allowed.`,
      )
    }

    const plugin: ManagedPlugin = {
      manifest,
      state: "discovered",
      grantedPermissions: [...options.grantedPermissions],
      warnings,
      transitions: [{ state: "discovered" }],
    }

    this.plugins.set(manifest.id, plugin)
    this.transition(plugin, "installed")

    if (!options.packageIntegrityVerified) {
      return this.fail(plugin, "PLUGIN_MANIFEST_INVALID", "Package integrity verification failed.")
    }

    this.transition(plugin, "verified")
    this.ensureGrantedPermissionsAreDeclared(plugin)
    this.transition(plugin, options.enableOnInstall ?? true ? "enabled" : "disabled")
    return plugin
  }

  async activatePlugin(
    pluginId: string,
    options: ActivatePluginOptions,
  ): Promise<ManagedPlugin> {
    const plugin = this.getPlugin(pluginId)
    if (plugin.state !== "enabled") {
      throw new PluginHostError(
        "PLUGIN_ACTIVATION_FAILED",
        `Plugin "${pluginId}" must be enabled before activation.`,
      )
    }

    let pluginModule: GrovePluginModule
    try {
      pluginModule = resolvePluginModule(options.module)
    } catch (error) {
      return this.handleActivationFailure(plugin, error)
    }

    const services = createHostServices({
      manifest: plugin.manifest,
      platform: this.platform,
      grantedPermissions: plugin.grantedPermissions,
      settingsStore: this.settingsStore,
      secretStore: this.secretStore,
    })
    const context: PluginContext = {
      manifest: plugin.manifest,
      platform: this.platform,
      ...services,
    }

    try {
      const registration = await pluginModule.activate(context)
      validatePluginRegistration(plugin.manifest, plugin.grantedPermissions, registration)
      plugin.registration = registration
      this.transition(plugin, "active")
      return plugin
    } catch (error) {
      return this.handleActivationFailure(plugin, error)
    }
  }

  async deactivatePlugin(pluginId: string, module?: unknown): Promise<ManagedPlugin> {
    const plugin = this.getPlugin(pluginId)
    if (plugin.state !== "active") {
      return plugin
    }

    const resolvedModule = module !== undefined ? resolvePluginModule(module) : undefined
    if (resolvedModule?.deactivate !== undefined) {
      await resolvedModule.deactivate()
    }

    delete plugin.registration
    this.transition(plugin, "enabled")
    return plugin
  }

  listPlugins(): ManagedPlugin[] {
    return [...this.plugins.values()]
  }

  private ensureGrantedPermissionsAreDeclared(plugin: ManagedPlugin): void {
    const declared = new Set(plugin.manifest.permissions)
    const undeclaredPermissions = plugin.grantedPermissions.filter(
      (permission) => !declared.has(permission),
    )
    if (undeclaredPermissions.length > 0) {
      throw new PluginHostError(
        "PLUGIN_PERMISSION_DENIED",
        `Host granted undeclared permissions: ${undeclaredPermissions.join(", ")}.`,
      )
    }
  }

  private getPlugin(pluginId: string): ManagedPlugin {
    const plugin = this.plugins.get(pluginId)
    if (plugin === undefined) {
      throw new PluginHostError(
        "PLUGIN_RUNTIME_ERROR",
        `Unknown plugin "${pluginId}".`,
      )
    }
    return plugin
  }

  private transition(
    plugin: ManagedPlugin,
    state: PluginLifecycleState,
    reason?: string,
  ): void {
    plugin.state = state
    plugin.transitions.push(
      reason === undefined ? { state } : { state, reason },
    )
  }

  private fail(
    plugin: ManagedPlugin,
    code: "PLUGIN_MANIFEST_INVALID" | "PLUGIN_ACTIVATION_FAILED" | "PLUGIN_REGISTRATION_INVALID",
    message: string,
    details?: unknown,
  ): ManagedPlugin {
    plugin.lastError = new PluginHostError(code, message, details)
    this.transition(plugin, "error", message)
    return plugin
  }

  private handleActivationFailure(
    plugin: ManagedPlugin,
    error: unknown,
  ): ManagedPlugin {
    if (error instanceof PluginHostError) {
      const code =
        error.code === "PLUGIN_REGISTRATION_INVALID"
          ? "PLUGIN_REGISTRATION_INVALID"
          : "PLUGIN_ACTIVATION_FAILED"
      return this.fail(plugin, code, error.message, error.details)
    }

    return this.fail(
      plugin,
      "PLUGIN_ACTIVATION_FAILED",
      "Plugin activation failed.",
      error,
    )
  }
}

export function resolvePluginModule(moduleNamespace: unknown): GrovePluginModule {
  const candidate = asModuleNamespace(moduleNamespace).default
  if (candidate === undefined || typeof candidate !== "object" || candidate === null) {
    throw new PluginHostError(
      "PLUGIN_ACTIVATION_FAILED",
      "Plugin module must provide a default export.",
    )
  }

  const activate = Reflect.get(candidate, "activate")
  const deactivate = Reflect.get(candidate, "deactivate")
  if (typeof activate !== "function") {
    throw new PluginHostError(
      "PLUGIN_ACTIVATION_FAILED",
      "Plugin module default export must define activate().",
    )
  }

  if (deactivate !== undefined && typeof deactivate !== "function") {
    throw new PluginHostError(
      "PLUGIN_ACTIVATION_FAILED",
      "Plugin module deactivate must be a function when present.",
    )
  }

  return candidate as GrovePluginModule
}

export function validatePluginRegistration(
  manifest: PluginManifest,
  grantedPermissions: readonly Permission[],
  registration: PluginRegistration,
): void {
  if (typeof registration !== "object" || registration === null) {
    throw new PluginHostError(
      "PLUGIN_REGISTRATION_INVALID",
      "Plugin registration must be an object.",
    )
  }

  if (registration.syncProvider !== undefined) {
    requireCapability(manifest, "sync")
    requirePermission(grantedPermissions, "sync.provider")
    validateSyncProvider(registration.syncProvider)
  }

  if (registration.aiProvider !== undefined) {
    requireCapability(manifest, "ai")
    requirePermission(grantedPermissions, "ai.provider")
    validateAiProvider(registration.aiProvider)
  }

  if (registration.settings !== undefined) {
    validateSettingsDefinition(registration.settings)
  }
}

function validateSyncProvider(provider: SyncProvider): void {
  const requiredMethods = [
    "isAvailable",
    "getAuthStatus",
    "list",
    "upload",
    "download",
    "delete",
  ] as const
  validateProviderLike(provider, requiredMethods, "syncProvider")
}

function validateAiProvider(provider: AiProvider): void {
  const requiredMethods = ["isAvailable", "complete"] as const
  validateProviderLike(provider, requiredMethods, "aiProvider")
}

function validateProviderLike(
  provider: object,
  requiredMethods: readonly string[],
  providerName: string,
): void {
  const id = Reflect.get(provider, "id")
  const name = Reflect.get(provider, "name")
  if (typeof id !== "string" || typeof name !== "string") {
    throw new PluginHostError(
      "PLUGIN_REGISTRATION_INVALID",
      `${providerName} must expose string id and name fields.`,
    )
  }

  for (const method of requiredMethods) {
    if (typeof Reflect.get(provider, method) !== "function") {
      throw new PluginHostError(
        "PLUGIN_REGISTRATION_INVALID",
        `${providerName} is missing method "${method}".`,
      )
    }
  }
}

function validateSettingsDefinition(definition: PluginSettingsDefinition): void {
  if (!Array.isArray(definition.sections)) {
    throw new PluginHostError(
      "PLUGIN_REGISTRATION_INVALID",
      "Plugin settings definition must provide a sections array.",
    )
  }

  const seenKeys = new Set<string>()
  for (const section of definition.sections) {
    if (typeof section.title !== "string" || section.title.length === 0) {
      throw new PluginHostError(
        "PLUGIN_REGISTRATION_INVALID",
        "Plugin settings sections must have a non-empty title.",
      )
    }

    if (!Array.isArray(section.fields)) {
      throw new PluginHostError(
        "PLUGIN_REGISTRATION_INVALID",
        `Plugin settings section "${section.title}" must provide a fields array.`,
      )
    }

    for (const field of section.fields) {
      validateSettingsField(field, section.title)
      if (seenKeys.has(field.key)) {
        throw new PluginHostError(
          "PLUGIN_REGISTRATION_INVALID",
          `Duplicate settings key "${field.key}" is not allowed.`,
        )
      }
      seenKeys.add(field.key)
    }
  }
}

function validateSettingsField(
  field: PluginSettingsField,
  sectionTitle: string,
): void {
  const fieldKey = "key" in field && typeof field.key === "string" ? field.key : ""

  if (fieldKey.length === 0) {
    throw new PluginHostError(
      "PLUGIN_REGISTRATION_INVALID",
      `Plugin settings field in section "${sectionTitle}" must have a non-empty key.`,
    )
  }

  if (typeof field.label !== "string" || field.label.length === 0) {
    throw new PluginHostError(
      "PLUGIN_REGISTRATION_INVALID",
      `Plugin settings field "${fieldKey}" must have a non-empty label.`,
    )
  }

  if (field.type === "text") {
    if (
      field.placeholder !== undefined &&
      typeof field.placeholder !== "string"
    ) {
      throw new PluginHostError(
        "PLUGIN_REGISTRATION_INVALID",
        `Plugin settings text field "${fieldKey}" must use a string placeholder when present.`,
      )
    }

    if (field.secret !== undefined && typeof field.secret !== "boolean") {
      throw new PluginHostError(
        "PLUGIN_REGISTRATION_INVALID",
        `Plugin settings text field "${fieldKey}" must use a boolean secret flag when present.`,
      )
    }
    return
  }

  if (field.type === "select") {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      throw new PluginHostError(
        "PLUGIN_REGISTRATION_INVALID",
        `Plugin settings select field "${fieldKey}" must provide at least one option.`,
      )
    }

    const seenOptions = new Set<string>()
    for (const option of field.options) {
      if (typeof option !== "string" || option.length === 0) {
        throw new PluginHostError(
          "PLUGIN_REGISTRATION_INVALID",
          `Plugin settings select field "${fieldKey}" must use non-empty string options.`,
        )
      }

      if (seenOptions.has(option)) {
        throw new PluginHostError(
          "PLUGIN_REGISTRATION_INVALID",
          `Plugin settings select field "${fieldKey}" has duplicate option "${option}".`,
        )
      }
      seenOptions.add(option)
    }
    return
  }

  if (field.type === "boolean") {
    return
  }

  const unsupportedType = String((field as { type?: unknown }).type)
  throw new PluginHostError(
    "PLUGIN_REGISTRATION_INVALID",
    `Plugin settings field "${fieldKey}" has unsupported type "${unsupportedType}".`,
  )
}

function requireCapability(
  manifest: PluginManifest,
  capability: "sync" | "ai",
): void {
  if (!manifest.capabilities.includes(capability)) {
    throw new PluginHostError(
      "PLUGIN_REGISTRATION_INVALID",
      `Plugin registered "${capability}" without declaring the capability.`,
    )
  }
}

function requirePermission(
  grantedPermissions: readonly Permission[],
  permission: Permission,
): void {
  if (!grantedPermissions.includes(permission)) {
    throw new PluginHostError(
      "PLUGIN_REGISTRATION_INVALID",
      `Plugin registered a feature that requires permission "${permission}".`,
    )
  }
}

function asModuleNamespace(value: unknown): ModuleNamespace {
  if (typeof value === "object" && value !== null) {
    return value as ModuleNamespace
  }

  throw new PluginHostError(
    "PLUGIN_ACTIVATION_FAILED",
    "Plugin module namespace must be an object.",
  )
}
