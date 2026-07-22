import { queryRows as realQueryRows } from '~~/server/utils/db'
import { PERMISSION_GROUPS, type PermissionGroup } from '~~/server/utils/permissions'

export type CatalogSourceType = 'pack' | 'capability'
export type CatalogAccessMode = 'read' | 'draft' | 'propose'
export type CatalogControlReleaseState = 'pilot' | 'active' | 'suspended' | 'retired'
export type CatalogPermissionCeiling = PermissionGroup | 'AUTHENTICATED'

export interface ActiveCatalogRow {
  sourceType: CatalogSourceType
  releaseState: CatalogControlReleaseState
  releaseId: string
  departmentId: string
  packVersionId: string | null
  packVersion?: number | null
  packLabel?: string | null
  packKey: string | null
  instructionsPreamble: string
  packModelFeatureKey: string | null
  packMaxInputTokens: number | null
  packMaxOutputTokens: number | null
  packMaxCostUsdMicros: number | null
  packMaxLatencyMs: number | null
  capabilityVersionId: string | null
  capabilityKey: string | null
  requiredPermissionGroup: CatalogPermissionCeiling | null
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
  release_state: string
  release_id: string
  department_id: string
  pack_version_id: string | null
  pack_version?: number | string | null
  pack_label?: string | null
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
const PERMISSION_CEILING_SET = new Set<string>([...PERMISSION_GROUPS, 'AUTHENTICATED'])
const ACCESS_MODE_SET = new Set<string>(['read', 'draft', 'propose'])

function boundedNumber(value: number | string | null): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function mapCatalogRow(row: ActiveCatalogDbRow): ActiveCatalogRow {
  return {
    sourceType: row.source_type === 'capability' ? 'capability' : 'pack',
    releaseState: row.release_state === 'pilot'
      || row.release_state === 'active'
      || row.release_state === 'suspended'
      ? row.release_state
      : 'retired',
    releaseId: row.release_id,
    departmentId: row.department_id,
    packVersionId: row.pack_version_id,
    packVersion: boundedNumber(row.pack_version ?? null),
    packLabel: row.pack_label ?? null,
    packKey: row.pack_key,
    instructionsPreamble: row.instructions_preamble ?? '',
    packModelFeatureKey: row.pack_model_feature_key,
    packMaxInputTokens: boundedNumber(row.pack_max_input_tokens),
    packMaxOutputTokens: boundedNumber(row.pack_max_output_tokens),
    packMaxCostUsdMicros: boundedNumber(row.pack_max_cost_usd_micros),
    packMaxLatencyMs: boundedNumber(row.pack_max_latency_ms),
    capabilityVersionId: row.capability_version_id,
    capabilityKey: row.capability_key,
    requiredPermissionGroup: PERMISSION_CEILING_SET.has(row.required_permission_group ?? '')
      ? row.required_permission_group as CatalogPermissionCeiling
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
 * Read production-active catalog material plus suspended/retired control markers for an
 * already-authorized department scope. The LEFT JOINs intentionally preserve empty releases so
 * composition fails closed instead of mistaking a suspended or empty governed pack for legacy mode.
 */
export async function loadCatalogControlRows(
  departmentIds: string[],
  userId: string,
  db: CatalogCompositionDb = defaultDb
): Promise<ActiveCatalogRow[]> {
  if (departmentIds.length === 0) return []
  if (departmentIds.length > 100) throw new Error('Catalog composition accepts at most 100 departments.')
  if (departmentIds.some(id => !UUID_PATTERN.test(id))) {
    throw new Error('Catalog department identifiers must be valid UUID values.')
  }
  if (!UUID_PATTERN.test(userId)) throw new Error('Catalog user identifier must be a valid UUID value.')

  const rows = await db.queryRows<ActiveCatalogDbRow>(
    `WITH active_pack_rows AS (
       SELECT
         'pack'::text AS source_type,
         pack_release.release_state,
         pack_release.id AS release_id,
         pack_release.department_id,
         pack_version.id AS pack_version_id,
         pack_version.version AS pack_version,
         pack_version.label AS pack_label,
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
         AND pack_release.release_state IN ('pilot', 'active', 'suspended', 'retired')
         AND (
           pack_release.rollout_scope <> 'pilot'
           OR EXISTS (
             SELECT 1
               FROM ai_release_pilot_members pilot_member
               JOIN department_members pilot_department_member
                 ON pilot_department_member.department_id = pilot_member.department_id
                AND pilot_department_member.team_member_id = pilot_member.team_member_id
               JOIN team_members pilot_actor
                 ON pilot_actor.id = pilot_member.team_member_id
                AND pilot_actor.is_active = TRUE
              WHERE pilot_member.release_kind = 'pack'
                AND pilot_member.pack_release_id = pack_release.id
                AND pilot_member.department_id = pack_release.department_id
                AND pilot_member.team_member_id = $2
                AND pilot_member.revoked_at IS NULL
           )
         )
         AND (
           pack_release.release_state NOT IN ('pilot', 'active')
           OR (pack_release.evaluation_gate_passed = TRUE AND pack_release.evaluation_run_status = 'completed')
         )
     ),
     active_capability_rows AS (
       SELECT
         'capability'::text AS source_type,
         capability_release.release_state,
         capability_release.id AS release_id,
         capability_release.department_id,
         NULL::uuid AS pack_version_id,
         NULL::integer AS pack_version,
         NULL::text AS pack_label,
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
         AND capability_release.release_state IN ('pilot', 'active', 'suspended', 'retired')
         AND (
           capability_release.rollout_scope <> 'pilot'
           OR EXISTS (
             SELECT 1
               FROM ai_release_pilot_members pilot_member
               JOIN department_members pilot_department_member
                 ON pilot_department_member.department_id = pilot_member.department_id
                AND pilot_department_member.team_member_id = pilot_member.team_member_id
               JOIN team_members pilot_actor
                 ON pilot_actor.id = pilot_member.team_member_id
                AND pilot_actor.is_active = TRUE
              WHERE pilot_member.release_kind = 'capability'
                AND pilot_member.capability_release_id = capability_release.id
                AND pilot_member.department_id = capability_release.department_id
                AND pilot_member.team_member_id = $2
                AND pilot_member.revoked_at IS NULL
           )
         )
         AND (
           capability_release.release_state NOT IN ('pilot', 'active')
           OR (
             capability_release.evaluation_gate_passed = TRUE
             AND capability_release.evaluation_run_status = 'completed'
           )
         )
     )
     SELECT * FROM active_pack_rows
     UNION ALL
     SELECT * FROM active_capability_rows
     ORDER BY department_id, source_type, release_id, capability_sort_order, tool_sort_order`,
    [departmentIds, userId]
  )

  return rows.map(mapCatalogRow)
}

/**
 * Derive assistant department scope from authenticated server identity. Owners/admins receive all
 * active departments; everyone else receives only explicit membership or managed departments.
 * The 101-row sentinel prevents an accidentally unbounded catalog query.
 */
export async function loadAssistantDepartmentScope(
  userId: string,
  userRole: string,
  db: CatalogCompositionDb = defaultDb
): Promise<string[]> {
  if (!UUID_PATTERN.test(userId)) throw new Error('Assistant user identifier must be a valid UUID.')
  const companyWide = userRole === 'owner' || userRole === 'admin'
  const rows = await db.queryRows<{ id: string }>(
    `SELECT DISTINCT department.id
       FROM departments department
       LEFT JOIN department_members membership
         ON membership.department_id = department.id
        AND membership.team_member_id = $1
      WHERE department.is_active = TRUE
        AND (
          (department.department_kind = 'organizational' AND $2::boolean)
          OR membership.team_member_id IS NOT NULL
          OR department.manager_id = $1
        )
      ORDER BY department.id
      LIMIT 101`,
    [userId, companyWide]
  )
  if (rows.length > 100) throw new Error('Assistant catalog scope supports at most 100 departments.')
  return rows.map(row => row.id)
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
  denials: CatalogToolDenial[]
}

export type CatalogToolDenialReason
  = 'release_suspended'
    | 'release_retired'
    | 'not_in_active_catalog'
    | 'capability_permission_missing'
    | 'access_mode_mismatch'
    | 'persona_narrowed'
    | 'read_only'
    | 'personal_disabled'

export interface CatalogToolDenial {
  toolName: string
  reason: CatalogToolDenialReason
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
      modelFeatureKeys: [],
      denials: []
    }
  }

  const granted = new Set<PermissionGroup>(grantedPermissionGroups)
  const permissionAllows = (ceiling: CatalogPermissionCeiling | null) =>
    ceiling === 'AUTHENTICATED' || (ceiling != null && granted.has(ceiling))
  const capabilityControlState = new Map<string, 'suspended' | 'retired'>()
  for (const row of catalogRows) {
    if (
      row.sourceType !== 'capability'
      || !row.capabilityVersionId
      || (row.releaseState !== 'suspended' && row.releaseState !== 'retired')
    ) continue
    const previous = capabilityControlState.get(row.capabilityVersionId)
    if (row.releaseState === 'suspended' || !previous) {
      capabilityControlState.set(row.capabilityVersionId, row.releaseState)
    }
  }
  const authorizedRows = catalogRows.filter(row =>
    (row.releaseState === 'active' || row.releaseState === 'pilot')
    && row.capabilityVersionId
    && !capabilityControlState.has(row.capabilityVersionId)
    && permissionAllows(row.requiredPermissionGroup)
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
  const allowedToolNames = new Set(tools.map(tool => tool.name))
  const denials: CatalogToolDenial[] = []
  for (const tool of rbacFilteredTools) {
    if (allowedToolNames.has(tool.name)) continue
    const matchingRows = catalogRows.filter(row => row.toolName === tool.name)
    const activeRows = matchingRows.filter(row =>
      row.releaseState === 'active' || row.releaseState === 'pilot'
    )
    let reason: CatalogToolDenialReason
    const inactiveCapabilityStates = matchingRows.flatMap((row) => {
      const state = row.capabilityVersionId ? capabilityControlState.get(row.capabilityVersionId) : null
      return state ? [state] : []
    })
    if (inactiveCapabilityStates.includes('suspended')) {
      reason = 'release_suspended'
    } else if (inactiveCapabilityStates.includes('retired')) {
      reason = 'release_retired'
    } else if (activeRows.length === 0) {
      if (matchingRows.some(row => row.releaseState === 'suspended')) reason = 'release_suspended'
      else if (matchingRows.some(row => row.releaseState === 'retired')) reason = 'release_retired'
      else reason = 'not_in_active_catalog'
    } else if (!activeRows.some(row =>
      row.capabilityVersionId
      && permissionAllows(row.requiredPermissionGroup)
    )) {
      reason = 'capability_permission_missing'
    } else {
      reason = 'access_mode_mismatch'
    }
    denials.push({ toolName: tool.name, reason })
  }

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
    ].filter((key): key is string => Boolean(key))))],
    denials
  }
}

