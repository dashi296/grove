import path from "node:path"

import { PluginHostError } from "./errors.js"
import {
  capabilityValues,
  permissionValues,
  platformValues,
  pluginApiVersion,
  type Capability,
  type Permission,
  type Platform,
  type PluginManifest,
} from "./types.js"

type ValidationSeverity = "error" | "warning"

export type ManifestValidationIssue = {
  path: string
  message: string
  severity: ValidationSeverity
}

export type ValidatePluginManifestOptions = {
  strict?: boolean
  packageRoot?: string
  currentAppVersion?: string
  currentPlatform?: Platform
}

export type ValidatePluginManifestResult = {
  manifest: PluginManifest
  warnings: ManifestValidationIssue[]
}

const manifestKeys = new Set([
  "id",
  "name",
  "version",
  "apiVersion",
  "entry",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "platforms",
  "capabilities",
  "permissions",
  "minAppVersion",
])

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/
const pluginIdPattern = /^[a-z0-9]+(\.[a-z0-9-]+)+$/

export function validatePluginManifest(
  input: unknown,
  options: ValidatePluginManifestOptions = {},
): ValidatePluginManifestResult {
  const issues: ManifestValidationIssue[] = []
  const manifestObject = asRecord(input, "manifest", issues)
  const strict = options.strict ?? false

  if (strict) {
    for (const key of Object.keys(manifestObject)) {
      if (!manifestKeys.has(key)) {
        issues.push({
          path: key,
          message: `Unknown top-level field "${key}".`,
          severity: "error",
        })
      }
    }
  }

  const id = readString(manifestObject, "id", issues, {
    pattern: pluginIdPattern,
    minLength: 1,
  })
  const name = readString(manifestObject, "name", issues, {
    minLength: 1,
    maxLength: 80,
  })
  const version = readSemver(manifestObject, "version", issues)
  const apiVersion = readString(manifestObject, "apiVersion", issues)
  const entry = readEntry(manifestObject.entry, issues, options.packageRoot)
  const description = readOptionalString(manifestObject, "description", issues)
  const author = readAuthor(manifestObject.author, issues)
  const homepage = readHttpsUrl(manifestObject, "homepage", issues)
  const repository = readHttpsUrl(manifestObject, "repository", issues)
  const license = readOptionalString(manifestObject, "license", issues)
  const keywords = readOptionalUniqueStringArray(
    manifestObject,
    "keywords",
    issues,
  )
  const platforms = readEnumArray(
    manifestObject,
    "platforms",
    platformValues,
    issues,
  )
  const capabilities = readEnumArray(
    manifestObject,
    "capabilities",
    capabilityValues,
    issues,
  )
  const permissions = readEnumArray(
    manifestObject,
    "permissions",
    permissionValues,
    issues,
    true,
  )
  const minAppVersion = readOptionalSemver(
    manifestObject,
    "minAppVersion",
    issues,
  )

  if (apiVersion !== pluginApiVersion) {
    issues.push({
      path: "apiVersion",
      message: `Unsupported apiVersion "${apiVersion}". Expected "${pluginApiVersion}".`,
      severity: "error",
    })
  }

  if (
    permissions.includes("sync.provider") &&
    !capabilities.includes("sync")
  ) {
    issues.push({
      path: "permissions",
      message: 'Permission "sync.provider" requires capability "sync".',
      severity: "error",
    })
  }

  if (permissions.includes("ai.provider") && !capabilities.includes("ai")) {
    issues.push({
      path: "permissions",
      message: 'Permission "ai.provider" requires capability "ai".',
      severity: "error",
    })
  }

  if (
    options.currentPlatform !== undefined &&
    !platforms.includes(options.currentPlatform)
  ) {
    issues.push({
      path: "platforms",
      message: `Plugin does not support platform "${options.currentPlatform}".`,
      severity: "error",
    })
  }

  if (
    minAppVersion !== undefined &&
    options.currentAppVersion !== undefined &&
    compareSemver(options.currentAppVersion, minAppVersion) < 0
  ) {
    issues.push({
      path: "minAppVersion",
      message: `Plugin requires app version ${minAppVersion} or newer.`,
      severity: "error",
    })
  }

  if (description === undefined) {
    issues.push({
      path: "description",
      message: "Description is recommended.",
      severity: "warning",
    })
  }

  if (author === undefined) {
    issues.push({
      path: "author",
      message: "Author is recommended.",
      severity: "warning",
    })
  }

  if (homepage === undefined) {
    issues.push({
      path: "homepage",
      message: "Homepage is recommended.",
      severity: "warning",
    })
  }

  const errors = issues.filter((issue) => issue.severity === "error")
  if (errors.length > 0) {
    throw new PluginHostError(
      "PLUGIN_MANIFEST_INVALID",
      "Plugin manifest validation failed.",
      issues,
    )
  }

  const manifest: PluginManifest = {
    id,
    name,
    version,
    apiVersion: pluginApiVersion,
    entry,
    platforms,
    capabilities,
    permissions,
  }

  if (description !== undefined) {
    manifest.description = description
  }
  if (author !== undefined) {
    manifest.author = author
  }
  if (homepage !== undefined) {
    manifest.homepage = homepage
  }
  if (repository !== undefined) {
    manifest.repository = repository
  }
  if (license !== undefined) {
    manifest.license = license
  }
  if (keywords !== undefined) {
    manifest.keywords = keywords
  }
  if (minAppVersion !== undefined) {
    manifest.minAppVersion = minAppVersion
  }

  return {
    manifest,
    warnings: issues.filter((issue) => issue.severity === "warning"),
  }
}

