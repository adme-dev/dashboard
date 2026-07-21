import { queryRows as realQueryRows } from '~~/server/utils/db'
import { PERMISSION_GROUPS, type PermissionGroup } from '~~/server/utils/permissions'

export type CatalogSourceType = 'pack' | 'capability'
export type CatalogAccessMode = 'read' | 'draft' | 'propose'

export interface ActiveCatalogRow {
  sourceType: CatalogSourceType
  releaseId: string
  departmentId: string
  packVersionId: string | null
  packKey: string | null
  instructionsPreamble: string
  packModelFeatureKey: string | null
  packMaxInputTokens: number | null
  packMaxOutputTokens: number | null
  packMaxCostUsdMicros: number | null
  packMaxLatencyMs: number | null
  capabilityVersionId: string | null
  capabilityKey: string | null
  requiredPermissionGroup: PermissionGroup | null
  capabilityModelFeatureKey: string | null
  capabilityMaxInputTokens: number | null
  capabilityMaxOutputTokens: number | null
  capabilityMaxCostUsdMicros: number | null
  capabilityMaxLatencyMs: number | null
  toolName: string | null
  accessMode: CatalogAccessMode | null
}

export interface CatalogCompositionDb {
  queryRows: <T>(sql: string, params?: unknown[]) => Promise<T[]>
}

interface ActiveCatalogDbRow {
  source_type: string
  release_id: string
  department_id: string
  pack_version_id: string | null
  pack_key: string | null
  instructions_preamble: string | null
  pack_model_feature_key: string | null
  pack_max_input_tokens: number | string | null
  pack_max_output_tokens: number | string | null
  pack_max_cost_usd_micros: number | string | null
  pack_max_latency_ms: number | string | null
  capability_version_id: string | null
  capability_key: string | null
  required_permission_group: string | null
  capability_model_feature_key: string | null
  capability_max_input_tokens: number | string | null
  capability_max_output_tokens: number | string | null
  capability_max_cost_usd_micros: number | string | null
  capability_max_latency_ms: number | string | null
  tool_name: string | null
  access_mode: string | null
}

const defaultDb: CatalogCompositionDb = { queryRows: realQueryRows as CatalogCompositionDb['queryRows'] }
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERMISSION_GROUP_SET = new Set<string>(PERMISSION_GROUPS)
const ACCESS_MODE_SET = new Set<string>(['read', 'draft', 'propose'])

function boundedNumber(value: number | string | null): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function mapCatalogRow(row: ActiveCatalogDbRow): ActiveCatalogRow {
  return {
    sourceType: row.source_type === 'capability' ? 'capability' : 'pack',
    releaseId: row.release_id,
    departmentId: row.department_id,
    packVersionId: row.pack_version_id,
    packKey: row.pack_key,
    instructionsPreamble: row.instructions_preamble ?? '',
    packModelFeatureKey: row.pack_model_feature_key,
    packMaxInputTokens: boundedNumber(row.pack_max_input_tokens),
    packMaxOutputTokens: boundedNumber(row.pack_max_output_tokens),
    packMaxCostUsdMicros: boundedNumber(row.pack_max_cost_usd_micros),
    packMaxLatencyMs: boundedNumber(row.pack_max_latency_ms),
    capabilityVersionId: row.capability_version_id,
    capabilityKey: row.capability_key,
    requiredPermissionGroup: PERMISSION_GROUP_SET.has(row.required_permission_group ?? '')
      ? row.required_permission_group as PermissionGroup
      : null,
    capabilityModelFeatureKey: row.capability_model_feature_key,
    capabilityMaxInputTokens: boundedNumber(row.capability_max_input_tokens),
    capabilityMaxOutputTokens: boundedNumber(row.capability_max_output_tokens),
    capabilityMaxCostUsdMicros: boundedNumber(row.capability_max_cost_usd_micros),
    capabilityMaxLatencyMs: boundedNumber(row.capability_max_latency_ms),
    toolName: row.tool_name,
    accessMode: ACCESS_MODE_SET.has(row.access_mode ?? '') ? row.access_mode as CatalogAccessMode : null
  }
}

/**
 * Read only production-active catalog material for an already-authorized department scope.
 * The LEFT JOINs intentionally preserve active empty packs/capabilities so composition fails
 * closed to zero tools instead of mistaking an empty governed release for legacy mode.
 */