export interface EffectiveAssistantCompositionInput<T> {
  rbacFilteredTools: T[]
  catalogRows: ActiveCatalogRow[]
  grantedPermissionGroups: readonly PermissionGroup[]
  personaToolAllowlist?: readonly string[]
  disabledTools?: readonly string[]
  readOnly?: boolean
}

/** Apply every configuration layer after RBAC strictly by subtraction, preserving denial evidence. */
export function composeEffectiveAssistantTools<T extends { name: string, mutates?: boolean }>(
  input: EffectiveAssistantCompositionInput<T>
): GovernedCatalogComposition<T> {
  const composed = composeGovernedCatalog(
    input.rbacFilteredTools,
    input.catalogRows,
    input.grantedPermissionGroups
  )
  let tools = composed.tools
  const denials = [...composed.denials]

  if (input.personaToolAllowlist) {
    const allowed = new Set(input.personaToolAllowlist)
    const removed = tools.filter(tool => !allowed.has(tool.name))
    denials.push(...removed.map(tool => ({
      toolName: tool.name,
      reason: 'persona_narrowed' as const
    })))
    tools = tools.filter(tool => allowed.has(tool.name))
  }

  if (input.readOnly) {
    const removed = tools.filter(tool => tool.mutates)
    denials.push(...removed.map(tool => ({ toolName: tool.name, reason: 'read_only' as const })))
    tools = tools.filter(tool => !tool.mutates)
  }

  if (input.disabledTools?.length) {
    const disabled = new Set(input.disabledTools)
    const removed = tools.filter(tool => disabled.has(tool.name))
    denials.push(...removed.map(tool => ({
      toolName: tool.name,
      reason: 'personal_disabled' as const
    })))
    tools = tools.filter(tool => !disabled.has(tool.name))
  }

  return { ...composed, tools, denials }
}
