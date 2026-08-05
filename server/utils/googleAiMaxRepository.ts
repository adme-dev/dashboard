import { execute, queryOne, transaction } from '~~/server/utils/db'
import {
  diffGoogleAiMaxMaterialState,
  type GoogleAiMaxCampaignState,
} from '~~/server/utils/googleAiMax'

export type GoogleAiMaxStateEventType =
  | 'first_seen'
  | 'classification_changed'
  | 'setting_changed'
  | 'became_unknown'
  | 'recovered'

export type GoogleAiMaxScanTrigger = 'manual' | 'scheduled' | 'post_sync'
export type GoogleAiMaxScanStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed'

export interface GoogleAiMaxScanRunRef {
  id: string
  status: GoogleAiMaxScanStatus
}

export interface GoogleAiMaxScanFailure {
  connectionId: string
  customerId?: string
  error: string
}

export interface PersistGoogleAiMaxCampaignStatesInput {
  scanRunId: string
  states: GoogleAiMaxCampaignState[]
}

export interface PersistGoogleAiMaxCampaignStatesResult {
  inserted: number
  refreshed: number
  changed: number
  events: Array<{
    campaignId: string
    eventType: GoogleAiMaxStateEventType
    changedFields: string[]
  }>
}

interface DbClient {
  query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[] }>
}

interface CurrentStateRow {
  id: string
  raw_evidence: GoogleAiMaxCampaignState | string
  last_changed_at: string | Date
}

interface RepositoryDependencies {
  withTransaction<T>(callback: (client: DbClient) => Promise<T>): Promise<T>
}

const defaultDependencies: RepositoryDependencies = {
  withTransaction: callback => transaction(callback as any),
}

export async function claimGoogleAiMaxScanRun(input: {
  tenantId: string
  trigger: GoogleAiMaxScanTrigger
  requestedBy?: string
  totalConnections: number
  apiVersion?: string
}): Promise<GoogleAiMaxScanRunRef | null> {
  return queryOne<GoogleAiMaxScanRunRef>(`
    INSERT INTO google_ai_max_scan_runs (
      tenant_id, status, trigger, requested_by, total_connections, api_version
    ) VALUES ($1, 'queued', $2, $3, $4, $5)
    ON CONFLICT (tenant_id) WHERE status IN ('queued', 'running') DO NOTHING
    RETURNING id, status
  `, [
    input.tenantId,
    input.trigger,
    input.requestedBy ?? null,
    input.totalConnections,
    input.apiVersion ?? 'v23',
  ])
}

export async function markGoogleAiMaxScanRunRunning(input: {
  runId: string
  tenantId: string
  startedAt: string
}): Promise<boolean> {
  const updated = await execute(`
    UPDATE google_ai_max_scan_runs
    SET status = 'running', started_at = $3, updated_at = NOW()
    WHERE id = $1
      AND tenant_id = $2
      AND status = 'queued'
  `, [input.runId, input.tenantId, input.startedAt])
  return updated === 1
}

export async function finishGoogleAiMaxScanRun(input: {
  runId: string
  tenantId: string
  finishedAt: string
  processedConnections: number
  totalCampaigns: number
  affectedCampaigns: number
  unknownCampaigns: number
  failures: GoogleAiMaxScanFailure[]
}): Promise<GoogleAiMaxScanRunRef | null> {
  const status: GoogleAiMaxScanStatus = input.failures.length === 0
    ? 'completed'
    : input.processedConnections > 0
      ? 'partial'
      : 'failed'

  return queryOne<GoogleAiMaxScanRunRef>(`
    UPDATE google_ai_max_scan_runs
    SET status = $3,
        finished_at = $4,
        processed_connections = $5,
        total_campaigns = $6,
        affected_campaigns = $7,
        unknown_campaigns = $8,
        failures = $9::jsonb,
        updated_at = NOW()
    WHERE id = $1
      AND tenant_id = $2
      AND status IN ('queued', 'running')
    RETURNING id, status
  `, [
    input.runId,
    input.tenantId,
    status,
    input.finishedAt,
    input.processedConnections,
    input.totalCampaigns,
    input.affectedCampaigns,
    input.unknownCampaigns,
    JSON.stringify(input.failures),
  ])
}

