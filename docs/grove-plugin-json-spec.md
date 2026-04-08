# `grove-plugin.json` Specification

## Status

- Version: `1.0.0-draft`
- Applies to Plugin API version: `1`

This document defines the required manifest file for every Grove plugin package.

---

## File Location

Each plugin package must contain a UTF-8 JSON file named `grove-plugin.json` at the package root.

Example:

```text
plugins/sync-r2/
  grove-plugin.json
  dist/index.js
```

---

## Required Shape

```json
{
  "id": "grove.sync.r2",
  "name": "Cloudflare R2",
  "version": "0.1.0",
  "apiVersion": "1",
  "entry": "dist/index.js",
  "platforms": ["desktop", "mobile"],
  "capabilities": ["sync"],
  "permissions": [
    "network.outbound",
    "storage.secret.read",
    "storage.secret.write",
    "sync.provider"
  ]
}
```

---

## Schema

```ts
type GrovePluginManifestJson = {
  id: string
  name: string
  version: string
  apiVersion: "1"
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
  capabilities: Array<"sync" | "ai">
  permissions: Array<
    | "network.outbound"
    | "storage.secret.read"
    | "storage.secret.write"
    | "settings.read"
    | "settings.write"
    | "sync.provider"
    | "ai.provider"
  >
  minAppVersion?: string
}
```

---

## Field Definitions

### `id`

- Required
- Type: string
- Format: reverse-DNS style recommended
- Pattern: `^[a-z0-9]+(\\.[a-z0-9-]+)+$`
- Must be globally unique within the app
- Must be stable across plugin updates

Examples:

- `grove.sync.r2`
- `dev.shuno.ai.claude`

### `name`

- Required
- Type: string
- Minimum length: 1
- Maximum length: 80
- User-facing display name

### `version`

- Required
- Type: string
- Must be valid semantic version
- Describes the plugin package version, not the app version

### `apiVersion`

- Required
- Type: string literal
- Allowed value in this spec: `"1"`

### `entry`

- Required
- Type: string
- Relative path from the manifest directory to the compiled JavaScript entry file
- Must not be absolute
- Must not escape the package root via `..`

Examples:

- `dist/index.js`
- `build/main.js`

### `description`

- Optional
- Type: string
- Short plugin summary for plugin management UI

### `author`

- Optional
- Type: object

Shape:

```json
{
  "name": "Example Author",
  "url": "https://example.com"
}
```

Rules:

- `name` is required when `author` is present
- `url` must be a valid absolute `https` URL if present

### `homepage`

- Optional
- Type: string
- Must be a valid absolute `https` URL

### `repository`

- Optional
- Type: string
- Must be a valid absolute `https` URL

### `license`

- Optional
- Type: string
- SPDX identifier recommended

### `keywords`

- Optional
- Type: string array
- Used for search and store categorization
- Duplicate entries are invalid

### `platforms`

- Required
- Type: array
- Allowed values: `"desktop"`, `"mobile"`
- Must contain at least one entry
- Duplicate entries are invalid

Rules:

- The host must refuse activation on unsupported platforms

### `capabilities`

- Required
- Type: array
- Allowed values: `"sync"`, `"ai"`
- Must contain at least one entry
- Duplicate entries are invalid

Rules:

- Returned registrations from `activate()` must be a subset of declared capabilities
- Declaring a capability does not imply any permission
- Settings UI is not a capability in API v1; any plugin may return a settings schema from `activate()`

### `permissions`

- Required
- Type: array
- May be empty only if the plugin requires no privileged APIs
- Duplicate entries are invalid

Allowed values:

- `network.outbound`
- `storage.secret.read`
- `storage.secret.write`
- `settings.read`
- `settings.write`
- `sync.provider`
- `ai.provider`

Rules:

- The host must prompt the user before granting requested permissions
- Newly requested permissions in an update require re-consent
- Declaring `sync.provider` without capability `sync` is invalid
- Declaring `ai.provider` without capability `ai` is invalid

### `minAppVersion`

- Optional
- Type: string
- Must be valid semantic version
- Host must reject installation when the current app version is lower

---

## Validation Matrix

The host must reject manifests in these cases:

- Missing required field
- Unknown top-level field, if the host is running in strict validation mode
- Unknown capability or permission
- Invalid semver in `version` or `minAppVersion`
- Invalid `entry` path
- Empty `platforms` or `capabilities`
- Duplicate values in `platforms`, `capabilities`, `permissions`, or `keywords`
- `sync.provider` without `sync`
- `ai.provider` without `ai`

The host may warn but still accept manifests in these cases:

- Missing `description`
- Missing `author`
- Missing `homepage`

---

## Installation Rules

During installation the host must:

1. Read `grove-plugin.json`
2. Validate the manifest
3. Resolve and validate the `entry` file
4. Compare `apiVersion` against supported host versions
5. Check `minAppVersion` if present
6. Store permission grant state separately from the manifest

The manifest itself must be treated as immutable package metadata and must not be rewritten by the host to record user consent.

---

## Update Rules

When updating a plugin, the host must:

1. Ensure the `id` matches the installed plugin
2. Compare the old and new `permissions`
3. Require re-consent if permissions expanded
4. Re-validate `entry`, `platforms`, `capabilities`, and `apiVersion`

The host should preserve plugin settings and secrets across updates unless the user explicitly uninstalls the plugin.

---

## Example Manifests

### Sync Plugin

```json
{
  "id": "grove.sync.r2",
  "name": "Cloudflare R2",
  "version": "0.1.0",
  "apiVersion": "1",
  "entry": "dist/index.js",
  "description": "Encrypted object storage sync using Cloudflare R2.",
  "platforms": ["desktop", "mobile"],
  "capabilities": ["sync"],
  "permissions": [
    "network.outbound",
    "storage.secret.read",
    "storage.secret.write",
    "settings.read",
    "settings.write",
    "sync.provider"
  ],
  "minAppVersion": "0.1.0"
}
```

### AI Plugin

```json
{
  "id": "grove.ai.claude",
  "name": "Claude",
  "version": "0.1.0",
  "apiVersion": "1",
  "entry": "dist/index.js",
  "platforms": ["desktop"],
  "capabilities": ["ai"],
  "permissions": [
    "network.outbound",
    "storage.secret.read",
    "storage.secret.write",
    "settings.read",
    "settings.write",
    "ai.provider"
  ]
}
```

---

## JSON Schema Mapping Notes

If this manifest is later expressed as JSON Schema:

- Set `additionalProperties` according to host strictness policy
- Validate `version` and `minAppVersion` with semver-aware logic outside plain JSON Schema when necessary
- Validate `entry` path normalization outside plain JSON Schema

---

## Security Notes

- `grove-plugin.json` only declares intent; it does not grant permissions by itself
- Host-enforced permissions remain authoritative even if the manifest requests more
- Secrets and consent state must not be stored back into the manifest
