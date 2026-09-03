import { z } from 'zod'
import { hasWriteScope, isWriteScopeToolName } from './scope'
import {
  projectGodModeCatalogTools,
  projectReadOnlyTools,
  projectCatalogMcpSuite,
  resolveCatalogMcpExecutions,
  type McpExecutionDescriptor,
  type McpExecutionResolver,
  type McpProjectionContext,
  toMcpInputSchema,
  type McpToolManifest
} from './project'
import {
  projectGenerationMcpSuite,
  projectGenerationTools,
  resolveGenerationMcpExecutions
} from './generationTools'
import {
  projectFinancialMcpSuite,
  projectFinancialTools,
  projectWriteMcpSuite,
  projectWriteTools,
  resolveFinancialMcpExecutions,
  resolveWriteMcpExecutions
} from './writeTools'
import {
  projectVideoMcpSuite,
  projectVideoReadTools,
  projectVideoTools,
  resolveVideoMcpExecutions
} from './videoTools'
import { projectBannerMcpSuite, projectBannerTools, resolveBannerMcpExecutions } from './bannerTools'
import { projectFeedMcpSuite, projectFeedTools, resolveFeedMcpExecutions } from './feedTools'
import { projectGtmMcpSuite, projectGtmTools, resolveGtmMcpExecutions } from './gtmTools'
import {
  projectGoogleAdsMcpSuite,
  resolveGoogleAdsMcpExecutions
} from './googleAdsRegistryTools'
import { projectGoogleAdsTools } from './googleAdsTools'

export interface RegisteredMcpSuite {
  key: string
  project: (context: McpProjectionContext) => McpToolManifest[]
  executions: McpExecutionResolver
  /** Lower-level exported projectors covered by this registered suite (contract-test inventory). */
  sourceProjectors?: readonly ((...args: any[]) => unknown)[]
}

/**
 * The sole authoritative MCP suite list. The base suite projects the injected AiTool registry, so a
 * newly registered AiTool needs no MCP allowlist edit. Supplemental, non-AiTool suites register once
 * here and God mode receives them automatically.
 */
const suiteDefinitions: RegisteredMcpSuite[] = [
  {
    key: 'catalog',
    project: projectCatalogMcpSuite,
    executions: resolveCatalogMcpExecutions,
    sourceProjectors: [projectReadOnlyTools, projectGodModeCatalogTools]
  },
  {
    key: 'generation',
    project: projectGenerationMcpSuite,
    executions: resolveGenerationMcpExecutions,
    sourceProjectors: [projectGenerationTools]
  },
  {
    key: 'writes',
    project: projectWriteMcpSuite,
    executions: resolveWriteMcpExecutions,
    sourceProjectors: [projectWriteTools]
  },
  {
    key: 'video-media',
    project: projectVideoMcpSuite,
    executions: resolveVideoMcpExecutions,
    sourceProjectors: [projectVideoReadTools, projectVideoTools]
  },
  {
    key: 'banners',
    project: projectBannerMcpSuite,
    executions: resolveBannerMcpExecutions,
    sourceProjectors: [projectBannerTools]
  },
  {
    key: 'inventory-feeds',
    project: projectFeedMcpSuite,
    executions: resolveFeedMcpExecutions,
    sourceProjectors: [projectFeedTools]
  },
  {
    key: 'finance',
    project: projectFinancialMcpSuite,
    executions: resolveFinancialMcpExecutions,
    sourceProjectors: [projectFinancialTools]
  },
  {
    key: 'google-tag-manager',
    project: projectGtmMcpSuite,
    executions: resolveGtmMcpExecutions,
    sourceProjectors: [projectGtmTools]
  },
  {
    key: 'google-ads',
    project: projectGoogleAdsMcpSuite,
    executions: resolveGoogleAdsMcpExecutions,
    sourceProjectors: [projectGoogleAdsTools]
  }
]

export const registeredMcpSuites: readonly RegisteredMcpSuite[] = Object.freeze(
  suiteDefinitions.map(suite => Object.freeze({
    ...suite,
    sourceProjectors: suite.sourceProjectors ? Object.freeze([...suite.sourceProjectors]) : undefined
  }))
)

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

