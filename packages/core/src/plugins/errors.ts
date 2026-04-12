export const pluginErrorCodes = [
  "PLUGIN_MANIFEST_INVALID",
  "PLUGIN_API_VERSION_UNSUPPORTED",
  "PLUGIN_PERMISSION_DENIED",
  "PLUGIN_ACTIVATION_FAILED",
  "PLUGIN_REGISTRATION_INVALID",
  "PLUGIN_RUNTIME_ERROR",
] as const

export type PluginErrorCode = (typeof pluginErrorCodes)[number]

export class PluginHostError extends Error {
  readonly code: PluginErrorCode
  readonly details?: unknown

  constructor(code: PluginErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = "PluginHostError"
    this.code = code
    this.details = details
  }
}