export async function loadActiveCatalogRows(
  departmentIds: string[],
  db: CatalogCompositionDb = defaultDb
): Promise<ActiveCatalogRow[]> {
  if (departmentIds.length === 0) return []
  if (departmentIds.length > 100) throw new Error('Catalog composition accepts at most 100 departments.')
  if (departmentIds.some(id => !UUID_PATTERN.test(id))) {
    throw new Error('Catalog department identifiers must be valid UUID values.')
  }

  const rows = await db.queryRows<ActiveCatalogDbRow>(
    `WITH active_pack_rows AS (
       SELECT
         'pack'::text AS source_type,
         pack_release.id AS release_id,
         pack_release.department_id,
         pack_version.id AS pack_version_id,
         pack.pack_key,
         pack_version.instructions_preamble,
         pack_version.model_feature_key AS pack_model_feature_key,
         pack_version.max_input_tokens AS pack_max_input_tokens,
         pack_version.max_output_tokens AS pack_max_output_tokens,
         pack_version.max_cost_usd_micros AS pack_max_cost_usd_micros,
         pack_version.max_latency_ms AS pack_max_latency_ms,
         capability_version.id AS capability_version_id,
         capability.capability_key,
         capability_version.required_permission_group,
         capability_version.model_feature_key AS capability_model_feature_key,
         capability_version.max_input_tokens AS capability_max_input_tokens,
         capability_version.max_output_tokens AS capability_max_output_tokens,
         capability_version.max_cost_usd_micros AS capability_max_cost_usd_micros,
         capability_version.max_latency_ms AS capability_max_latency_ms,
         binding.tool_name,
         binding.access_mode,
         composition.sort_order AS capability_sort_order,
         binding.sort_order AS tool_sort_order
       FROM ai_pack_releases pack_release
       JOIN ai_capability_pack_versions pack_version ON pack_version.id = pack_release.pack_version_id
       JOIN ai_capability_packs pack ON pack.id = pack_release.pack_id
       LEFT JOIN ai_pack_version_capabilities composition ON composition.pack_version_id = pack_version.id
       LEFT JOIN ai_capability_versions capability_version ON capability_version.id = composition.capability_version_id
       LEFT JOIN ai_capabilities capability ON capability.id = capability_version.capability_id
       LEFT JOIN ai_capability_tool_bindings binding ON binding.capability_version_id = capability_version.id
       WHERE pack_release.department_id = ANY($1::uuid[])
         AND pack_release.release_state = 'active'
         AND pack_release.evaluation_gate_passed = TRUE
         AND pack_release.evaluation_run_status = 'completed'
     ),
     active_capability_rows AS (
       SELECT
         'capability'::text AS source_type,
         capability_release.id AS release_id,
         capability_release.department_id,
         NULL::uuid AS pack_version_id,
         NULL::text AS pack_key,
         ''::text AS instructions_preamble,
         NULL::text AS pack_model_feature_key,
         NULL::integer AS pack_max_input_tokens,
         NULL::integer AS pack_max_output_tokens,
         NULL::bigint AS pack_max_cost_usd_micros,
         NULL::integer AS pack_max_latency_ms,
         capability_version.id AS capability_version_id,
         capability.capability_key,
         capability_version.required_permission_group,
         capability_version.model_feature_key AS capability_model_feature_key,
         capability_version.max_input_tokens AS capability_max_input_tokens,
         capability_version.max_output_tokens AS capability_max_output_tokens,
         capability_version.max_cost_usd_micros AS capability_max_cost_usd_micros,
         capability_version.max_latency_ms AS capability_max_latency_ms,
         binding.tool_name,
         binding.access_mode,
         0 AS capability_sort_order,
         binding.sort_order AS tool_sort_order
       FROM ai_capability_releases capability_release
       JOIN ai_capability_versions capability_version ON capability_version.id = capability_release.capability_version_id
       JOIN ai_capabilities capability ON capability.id = capability_release.capability_id
       LEFT JOIN ai_capability_tool_bindings binding ON binding.capability_version_id = capability_version.id
       WHERE capability_release.department_id = ANY($1::uuid[])
         AND capability_release.release_state = 'active'
         AND capability_release.evaluation_gate_passed = TRUE
         AND capability_release.evaluation_run_status = 'completed'
     )
     SELECT * FROM active_pack_rows
     UNION ALL
     SELECT * FROM active_capability_rows
     ORDER BY department_id, source_type, release_id, capability_sort_order, tool_sort_order`,
    [departmentIds]
  )

  return rows.map(mapCatalogRow)
}

