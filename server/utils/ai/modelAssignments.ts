import { execute, queryRows } from '~~/server/utils/db'
import {
  buildWarnings,
  getAiModelMapSummary,
  listAiModelCatalogOptions,
  listAiModelMap,
  metadataForModel,
  type AiModelMapRow
} from '~~/server/utils/ai/modelRegistry'

export interface AiModelAssignmentRow extends AiModelMapRow {
  defaultProvider: string
  defaultModelId: string
  defaultFallback: string | null
  assignedProvider: string
  assignedModelId: string
  assignedFallback: string | null
  assignmentSource: 'default' | 'override'
  assignmentEditable: boolean
  assignmentNotes: string | null
  assignmentUpdatedBy: string | null
  assignmentUpdatedAt: string | null
}

export interface AiModelAssignmentOverride {
  featureKey: string
  provider: string
  modelId: string
  fallbackModelId: string | null
  notes: string | null
  updatedBy: string | null
  updatedAt: string | null
  createdAt: string | null
}

interface AssignmentDbRow {
  feature_key: string
  provider: string
  model_id: string
  fallback_model_id: string | null
  notes: string | null
  updated_by: string | null
  updated_at: string | null
  created_at: string | null
}

export interface AssignmentReadResult {
  available: boolean
  reason: string | null
  overrides: AiModelAssignmentOverride[]
}

export interface AssignmentSummary {
  totalRows: number
  providers: string[]
  highRiskCount: number
  warningCount: number
  overrideCount: number
  editableCount: number
  blockedDuplicateCount: number
}

function tableMissing(error: unknown) {
  const message = String((error as any)?.message || '')
  return (error as any)?.code === '42P01' || message.includes('ai_model_assignments')
}

function normalizeDbRow(row: AssignmentDbRow): AiModelAssignmentOverride {
  return {
    featureKey: row.feature_key,
    provider: row.provider,
    modelId: row.model_id,
    fallbackModelId: row.fallback_model_id ?? null,
    notes: row.notes ?? null,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
    createdAt: row.created_at ?? null,
  }
}

function normalizeUuid(value: string | null) {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null
}

export async function readAiModelAssignmentOverrides(featureKeys: string[]): Promise<AssignmentReadResult> {
  if (!featureKeys.length) return { available: true, reason: null, overrides: [] }

  try {
    const rows = await queryRows<AssignmentDbRow>(
      `SELECT feature_key, provider, model_id, fallback_model_id, notes, updated_by::text, updated_at, created_at
       FROM ai_model_assignments
       WHERE feature_key = ANY($1::text[])
       ORDER BY updated_at DESC`,
      [featureKeys]
    )
    return { available: true, reason: null, overrides: (rows ?? []).map(normalizeDbRow) }
  } catch (error) {
    if (tableMissing(error)) {
      return {
        available: false,
        reason: 'Run migration 204_ai_model_assignments.sql to enable editable model assignments.',
        overrides: [],
      }
    }
    throw error
  }
}

export function mergeAiModelAssignments(
  rows: AiModelMapRow[],
  overrides: AiModelAssignmentOverride[]
): AiModelAssignmentRow[] {
  const overrideMap = new Map(overrides.map((override) => [override.featureKey, override]))
  const featureCounts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.featureKey] = (acc[row.featureKey] ?? 0) + 1
    return acc
  }, {})

  return rows.map((row) => {
    const override = overrideMap.get(row.featureKey)
    const assignmentEditable = featureCounts[row.featureKey] === 1
    const assignedModelId = override?.modelId || row.modelId
    const assignedProvider = override?.provider || row.provider
    const assignedFallback = override ? override.fallbackModelId : row.fallback
    const meta = metadataForModel(assignedModelId)
    const warnings = buildWarnings(assignedModelId, meta)
    if (!assignmentEditable) warnings.push('Duplicate feature key; assignment editing disabled until split into unique keys')

    return {
      ...row,
      provider: assignedProvider,
      modelId: assignedModelId,
      fallback: assignedFallback,
      status: meta.status,
      pricing: meta.pricing ?? null,
      warnings,
      defaultProvider: row.provider,
      defaultModelId: row.modelId,
      defaultFallback: row.fallback,
      assignedProvider,
      assignedModelId,
      assignedFallback,
      assignmentSource: override ? 'override' : 'default',
      assignmentEditable,
      assignmentNotes: override?.notes ?? null,
      assignmentUpdatedBy: override?.updatedBy ?? null,
      assignmentUpdatedAt: override?.updatedAt ?? null,
    }
  })
}

