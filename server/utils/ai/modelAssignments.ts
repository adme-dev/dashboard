import { execute, queryRows } from '~~/server/utils/db'
import {
  buildWarnings,
  getAiModelMapSummary,
  listAiModelCatalogOptions,
  listAiModelMap,
  metadataForModel,
  providerForModel,
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
  runtimeRoutingStatus: RuntimeRoutingStatus
  runtimeRoutingLabel: string
  runtimeControlEnabled: boolean
  runtimeSupportedProviders: RuntimeModelProvider[]
  runtimeNotes: string | null
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
  runtimeRoutedCount: number
  runtimePartialCount: number
  runtimeWorkerSideCount: number
  runtimeDirectCount: number
  runtimeControllableCount: number
}

export type RuntimeModelProvider = 'groq' | 'anthropic' | 'workers_ai' | 'minimax' | 'aigateway'
export type RuntimeRoutingStatus = 'runtime_routed' | 'partial' | 'worker_side' | 'direct'

export interface ResolvedAiModelAssignment {
  featureKey: string
  provider: RuntimeModelProvider
  modelId: string
  fallbackModelId: string | null
  source: 'default' | 'override'
  ignoredReason: string | null
  modelSpec: string
  fallbackModelSpec: string | null
}

export interface ResolveAiModelAssignmentInput {
  featureKey: string
  defaultProvider: RuntimeModelProvider
  defaultModelId: string
  defaultFallbackModelId?: string | null
  supportedProviders?: RuntimeModelProvider[]
}

const FEATURE_RUNTIME_SUPPORTED_PROVIDERS: Record<string, RuntimeModelProvider[]> = {
  agency_ai_tool_loop: ['groq', 'anthropic', 'workers_ai'],
  agency_ai_l2_specialist_loop: ['groq', 'anthropic', 'workers_ai'],
  portal_ai_tool_loop: ['groq', 'anthropic', 'workers_ai'],
  ai_agent_digest_report: ['groq'],
  agency_ai_l2_classifier: ['groq'],
  agency_ai_l2_synthesis: ['groq'],
  agency_ai_single_shot_fallback: ['groq'],
  agency_ai_intent_lora_classifier: ['workers_ai'],
  agency_ai_intent_edge_classifier: ['workers_ai'],
  agency_ai_intent_groq_classifier: ['groq'],
  ai_memory_distillation: ['groq'],
  observe_and_learn_distillation: ['groq'],
  social_spend_ai_analysis: ['groq'],
  social_spend_pacing_summary: ['groq'],
  agent_spend_controller: ['groq', 'anthropic', 'workers_ai'],
  agent_publishing_planner: ['groq', 'anthropic', 'workers_ai'],
  agent_financial_watch: ['groq', 'anthropic', 'workers_ai'],
  agent_traffic_controller: ['groq', 'anthropic', 'workers_ai'],
  agent_office_watch: ['groq', 'anthropic', 'workers_ai'],
  budget_change_sanity_check: ['groq'],
  social_publishing_plan: ['groq'],
  social_publishing_caption: ['groq'],
  social_reporting_ai_summary: ['groq'],
  social_inbox_reply_draft: ['groq'],
  social_listening_enrichment: ['groq'],
  crm_followup_draft: ['groq'],
  banner_image_suggest: ['workers_ai', 'groq'],
  banner_copy_suggest: ['workers_ai', 'groq'],
  banner_code_assist: ['workers_ai', 'groq'],
  task_wiki_summary: ['groq'],
  agency_task_assist_creation: ['groq'],
  agency_task_assist_analysis: ['groq'],
  board_automation_ai_insight: ['groq'],
  board_automation_ai_summary: ['groq'],
  agency_analytics_ai_summary: ['workers_ai', 'groq'],
  agency_analytics_ask: ['groq'],
  rate_card_description: ['groq'],
  notification_digest_narrative: ['groq'],
  notification_why_explanation: ['groq'],
  task_assignment_auto_ack: ['groq'],
  office_recording_transcription: ['groq'],
  office_meeting_cross_search: ['groq'],
  office_meeting_question_answer: ['groq'],
  agency_ai_voice_stt: ['workers_ai'],
  agency_ai_voice_tts: ['workers_ai'],
  workers_ai_speech_to_text: ['workers_ai'],
  workers_ai_text_to_speech: ['workers_ai'],
  financial_advisor: ['groq', 'anthropic'],
  cashflow_insights: ['groq'],
  expense_insights: ['groq'],
  anomaly_driver_narrative: ['groq'],
  action_plan_generation: ['groq'],
  financial_insights_headline: ['groq'],
  financial_insights_recommendations: ['groq'],
  xero_invoice_ai_briefing: ['groq'],
  customer_insights_summary: ['groq'],
  video_asset_publish_social_caption: ['groq'],
  video_project_ai_assembly: ['groq'],
  audio_render_publish_social_caption: ['groq'],
  workers_ai_edge_generate: ['workers_ai'],
  workers_ai_edge_classify: ['workers_ai'],
  workers_ai_edge_summarize: ['workers_ai'],
  workers_ai_edge_generate_lora: ['workers_ai'],
}