function parseEvidence(value: GoogleAiMaxCampaignState | string): GoogleAiMaxCampaignState {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function eventTypeForChange(
  previous: GoogleAiMaxCampaignState,
  current: GoogleAiMaxCampaignState,
  changedFields: string[],
): GoogleAiMaxStateEventType {
  if (previous.readinessStatus !== 'unknown' && current.readinessStatus === 'unknown') {
    return 'became_unknown'
  }
  if (previous.readinessStatus === 'unknown' && current.readinessStatus !== 'unknown') {
    return 'recovered'
  }
  if (changedFields.some(field => [
    'migrationReason',
    'readinessStatus',
    'risks',
  ].includes(field))) {
    return 'classification_changed'
  }
  return 'setting_changed'
}

function stateParams(
  state: GoogleAiMaxCampaignState,
  scanRunId: string,
): any[] {
  return [
    state.tenantId,
    state.connectionId,
    state.customerId,
    state.campaignId,
    state.campaignName,
    state.campaignStatus,
    state.advertisingChannelType,
    state.biddingStrategyType,
    state.keywordMatchType,
    state.aiMaxEnabled,
    state.bundlingRequired,
    state.textAssetAutomationStatus,
    state.finalUrlExpansionStatus,
    state.adGroupCount,
    state.searchTermMatchingDisabledAdGroupCount,
    state.migrationReason,
    state.readinessStatus,
    JSON.stringify(state.risks),
    state.effectiveSettings.searchTermMatching,
    state.effectiveSettings.textCustomisation,
    state.effectiveSettings.finalUrlExpansion,
    state.observedAt,
    scanRunId,
    JSON.stringify(state),
  ]
}

async function insertState(
  client: DbClient,
  state: GoogleAiMaxCampaignState,
  scanRunId: string,
): Promise<string> {
  const result = await client.query<{ id: string }>(`
    INSERT INTO google_ai_max_campaign_state (
      tenant_id, connection_id, customer_id, campaign_id, campaign_name,
      campaign_status, advertising_channel_type, bidding_strategy_type,
      keyword_match_type, ai_max_enabled, bundling_required,
      text_asset_automation_status, final_url_expansion_status, ad_group_count,
      search_term_matching_disabled_ad_group_count, migration_reason,
      readiness_status, risk_flags, effective_search_term_matching,
      effective_text_customisation, effective_final_url_expansion,
      first_observed_at, last_observed_at, last_changed_at, last_scan_run_id,
      raw_evidence
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18::jsonb, $19, $20, $21, $22, $22, $22, $23,
      $24::jsonb
    )
    RETURNING id
  `, stateParams(state, scanRunId))

  const id = result.rows[0]?.id
  if (!id) throw new Error(`Failed to persist AI Max campaign ${state.campaignId}`)
  return id
}

async function updateState(
  client: DbClient,
  stateId: string,
  state: GoogleAiMaxCampaignState,
  scanRunId: string,
  lastChangedAt: string,
): Promise<void> {
  await client.query(`
    UPDATE google_ai_max_campaign_state
    SET customer_id = $3,
        campaign_name = $5,
        campaign_status = $6,
        advertising_channel_type = $7,
        bidding_strategy_type = $8,
        keyword_match_type = $9,
        ai_max_enabled = $10,
        bundling_required = $11,
        text_asset_automation_status = $12,
        final_url_expansion_status = $13,
        ad_group_count = $14,
        search_term_matching_disabled_ad_group_count = $15,
        migration_reason = $16,
        readiness_status = $17,
        risk_flags = $18::jsonb,
        effective_search_term_matching = $19,
        effective_text_customisation = $20,
        effective_final_url_expansion = $21,
        last_observed_at = $22,
        last_scan_run_id = $23,
        raw_evidence = $24::jsonb,
        last_changed_at = $25,
        updated_at = NOW()
    WHERE id = $26
      AND tenant_id = $1
      AND connection_id = $2
  `, [...stateParams(state, scanRunId), lastChangedAt, stateId])
}

async function insertEvent(
  client: DbClient,
  input: {
    scanRunId: string
    stateId: string
    state: GoogleAiMaxCampaignState
    previous: GoogleAiMaxCampaignState | null
    eventType: GoogleAiMaxStateEventType
    changedFields: string[]
  },
): Promise<void> {
  await client.query(`
    INSERT INTO google_ai_max_state_events (
      tenant_id, campaign_state_id, scan_run_id, event_type,
      previous_value, current_value, observed_at
    ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
  `, [
    input.state.tenantId,
    input.stateId,
    input.scanRunId,
    input.eventType,
    input.previous ? JSON.stringify(input.previous) : null,
    JSON.stringify({ ...input.state, changedFields: input.changedFields }),
    input.state.observedAt,
  ])
}

export async function persistGoogleAiMaxCampaignStates(
  input: PersistGoogleAiMaxCampaignStatesInput,
  dependencies: RepositoryDependencies = defaultDependencies,
): Promise<PersistGoogleAiMaxCampaignStatesResult> {
  if (input.states.length === 0) {
    return { inserted: 0, refreshed: 0, changed: 0, events: [] }
  }

  const scope = input.states[0]!
  if (input.states.some(
    state => state.tenantId !== scope.tenantId || state.connectionId !== scope.connectionId,
  )) {
    throw new Error('AI Max campaign states must belong to the same tenant and connection')
  }

  return dependencies.withTransaction(async (client) => {
    const result: PersistGoogleAiMaxCampaignStatesResult = {
      inserted: 0,
      refreshed: 0,
      changed: 0,
      events: [],
    }

    for (const state of input.states) {
      const existingResult = await client.query<CurrentStateRow>(`
        SELECT id, raw_evidence, last_changed_at
        FROM google_ai_max_campaign_state
        WHERE tenant_id = $1
          AND connection_id = $2
          AND campaign_id = $3
        FOR UPDATE
      `, [state.tenantId, state.connectionId, state.campaignId])
      const existing = existingResult.rows[0]

      if (!existing) {
        const stateId = await insertState(client, state, input.scanRunId)
        await insertEvent(client, {
          scanRunId: input.scanRunId,
          stateId,
          state,
          previous: null,
          eventType: 'first_seen',
          changedFields: [],
        })
        result.inserted += 1
        result.events.push({
          campaignId: state.campaignId,
          eventType: 'first_seen',
          changedFields: [],
        })
        continue
      }

      const previous = parseEvidence(existing.raw_evidence)
      const changedFields = diffGoogleAiMaxMaterialState(previous, state)
      const lastChangedAt = changedFields.length > 0
        ? state.observedAt
        : new Date(existing.last_changed_at).toISOString()
      await updateState(client, existing.id, state, input.scanRunId, lastChangedAt)

      if (changedFields.length === 0) {
        result.refreshed += 1
        continue
      }

      const eventType = eventTypeForChange(previous, state, changedFields)
      await insertEvent(client, {
        scanRunId: input.scanRunId,
        stateId: existing.id,
        state,
        previous,
        eventType,
        changedFields,
      })
      result.changed += 1
      result.events.push({ campaignId: state.campaignId, eventType, changedFields })
    }

    return result
  })
}