export function compareSemver(left: string, right: string): number {
  const leftParts = parseSemver(left)
  const rightParts = parseSemver(right)
  const pairs: Array<[number, number]> = [
    [leftParts.major, rightParts.major],
    [leftParts.minor, rightParts.minor],
    [leftParts.patch, rightParts.patch],
  ]
  for (const [leftValue, rightValue] of pairs) {
    if (leftValue > rightValue) {
      return 1
    }
    if (leftValue < rightValue) {
      return -1
    }
  }

  return comparePrerelease(leftParts.prerelease, rightParts.prerelease)
}

type ParsedSemver = {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

function parseSemver(value: string): ParsedSemver {
  if (!semverPattern.test(value)) {
    throw new PluginHostError(
      "PLUGIN_MANIFEST_INVALID",
      `Invalid semantic version "${value}".`,
    )
  }

  const [versionWithCore = value, buildMetadata = ""] = value.split("+", 2)
  const [versionCore = versionWithCore, prerelease = ""] = versionWithCore.split("-", 2)
  const parts = versionCore.split(".")
  if (parts.length !== 3) {
    throw new PluginHostError(
      "PLUGIN_MANIFEST_INVALID",
      `Invalid semantic version "${value}".`,
    )
  }
  const major = Number(parts[0])
  const minor = Number(parts[1])
  const patch = Number(parts[2])
  return {
    major,
    minor,
    patch,
    prerelease: buildMetadata.length > 0 || prerelease.length > 0
      ? prerelease.split(".").filter((segment) => segment.length > 0)
      : [],
  }
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) {
    return 0
  }

  if (left.length === 0) {
    return 1
  }

  if (right.length === 0) {
    return -1
  }

  const maxLength = Math.max(left.length, right.length)
  for (let index = 0; index < maxLength; index += 1) {
    const leftIdentifier = left[index]
    const rightIdentifier = right[index]

    if (leftIdentifier === undefined) {
      return -1
    }

    if (rightIdentifier === undefined) {
      return 1
    }

    const compared = comparePrereleaseIdentifier(
      leftIdentifier,
      rightIdentifier,
    )
    if (compared !== 0) {
      return compared
    }
  }

  return 0
}

function comparePrereleaseIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left)
  const rightNumeric = /^\d+$/.test(right)

  if (leftNumeric && rightNumeric) {
    const leftValue = Number(left)
    const rightValue = Number(right)
    if (leftValue > rightValue) {
      return 1
    }
    if (leftValue < rightValue) {
      return -1
    }
    return 0
  }

  if (leftNumeric) {
    return -1
  }

  if (rightNumeric) {
    return 1
  }

  if (left > right) {
    return 1
  }

  if (left < right) {
    return -1
  }

  return 0
}

function asRecord(
  input: unknown,
  fieldPath: string,
  issues: ManifestValidationIssue[],
): Record<string, unknown> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>
  }

  issues.push({
    path: fieldPath,
    message: "Expected an object.",
    severity: "error",
  })
  return {}
}

function readString(
  record: Record<string, unknown>,
  key: string,
  issues: ManifestValidationIssue[],
  options: {
    minLength?: number
    maxLength?: number
    pattern?: RegExp
  } = {},
): string {
  const value = record[key]
  if (typeof value !== "string") {
    issues.push({
      path: key,
      message: "Expected a string.",
      severity: "error",
    })
    return ""
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    issues.push({
      path: key,
      message: `Must be at least ${options.minLength} characters long.`,
      severity: "error",
    })
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    issues.push({
      path: key,
      message: `Must be at most ${options.maxLength} characters long.`,
      severity: "error",
    })
  }

  if (options.pattern !== undefined && !options.pattern.test(value)) {
    issues.push({
      path: key,
      message: "Has an invalid format.",
      severity: "error",
    })
  }

  return value
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  issues: ManifestValidationIssue[],
): string | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  if (typeof value !== "string") {
    issues.push({
      path: key,
      message: "Expected a string.",
      severity: "error",
    })
    return undefined
  }
  return value
}