export interface CatalogBudgetCeiling {
  maxInputTokens: number
  maxOutputTokens: number
  maxCostUsdMicros: number
  maxLatencyMs: number
}

export interface GovernedCatalogComposition<T> {
  mode: 'legacy' | 'governed'
  tools: T[]
  instructionsPreamble: string
  budget: CatalogBudgetCeiling | null
  releaseIds: string[]
  departmentIds: string[]
  packVersionIds: string[]
  capabilityVersionIds: string[]
  modelFeatureKeys: string[]
}

function strictest(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null)
  return present.length ? Math.min(...present) : null
}

function bindingAllowsTool(tool: { mutates?: boolean }, accessMode: CatalogAccessMode): boolean {
  return tool.mutates ? accessMode === 'propose' : accessMode === 'read' || accessMode === 'draft'
}

/**
 * Intersect active catalog bindings with an existing RBAC-filtered registry. The catalog is an
 * additional release/permission/access-mode ceiling: this function only returns original tool
 * objects and therefore cannot grant a tool that RBAC did not already permit.
 */
export function composeGovernedCatalog<T extends { name: string, mutates?: boolean }>(
  rbacFilteredTools: T[],
  catalogRows: ActiveCatalogRow[],
  grantedPermissionGroups: readonly PermissionGroup[]
): GovernedCatalogComposition<T> {
  if (catalogRows.length === 0) {
    return {
      mode: 'legacy',
      tools: rbacFilteredTools,
      instructionsPreamble: '',
      budget: null,
      releaseIds: [],
      departmentIds: [],
      packVersionIds: [],
      capabilityVersionIds: [],
      modelFeatureKeys: []
    }
  }

  const granted = new Set<PermissionGroup>(grantedPermissionGroups)
  const authorizedRows = catalogRows.filter(row =>
    row.capabilityVersionId
    && row.requiredPermissionGroup
    && granted.has(row.requiredPermissionGroup)
  )
  const accessModesByTool = new Map<string, Set<CatalogAccessMode>>()
  for (const row of authorizedRows) {
    if (!row.toolName || !row.accessMode) continue
    const modes = accessModesByTool.get(row.toolName) ?? new Set<CatalogAccessMode>()
    modes.add(row.accessMode)
    accessModesByTool.set(row.toolName, modes)
  }

  const tools = rbacFilteredTools.filter((tool) => {
    const modes = accessModesByTool.get(tool.name)
    return modes ? [...modes].some(mode => bindingAllowsTool(tool, mode)) : false
  })

  const preambles = new Map<string, string>()
  for (const row of authorizedRows) {
    const preamble = row.instructionsPreamble.trim()
    if (row.packVersionId && preamble && !preambles.has(row.packVersionId)) {
      preambles.set(row.packVersionId, preamble)
    }
  }

  const maxInputTokens = strictest(authorizedRows.flatMap(row => [
    row.packMaxInputTokens,
    row.capabilityMaxInputTokens
  ]))
  const maxOutputTokens = strictest(authorizedRows.flatMap(row => [
    row.packMaxOutputTokens,
    row.capabilityMaxOutputTokens
  ]))
  const maxCostUsdMicros = strictest(authorizedRows.flatMap(row => [
    row.packMaxCostUsdMicros,
    row.capabilityMaxCostUsdMicros
  ]))
  const maxLatencyMs = strictest(authorizedRows.flatMap(row => [
    row.packMaxLatencyMs,
    row.capabilityMaxLatencyMs
  ]))
  const budget = maxInputTokens != null
    && maxOutputTokens != null
    && maxCostUsdMicros != null
    && maxLatencyMs != null
    ? { maxInputTokens, maxOutputTokens, maxCostUsdMicros, maxLatencyMs }
    : null

  return {
    mode: 'governed',
    tools,
    instructionsPreamble: [...preambles.values()].join('\n\n'),
    budget,
    releaseIds: [...new Set(catalogRows.map(row => row.releaseId))],
    departmentIds: [...new Set(catalogRows.map(row => row.departmentId))],
    packVersionIds: [...new Set(authorizedRows.flatMap(row => row.packVersionId ? [row.packVersionId] : []))],
    capabilityVersionIds: [...new Set(authorizedRows.flatMap(row => row.capabilityVersionId ? [row.capabilityVersionId] : []))],
    modelFeatureKeys: [...new Set(authorizedRows.flatMap(row => [
      row.packModelFeatureKey,
      row.capabilityModelFeatureKey
    ].filter((key): key is string => Boolean(key))))]
  }
}