function projectSuites(
  context: McpProjectionContext,
  suites: readonly RegisteredMcpSuite[]
): McpToolManifest[] {
  const suiteKeys = new Set<string>()
  const byName = new Map<string, { manifest: McpToolManifest, fingerprint: string, suiteKey: string }>()

  for (const suite of suites) {
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

function resolveOwnerCatalog(
  context: McpProjectionContext,
  suites: readonly RegisteredMcpSuite[]
): { manifests: McpToolManifest[], executions: McpExecutionDescriptor[] } {
  const ownerContext = { ...context, governanceBypass: true }
  const manifests = projectSuites(ownerContext, suites)
  const executionRows = new Map<string, Array<{ suiteKey: string, descriptor: McpExecutionDescriptor }>>()
  for (const suite of suites) {
    for (const descriptor of suite.executions(ownerContext)) {
      if (
        !descriptor
        || typeof descriptor.name !== 'string'
        || !descriptor.name.trim()
        || typeof descriptor.canonicalName !== 'string'
        || !descriptor.canonicalName.trim()
        || descriptor.tool?.name !== descriptor.name
        || (descriptor.kind !== 'catalog' && descriptor.kind !== 'supplemental')
      ) throw new Error(`Invalid MCP execution resolver in suite ${suite.key}`)
      if (
        descriptor.executionClass === 'local-transactional'
        && (descriptor.kind !== 'supplemental' || !descriptor.tool.mutates || typeof descriptor.executeMutation !== 'function')
      ) {
        throw new Error(`Local-transactional MCP resolver requires a transaction-aware executor: ${descriptor.name}`)
      }
      if (
        descriptor.kind === 'supplemental'
        && descriptor.tool.mutates
        && descriptor.executionClass !== 'local-transactional'
        && typeof descriptor.executeSupplemental !== 'function'
      ) {
        throw new Error(`Supplemental MCP mutation requires a trusted dispatch executor: ${descriptor.name}`)
      }
      const rows = executionRows.get(descriptor.name) ?? []
      rows.push({ suiteKey: suite.key, descriptor })
      executionRows.set(descriptor.name, rows)
    }
  }

  const manifestNames = new Set(manifests.map(manifest => manifest.name))
  for (const name of executionRows.keys()) {
    if (!manifestNames.has(name)) throw new Error(`MCP execution resolver has no projected manifest: ${name}`)
  }
  const executions = manifests.map(manifest => {
    const rows = executionRows.get(manifest.name) ?? []
    if (rows.length !== 1) {
      throw new Error(`Expected exactly one MCP execution resolver for ${manifest.name}; received ${rows.length}`)
    }
    const descriptor = rows[0]!.descriptor
    const descriptorSchema = toMcpInputSchema(descriptor.tool.parameters)
    if (JSON.stringify(sortedJsonValue(descriptorSchema)) !== JSON.stringify(sortedJsonValue(manifest.inputSchema))) {
      throw new Error(`MCP execution schema conflicts with projected manifest for ${manifest.name}`)
    }
    return descriptor
  })
  return { manifests, executions }
}

/** Existing governed projection: role, suite flags, and the signed OAuth scope continue to narrow. */
export function projectRegisteredMcpTools(
  context: McpProjectionContext,
  suites: readonly RegisteredMcpSuite[] = registeredMcpSuites
): McpToolManifest[] {
  const tools = projectSuites({ ...context, governanceBypass: false }, suites)
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
export function projectGodModeTools(
  context: McpProjectionContext,
  suites: readonly RegisteredMcpSuite[] = registeredMcpSuites
): McpToolManifest[] {
  return resolveOwnerCatalog(context, suites).manifests
}

export function resolveGodModeMcpExecutions(
  context: McpProjectionContext,
  suites: readonly RegisteredMcpSuite[] = registeredMcpSuites
): McpExecutionDescriptor[] {
  return resolveOwnerCatalog(context, suites).executions
}

export function resolveGodModeMcpExecution(
  context: McpProjectionContext,
  name: string,
  suites: readonly RegisteredMcpSuite[] = registeredMcpSuites
): McpExecutionDescriptor | null {
  return resolveGodModeMcpExecutions(context, suites).find(descriptor => descriptor.name === name) ?? null
}
