import { queryRows } from '~~/server/utils/db'
import type { CatalogReleaseKind, CatalogReleaseState } from './catalogReleaseGovernance'

type GovernedReleaseState = Exclude<CatalogReleaseState, 'draft'> | 'draft'

export interface CatalogGovernanceCursor {
  createdAt: string
  kind: CatalogReleaseKind
  releaseId: string
}

export interface CatalogGovernanceListInput {
  departmentId?: string | null
  kind?: CatalogReleaseKind | null
  releaseState?: GovernedReleaseState | null
  limit?: number
  cursor?: string | null
}

export interface CatalogGovernanceReadDb {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

export interface CatalogGovernanceItem {
  kind: CatalogReleaseKind
  id: string
  key: string
  name: string
  description: string
  department: { id: string, name: string, slug: string }
  owner: { id: string, name: string }
  version: { id: string, number: number, label: string | null }
  release: {
    id: string
    state: GovernedReleaseState
    evaluationRunId: string | null
    evaluationGatePassed: boolean | null
    reason: string
    changedBy: string
    createdAt: string
    updatedAt: string
  }
  evaluation: {
    runId: string
    status: string
    gatePassed: boolean | null
    caseCount: number
    passedCount: number
    failedCount: number
    humanReviewCount: number
  } | null
  controls: {
    modelFeatureKey: string
    permissionGroup: string | null
    riskClass: string | null
    dataClass: string | null
    approvalMode: string | null
    maxInputTokens: number
    maxOutputTokens: number
    maxCostUsdMicros: number
    maxLatencyMs: number
    capabilityCount: number
    toolCount: number
    toolNames: string[]
    toolsTruncated: boolean
  }
}

type CatalogGovernanceRow = {
  kind: CatalogReleaseKind
  release_id: string
  entity_id: string
  entity_key: string
  entity_name: string
  entity_description: string
  department_id: string
  department_name: string
  department_slug: string
  owner_user_id: string
  owner_name: string
  version_id: string
  version: number | string
  version_label: string | null
  release_state: GovernedReleaseState
  evaluation_run_id: string | null
  evaluation_gate_passed: boolean | null
  evaluation_run_status: string | null
  eval_case_count: number | string | null
  eval_passed_count: number | string | null
  eval_failed_count: number | string | null
  eval_human_review_count: number | string | null
  model_feature_key: string
  required_permission_group: string | null
  risk_class: string | null
  data_class: string | null
  approval_mode: string | null
  max_input_tokens: number | string
  max_output_tokens: number | string
  max_cost_usd_micros: number | string
  max_latency_ms: number | string
  capability_count: number | string
  tool_count: number | string
  tool_names: string[] | null
  change_reason: string
  changed_by: string
  created_at: string | Date
  updated_at: string | Date
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RELEASE_STATES = new Set<GovernedReleaseState>(['draft', 'pilot', 'active', 'suspended', 'retired'])
const RELEASE_KINDS = new Set<CatalogReleaseKind>(['pack', 'capability'])

export class CatalogGovernanceReadError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'CatalogGovernanceReadError'
  }
}

function invalidCursor(): never {
  throw new CatalogGovernanceReadError('invalid_cursor', 'Invalid catalog cursor')
}

function validateCursor(value: unknown): CatalogGovernanceCursor {
  if (!value || typeof value !== 'object') return invalidCursor()
  const cursor = value as Partial<CatalogGovernanceCursor>
  if (
    typeof cursor.createdAt !== 'string'
    || !Number.isFinite(Date.parse(cursor.createdAt))
    || new Date(cursor.createdAt).toISOString() !== cursor.createdAt
    || typeof cursor.kind !== 'string'
    || !RELEASE_KINDS.has(cursor.kind as CatalogReleaseKind)
    || typeof cursor.releaseId !== 'string'
    || !UUID_PATTERN.test(cursor.releaseId)
  ) return invalidCursor()
  return cursor as CatalogGovernanceCursor
}