const FEATURE_RUNTIME_STATUS_OVERRIDES: Record<string, { status: RuntimeRoutingStatus, note: string }> = {
  office_recording_transcription: {
    status: 'partial',
    note: 'Generated summary/action-item text is assignment-routed; raw Groq audio transcription still needs an audio-specific assignment path.',
  },
}

function workerSideRuntimeFeature(row: AiModelMapRow) {
  if (row.sourceFile.startsWith('workers/')) return true
  return [
    'video_generation_job',
    'video_generation_worker_runtime',
    'video_generation_completion',
    'video_asset_intelligence_job',
    'video_asset_intelligence_worker_runtime',
    'audio_music_generation',
    'audio_music_generation_worker_runtime',
  ].includes(row.featureKey)
}

function runtimeRoutingForRow(row: AiModelMapRow) {
  const supportedProviders = supportedProvidersForFeature(row.featureKey) ?? []
  const override = FEATURE_RUNTIME_STATUS_OVERRIDES[row.featureKey]
  if (override) {
    return {
      runtimeRoutingStatus: override.status,
      runtimeRoutingLabel: 'Partially routed',
      runtimeControlEnabled: supportedProviders.length > 0,
      runtimeSupportedProviders: supportedProviders,
      runtimeNotes: override.note,
    }
  }
  if (supportedProviders.length > 0) {
    return {
      runtimeRoutingStatus: 'runtime_routed' as const,
      runtimeRoutingLabel: 'Runtime routed',
      runtimeControlEnabled: true,
      runtimeSupportedProviders: supportedProviders,
      runtimeNotes: null,
    }
  }
  if (workerSideRuntimeFeature(row)) {
    return {
      runtimeRoutingStatus: 'worker_side' as const,
      runtimeRoutingLabel: 'Worker-side rollout',
      runtimeControlEnabled: false,
      runtimeSupportedProviders: [],
      runtimeNotes: 'Requires model assignment distribution into Workers or job payloads before dashboard overrides can affect runtime.',
    }
  }
  return {
    runtimeRoutingStatus: 'direct' as const,
    runtimeRoutingLabel: 'Direct',
    runtimeControlEnabled: false,
    runtimeSupportedProviders: [],
    runtimeNotes: 'Registered in the model map, but no runtime resolver is wired for this feature yet.',
  }
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

    const runtime = runtimeRoutingForRow(row)
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
      ...runtime,
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
    runtimeRoutedCount: rows.filter((row) => row.runtimeRoutingStatus === 'runtime_routed').length,
    runtimePartialCount: rows.filter((row) => row.runtimeRoutingStatus === 'partial').length,
    runtimeWorkerSideCount: rows.filter((row) => row.runtimeRoutingStatus === 'worker_side').length,
    runtimeDirectCount: rows.filter((row) => row.runtimeRoutingStatus === 'direct').length,
    runtimeControllableCount: rows.filter((row) => row.runtimeControlEnabled).length,
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

export function supportedProvidersForFeature(featureKey: string): RuntimeModelProvider[] | null {
  return FEATURE_RUNTIME_SUPPORTED_PROVIDERS[featureKey] ?? null
}

export function modelProviderMatches(provider: string, modelId: string) {
  return providerForModel(modelId) === provider
}

function runtimeProvider(value: string): RuntimeModelProvider {
  if (value === 'workers-ai') return 'workers_ai'
  if (value === 'aigateway') return 'aigateway'
  return value as RuntimeModelProvider
}

export function modelSpecForAssignment(provider: string, modelId: string): string {
  const normalizedProvider = runtimeProvider(provider)
  if (normalizedProvider === 'workers_ai') {
    return modelId.startsWith('workersai/') ? modelId : `workersai/${modelId}`
  }
  if (normalizedProvider === 'anthropic') {
    return modelId.startsWith('anthropic/') ? modelId : `anthropic/${modelId}`
  }
  if (normalizedProvider === 'groq') {
    return modelId.startsWith('groq/') ? modelId : `groq/${modelId}`
  }
  return modelId
}

export function groqModelIdFromAssignment(modelId: string) {
  return modelId.replace(/^groq\//, '')
}

export async function resolveAiModelAssignment(input: ResolveAiModelAssignmentInput): Promise<ResolvedAiModelAssignment> {
  const supportedProviders = input.supportedProviders
    ?? supportedProvidersForFeature(input.featureKey)
    ?? [input.defaultProvider]
  const defaultProvider = runtimeProvider(input.defaultProvider)
  const defaultFallback = input.defaultFallbackModelId ?? null
  const defaults: ResolvedAiModelAssignment = {
    featureKey: input.featureKey,
    provider: defaultProvider,
    modelId: input.defaultModelId,
    fallbackModelId: defaultFallback,
    source: 'default',
    ignoredReason: null,
    modelSpec: modelSpecForAssignment(defaultProvider, input.defaultModelId),
    fallbackModelSpec: defaultFallback ? modelSpecForAssignment(providerForModel(defaultFallback), defaultFallback) : null,
  }

  const known = findEditableAssignmentFeature(input.featureKey)
  if (!known.ok) return { ...defaults, ignoredReason: known.reason }

  let result: AssignmentReadResult
  try {
    result = await readAiModelAssignmentOverrides([input.featureKey])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ...defaults, ignoredReason: `Model assignment lookup failed; using default. ${message}`.slice(0, 240) }
  }
  if (!result.available) return { ...defaults, ignoredReason: result.reason }

  const override = result.overrides[0]
  if (!override) return defaults

  const overrideProvider = runtimeProvider(override.provider)
  if (!supportedProviders.includes(overrideProvider)) {
    return { ...defaults, ignoredReason: `Provider ${override.provider} is not supported for ${input.featureKey}.` }
  }
  if (!modelIdIsCatalogued(override.modelId)) {
    return { ...defaults, ignoredReason: `Model ${override.modelId} is not catalogued.` }
  }
  if (!modelProviderMatches(overrideProvider, override.modelId)) {
    return { ...defaults, ignoredReason: `Model ${override.modelId} does not belong to provider ${override.provider}.` }
  }

  return {
    featureKey: input.featureKey,
    provider: overrideProvider,
    modelId: override.modelId,
    fallbackModelId: override.fallbackModelId,
    source: 'override',
    ignoredReason: null,
    modelSpec: modelSpecForAssignment(overrideProvider, override.modelId),
    fallbackModelSpec: override.fallbackModelId ? modelSpecForAssignment(providerForModel(override.fallbackModelId), override.fallbackModelId) : null,
  }
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