export function getAiModelAssignmentSummary(rows: AiModelAssignmentRow[]): AssignmentSummary {
  const base = getAiModelMapSummary(rows)
  return {
    ...base,
    overrideCount: rows.filter((row) => row.assignmentSource === 'override').length,
    editableCount: rows.filter((row) => row.assignmentEditable).length,
    blockedDuplicateCount: rows.filter((row) => !row.assignmentEditable).length,
  }
}

export async function listAiModelAssignments() {
  const defaults = listAiModelMap()
  const assignments = await readAiModelAssignmentOverrides(Array.from(new Set(defaults.map((row) => row.featureKey))))
  const rows = mergeAiModelAssignments(defaults, assignments.overrides)
  return {
    rows,
    summary: getAiModelAssignmentSummary(rows),
    assignments: {
      available: assignments.available,
      reason: assignments.reason,
      catalog: listAiModelCatalogOptions(),
    },
  }
}

export function findEditableAssignmentFeature(featureKey: string, rows = listAiModelMap()) {
  const matches = rows.filter((row) => row.featureKey === featureKey)
  if (!matches.length) return { ok: false as const, reason: 'Unknown model assignment feature key.' }
  if (matches.length > 1) return { ok: false as const, reason: 'This feature key maps to multiple rows and cannot be edited until split into unique keys.' }
  return { ok: true as const, row: matches[0] }
}

export function modelIdIsCatalogued(modelId: string, rows = listAiModelMap()) {
  const catalogued = listAiModelCatalogOptions().some((model) => model.modelId === modelId)
  if (catalogued) return true
  return rows.some((row) => row.modelId === modelId || row.fallback === modelId)
}

export async function upsertAiModelAssignment(input: {
  featureKey: string
  provider: string
  modelId: string
  fallbackModelId: string | null
  notes: string | null
  userId: string | null
}) {
  const userId = normalizeUuid(input.userId)
  const previous = await readAiModelAssignmentOverrides([input.featureKey])
  await execute(
    `INSERT INTO ai_model_assignments (feature_key, provider, model_id, fallback_model_id, notes, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::uuid, NOW())
     ON CONFLICT (feature_key) DO UPDATE
       SET provider = EXCLUDED.provider,
           model_id = EXCLUDED.model_id,
           fallback_model_id = EXCLUDED.fallback_model_id,
           notes = EXCLUDED.notes,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
    [input.featureKey, input.provider, input.modelId, input.fallbackModelId, input.notes, userId]
  )
  await execute(
    `INSERT INTO ai_model_assignment_audit (feature_key, action, previous_value, next_value, changed_by)
     VALUES ($1, 'upsert', $2::jsonb, $3::jsonb, $4::uuid)`,
    [
      input.featureKey,
      JSON.stringify(previous.overrides[0] ?? null),
      JSON.stringify({
        provider: input.provider,
        modelId: input.modelId,
        fallbackModelId: input.fallbackModelId,
        notes: input.notes,
      }),
      userId,
    ]
  )
}

export async function resetAiModelAssignment(featureKey: string, userId: string | null) {
  const changedBy = normalizeUuid(userId)
  const previous = await readAiModelAssignmentOverrides([featureKey])
  await execute('DELETE FROM ai_model_assignments WHERE feature_key = $1', [featureKey])
  await execute(
    `INSERT INTO ai_model_assignment_audit (feature_key, action, previous_value, next_value, changed_by)
     VALUES ($1, 'reset', $2::jsonb, NULL, $3::uuid)`,
    [featureKey, JSON.stringify(previous.overrides[0] ?? null), changedBy]
  )
}