function readSemver(
  record: Record<string, unknown>,
  key: string,
  issues: ManifestValidationIssue[],
): string {
  const value = readString(record, key, issues)
  if (value !== "" && !semverPattern.test(value)) {
    issues.push({
      path: key,
      message: "Expected a valid semantic version.",
      severity: "error",
    })
  }
  return value
}

function readOptionalSemver(
  record: Record<string, unknown>,
  key: string,
  issues: ManifestValidationIssue[],
): string | undefined {
  const value = readOptionalString(record, key, issues)
  if (value !== undefined && !semverPattern.test(value)) {
    issues.push({
      path: key,
      message: "Expected a valid semantic version.",
      severity: "error",
    })
  }
  return value
}

function readHttpsUrl(
  record: Record<string, unknown>,
  key: string,
  issues: ManifestValidationIssue[],
): string | undefined {
  const value = readOptionalString(record, key, issues)
  if (value === undefined) {
    return undefined
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "https:") {
      issues.push({
        path: key,
        message: "Expected an absolute https URL.",
        severity: "error",
      })
    }
  } catch {
    issues.push({
      path: key,
      message: "Expected an absolute https URL.",
      severity: "error",
    })
  }

  return value
}

function readAuthor(
  input: unknown,
  issues: ManifestValidationIssue[],
): PluginManifest["author"] {
  if (input === undefined) {
    return undefined
  }

  const author = asRecord(input, "author", issues)
  const name = readString(author, "name", issues, { minLength: 1 })
  const url = readHttpsUrl(author, "url", issues)

  return url === undefined ? { name } : { name, url }
}

function readOptionalUniqueStringArray(
  record: Record<string, unknown>,
  key: string,
  issues: ManifestValidationIssue[],
): string[] | undefined {
  const value = record[key]
  if (value === undefined) {
    return undefined
  }
  return readStringArray(value, key, issues, false)
}

function readEnumArray<T extends string>(
  record: Record<string, unknown>,
  key: string,
  allowedValues: readonly T[],
  issues: ManifestValidationIssue[],
  allowEmpty = false,
): T[] {
  const values = readStringArray(record[key], key, issues, allowEmpty)
  const allowedSet = new Set(allowedValues)

  for (const value of values) {
    if (!allowedSet.has(value as T)) {
      issues.push({
        path: key,
        message: `Unknown value "${value}".`,
        severity: "error",
      })
    }
  }

  return values as T[]
}

function readStringArray(
  input: unknown,
  key: string,
  issues: ManifestValidationIssue[],
  allowEmpty: boolean,
): string[] {
  if (!Array.isArray(input)) {
    issues.push({
      path: key,
      message: "Expected an array.",
      severity: "error",
    })
    return []
  }

  if (!allowEmpty && input.length === 0) {
    issues.push({
      path: key,
      message: "Must contain at least one entry.",
      severity: "error",
    })
  }

  const values: string[] = []
  const seen = new Set<string>()
  for (const entry of input) {
    if (typeof entry !== "string") {
      issues.push({
        path: key,
        message: "Expected only string values.",
        severity: "error",
      })
      continue
    }
    if (seen.has(entry)) {
      issues.push({
        path: key,
        message: `Duplicate value "${entry}" is not allowed.`,
        severity: "error",
      })
      continue
    }
    seen.add(entry)
    values.push(entry)
  }

  return values
}

function readEntry(
  input: unknown,
  issues: ManifestValidationIssue[],
  packageRoot?: string,
): string {
  if (typeof input !== "string" || input.length === 0) {
    issues.push({
      path: "entry",
      message: "Expected a non-empty string.",
      severity: "error",
    })
    return ""
  }

  if (path.isAbsolute(input)) {
    issues.push({
      path: "entry",
      message: "Entry path must be relative.",
      severity: "error",
    })
    return input
  }

  const normalized = path.posix.normalize(input)
  if (normalized.startsWith("../") || normalized === "..") {
    issues.push({
      path: "entry",
      message: "Entry path must not escape the package root.",
      severity: "error",
    })
    return input
  }

  if (packageRoot !== undefined) {
    const resolved = path.resolve(packageRoot, input)
    const resolvedRoot = path.resolve(packageRoot)
    if (
      resolved !== resolvedRoot &&
      !resolved.startsWith(`${resolvedRoot}${path.sep}`)
    ) {
      issues.push({
        path: "entry",
        message: "Entry path must stay within the package root.",
        severity: "error",
      })
    }
  }

  return normalized
}
