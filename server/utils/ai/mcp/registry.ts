import { z } from 'zod'
import { hasWriteScope, isWriteScopeToolName } from './scope'
import {
  projectGodModeCatalogTools,
  projectReadOnlyTools,
  projectCatalogMcpSuite,
  type McpProjectionContext,
  type McpToolManifest
} from './project'
import { projectGenerationMcpSuite, projectGenerationTools } from './generationTools'
import {
  projectFinancialMcpSuite,
  projectFinancialTools,
  projectWriteMcpSuite,
  projectWriteTools
} from './writeTools'
import { projectVideoMcpSuite, projectVideoReadTools, projectVideoTools } from './videoTools'
import { projectBannerMcpSuite, projectBannerTools } from './bannerTools'

export interface RegisteredMcpSuite {
  key: string
  project: (context: McpProjectionContext) => McpToolManifest[]
  /** Lower-level exported projectors covered by this registered suite (contract-test inventory). */
  sourceProjectors?: readonly ((...args: any[]) => unknown)[]
}

/**
 * The sole authoritative MCP suite list. The base suite projects the injected AiTool registry, so a
 * newly registered AiTool needs no MCP allowlist edit. Supplemental, non-AiTool suites register once
 * here and God mode receives them automatically.
 */
export const registeredMcpSuites: readonly RegisteredMcpSuite[] = [
  {
    key: 'catalog',
    project: projectCatalogMcpSuite,
    sourceProjectors: [projectReadOnlyTools, projectGodModeCatalogTools]
  },
  { key: 'generation', project: projectGenerationMcpSuite, sourceProjectors: [projectGenerationTools] },
  { key: 'writes', project: projectWriteMcpSuite, sourceProjectors: [projectWriteTools] },
  {
    key: 'video-media',
    project: projectVideoMcpSuite,
    sourceProjectors: [projectVideoReadTools, projectVideoTools]
  },
  { key: 'banners', project: projectBannerMcpSuite, sourceProjectors: [projectBannerTools] },
  { key: 'finance', project: projectFinancialMcpSuite, sourceProjectors: [projectFinancialTools] }
]

function sortedJsonValue(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('MCP input schema contains a non-finite number')
    return value
  }
  if (Array.isArray(value)) return value.map(item => sortedJsonValue(item, seen))
  if (!value || typeof value !== 'object') throw new Error('MCP input schema is not JSON-serializable')
  if (seen.has(value)) throw new Error('MCP input schema contains a cycle')

  seen.add(value)
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = sortedJsonValue((value as Record<string, unknown>)[key], seen)
  }
  seen.delete(value)
  return sorted
}

function validateManifest(suiteKey: string, manifest: McpToolManifest): void {
  if (!manifest || typeof manifest !== 'object') throw new Error(`Invalid MCP tool manifest in suite ${suiteKey}`)
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error(`Invalid MCP tool name in suite ${suiteKey}`)
  }
  if (typeof manifest.description !== 'string' || !manifest.description.trim()) {
    throw new Error(`Invalid MCP tool description for ${manifest.name}`)
  }
  if (!manifest.inputSchema || typeof manifest.inputSchema !== 'object' || Array.isArray(manifest.inputSchema)) {
    throw new Error(`Invalid JSON Schema for MCP tool ${manifest.name}`)
  }
  sortedJsonValue(manifest.inputSchema)
  try {
    z.fromJSONSchema(manifest.inputSchema as never)
  } catch {
    throw new Error(`Invalid JSON Schema for MCP tool ${manifest.name}`)
  }
}

function manifestFingerprint(manifest: McpToolManifest): string {
  return JSON.stringify(sortedJsonValue({
    description: manifest.description,
    inputSchema: manifest.inputSchema
  }))
}

function projectSuites(context: McpProjectionContext): McpToolManifest[] {
  const suiteKeys = new Set<string>()
  const byName = new Map<string, { manifest: McpToolManifest, fingerprint: string, suiteKey: string }>()

  for (const suite of registeredMcpSuites) {
    if (!suite.key.trim() || suiteKeys.has(suite.key)) {
      throw new Error(`Duplicate or invalid registered MCP suite key: ${suite.key}`)
    }
    suiteKeys.add(suite.key)

    for (const manifest of suite.project(context)) {
      validateManifest(suite.key, manifest)
      const fingerprint = manifestFingerprint(manifest)
      const existing = byName.get(manifest.name)
      if (!existing) {
        byName.set(manifest.name, { manifest, fingerprint, suiteKey: suite.key })
        continue
      }
      if (existing.fingerprint !== fingerprint) {
        throw new Error(
          `Conflicting MCP tool definition for ${manifest.name} in suites ${existing.suiteKey} and ${suite.key}`
        )
      }
    }
  }

  return [...byName.values()].map(entry => entry.manifest)
}

/** Existing governed projection: role, suite flags, and the signed OAuth scope continue to narrow. */
export function projectRegisteredMcpTools(context: McpProjectionContext): McpToolManifest[] {
  const tools = projectSuites({ ...context, governanceBypass: false })
  const signedScopes = new Set(context.scopes)
  return context.requireWriteScope && !hasWriteScope(signedScopes)
    ? tools.filter(tool => !isWriteScopeToolName(tool.name))
    : tools
}

/**
 * Complete owner union. Callers must first validate a runtime-branded current GodModeAuthority. This
 * deliberately bypasses application suite flags and OAuth read/write narrowing, but not route auth,
 * claim verification, tenancy, provider availability, schema validation, execution idempotency, or audit.
 */
export function projectGodModeTools(context: McpProjectionContext): McpToolManifest[] {
  return projectSuites({ ...context, governanceBypass: true })
}