export function encodeCatalogCursor(cursor: CatalogGovernanceCursor): string {
  const validated = validateCursor(cursor)
  return btoa(JSON.stringify(validated))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function decodeCatalogCursor(value: string): CatalogGovernanceCursor {
  if (!value || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return invalidCursor()
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return validateCursor(JSON.parse(atob(padded)))
  } catch {
    return invalidCursor()
  }
}

function asNumber(value: number | string | null): number {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function asIso(value: string | Date): string {
  return new Date(value).toISOString()
}

function mapRow(row: CatalogGovernanceRow): CatalogGovernanceItem {
  const toolNames = Array.isArray(row.tool_names) ? row.tool_names : []
  const toolCount = asNumber(row.tool_count)
  return {
    kind: row.kind,
    id: row.entity_id,
    key: row.entity_key,
    name: row.entity_name,
    description: row.entity_description,
    department: {
      id: row.department_id,
      name: row.department_name,
      slug: row.department_slug
    },
    owner: {
      id: row.owner_user_id,
      name: row.owner_name
    },
    version: {
      id: row.version_id,
      number: asNumber(row.version),
      label: row.version_label
    },
    release: {
      id: row.release_id,
      state: row.release_state,
      evaluationRunId: row.evaluation_run_id,
      evaluationGatePassed: row.evaluation_gate_passed,
      reason: row.change_reason,
      changedBy: row.changed_by,
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at)
    },
    evaluation: row.evaluation_run_id
      ? {
          runId: row.evaluation_run_id,
          status: row.evaluation_run_status as string,
          gatePassed: row.evaluation_gate_passed,
          caseCount: asNumber(row.eval_case_count),
          passedCount: asNumber(row.eval_passed_count),
          failedCount: asNumber(row.eval_failed_count),
          humanReviewCount: asNumber(row.eval_human_review_count)
        }
      : null,
    controls: {
      modelFeatureKey: row.model_feature_key,
      permissionGroup: row.required_permission_group,
      riskClass: row.risk_class,
      dataClass: row.data_class,
      approvalMode: row.approval_mode,
      maxInputTokens: asNumber(row.max_input_tokens),
      maxOutputTokens: asNumber(row.max_output_tokens),
      maxCostUsdMicros: asNumber(row.max_cost_usd_micros),
      maxLatencyMs: asNumber(row.max_latency_ms),
      capabilityCount: asNumber(row.capability_count),
      toolCount,
      toolNames,
      toolsTruncated: toolCount > toolNames.length
    }
  }
}

const CATALOG_GOVERNANCE_SQL = `
WITH catalog AS (
  SELECT
    'capability'::text AS kind,
    r.id AS release_id,
    c.id AS entity_id,
    c.capability_key AS entity_key,
    c.name AS entity_name,
    c.description AS entity_description,
    c.department_id,
    d.name AS department_name,
    d.slug AS department_slug,
    c.owner_user_id,
    owner.name AS owner_name,
    v.id AS version_id,
    v.version,
    NULL::text AS version_label,
    r.release_state,
    r.evaluation_run_id,
    r.evaluation_gate_passed,
    er.status AS evaluation_run_status,
    er.case_count AS eval_case_count,
    er.passed_count AS eval_passed_count,
    er.failed_count AS eval_failed_count,
    er.human_review_count AS eval_human_review_count,
    v.model_feature_key,
    v.required_permission_group,
    v.risk_class,
    v.data_class,
    v.approval_mode,
    v.max_input_tokens,
    v.max_output_tokens,
    v.max_cost_usd_micros,
    v.max_latency_ms,
    1::bigint AS capability_count,
    (SELECT COUNT(*) FROM ai_capability_tool_bindings count_binding
      WHERE count_binding.capability_version_id = v.id) AS tool_count,
    ARRAY(SELECT listed_binding.tool_name
      FROM ai_capability_tool_bindings listed_binding
      WHERE listed_binding.capability_version_id = v.id
      ORDER BY listed_binding.sort_order, listed_binding.tool_name
      LIMIT 100) AS tool_names,
    r.change_reason,
    r.changed_by,
    r.created_at,
    r.updated_at
  FROM ai_capability_releases r
  JOIN ai_capability_versions v ON v.id = r.capability_version_id
  JOIN ai_capabilities c ON c.id = r.capability_id
  JOIN departments d ON d.id = c.department_id
  JOIN team_members owner ON owner.id = c.owner_user_id
  LEFT JOIN ai_eval_runs er ON er.id = r.evaluation_run_id

  UNION ALL

  SELECT
    'pack'::text AS kind,
    r.id AS release_id,
    p.id AS entity_id,
    p.pack_key AS entity_key,
    p.name AS entity_name,
    p.description AS entity_description,
    p.department_id,
    d.name AS department_name,
    d.slug AS department_slug,
    p.owner_user_id,
    owner.name AS owner_name,
    v.id AS version_id,
    v.version,
    v.label AS version_label,
    r.release_state,
    r.evaluation_run_id,
    r.evaluation_gate_passed,
    er.status AS evaluation_run_status,
    er.case_count AS eval_case_count,
    er.passed_count AS eval_passed_count,
    er.failed_count AS eval_failed_count,
    er.human_review_count AS eval_human_review_count,
    v.model_feature_key,
    NULL::text AS required_permission_group,
    NULL::text AS risk_class,
    NULL::text AS data_class,
    NULL::text AS approval_mode,
    v.max_input_tokens,
    v.max_output_tokens,
    v.max_cost_usd_micros,
    v.max_latency_ms,
    (SELECT COUNT(*) FROM ai_pack_version_capabilities count_capability
      WHERE count_capability.pack_version_id = v.id) AS capability_count,
    (SELECT COUNT(DISTINCT count_binding.tool_name)
      FROM ai_pack_version_capabilities count_pack_capability
      JOIN ai_capability_tool_bindings count_binding
        ON count_binding.capability_version_id = count_pack_capability.capability_version_id
      WHERE count_pack_capability.pack_version_id = v.id) AS tool_count,
    ARRAY(SELECT DISTINCT listed_binding.tool_name
      FROM ai_pack_version_capabilities listed_pack_capability
      JOIN ai_capability_tool_bindings listed_binding
        ON listed_binding.capability_version_id = listed_pack_capability.capability_version_id
      WHERE listed_pack_capability.pack_version_id = v.id
      ORDER BY listed_binding.tool_name
      LIMIT 100) AS tool_names,
    r.change_reason,
    r.changed_by,
    r.created_at,
    r.updated_at
  FROM ai_pack_releases r
  JOIN ai_capability_pack_versions v ON v.id = r.pack_version_id
  JOIN ai_capability_packs p ON p.id = r.pack_id
  JOIN departments d ON d.id = p.department_id
  JOIN team_members owner ON owner.id = p.owner_user_id
  LEFT JOIN ai_eval_runs er ON er.id = r.evaluation_run_id
)
SELECT *
FROM catalog
WHERE ($1::uuid IS NULL OR department_id = $1)
  AND ($2::text IS NULL OR kind = $2)
  AND ($3::text IS NULL OR release_state = $3)
  AND (
    $4::timestamptz IS NULL
    OR (created_at, kind, release_id) < ($4::timestamptz, $5::text, $6::uuid)
  )
ORDER BY created_at DESC, kind DESC, release_id DESC
LIMIT $7
`

const defaultDb: CatalogGovernanceReadDb = { queryRows }

export async function listCatalogGovernance(
  input: CatalogGovernanceListInput = {},
  db: CatalogGovernanceReadDb = defaultDb
): Promise<{ items: CatalogGovernanceItem[], nextCursor: string | null }> {
  const limit = input.limit ?? 50
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new CatalogGovernanceReadError('invalid_limit', 'Catalog governance limit must be between 1 and 100')
  }
  if (input.departmentId && !UUID_PATTERN.test(input.departmentId)) {
    throw new CatalogGovernanceReadError('invalid_department', 'Catalog governance department must be a valid UUID')
  }
  if (input.kind && !RELEASE_KINDS.has(input.kind)) {
    throw new CatalogGovernanceReadError('invalid_kind', 'Invalid catalog governance kind')
  }
  if (input.releaseState && !RELEASE_STATES.has(input.releaseState)) {
    throw new CatalogGovernanceReadError('invalid_release_state', 'Invalid catalog governance release state')
  }

  const cursor = input.cursor ? decodeCatalogCursor(input.cursor) : null
  const rows = await db.queryRows<CatalogGovernanceRow>(CATALOG_GOVERNANCE_SQL, [
    input.departmentId ?? null,
    input.kind ?? null,
    input.releaseState ?? null,
    cursor?.createdAt ?? null,
    cursor?.kind ?? null,
    cursor?.releaseId ?? null,
    limit + 1
  ])

  const pageRows = rows.slice(0, limit)
  const last = pageRows.at(-1)
  return {
    items: pageRows.map(mapRow),
    nextCursor: rows.length > limit && last
      ? encodeCatalogCursor({
          createdAt: asIso(last.created_at),
          kind: last.kind,
          releaseId: last.release_id
        })
      : null
  }
}
