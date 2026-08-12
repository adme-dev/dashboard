import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import {
  normalizeGooglePmaxDeploymentContract,
  type GooglePmaxDeploymentContract
} from '~~/server/utils/googlePmaxDeploymentContract'
import {
  GooglePmaxLaunchJsonError,
  serializeCanonicalLaunchJson
} from '~~/server/utils/googlePmaxLaunchHash'

export const GOOGLE_PMAX_DEPLOYMENT_STATES = [
  'DRAFT',
  'VERIFIED',
  'ACTIVE',
  'SUPERSEDED',
  'REVOKED'
] as const

export type GooglePmaxDeploymentState = typeof GOOGLE_PMAX_DEPLOYMENT_STATES[number]

const TimestampSchema = z.preprocess(
  value => value instanceof Date ? value.toISOString() : value,
  z.string().datetime({ offset: true })
)
const NullableTimestampSchema = TimestampSchema.nullable()
const JsonObjectSchema = z.record(z.string(), z.unknown())
const DeploymentRowSchema = z.strictObject({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  client_id: z.string().uuid(),
  contract_version: z.number().int().positive(),
  contract_hash: z.string().regex(/^[a-f0-9]{64}$/),
  source_connector_id: z.string().uuid(),
  merchant_account_id: z.string().regex(/^\d+$/),
  merchant_data_source_id: z.string().regex(/^\d+$/),
  ads_connection_id: z.string().uuid(),
  ads_customer_id: z.string().regex(/^\d+$/),
  ads_campaign_id: z.string().regex(/^\d+$/),
  tracking_site_id: z.string().uuid(),
  brief_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  campaign_launch_id: z.string().uuid().nullable(),
  normalized_contract: JsonObjectSchema,
  state: z.enum(GOOGLE_PMAX_DEPLOYMENT_STATES),
  created_by: z.string().uuid(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  verified_at: NullableTimestampSchema,
  activated_at: NullableTimestampSchema
})

export interface GooglePmaxStoredDeploymentContract {
  id: string
  tenantId: string
  clientId: string
  contractVersion: number
  contractHash: string
  sourceConnectorId: string
  merchantAccountId: string
  merchantDataSourceId: string
  adsConnectionId: string
  adsCustomerId: string
  adsCampaignId: string
  trackingSiteId: string
  briefId: string | null
  projectId: string | null
  campaignLaunchId: string | null
  normalizedContract: GooglePmaxDeploymentContract
  state: GooglePmaxDeploymentState
  createdBy: string
  createdAt: string
  updatedAt: string
  verifiedAt: string | null
  activatedAt: string | null
}

type GooglePmaxDeploymentConflictCode
  = | 'DEPLOYMENT_NOT_FOUND'
    | 'DEPLOYMENT_VERSION_CONFLICT'
    | 'DEPLOYMENT_REPLAY_CONFLICT'
    | 'DEPLOYMENT_TRANSITION_INVALID'
    | 'DEPLOYMENT_CONCURRENT_TRANSITION'
    | 'DEPLOYMENT_EVIDENCE_REJECTED'

export class GooglePmaxDeploymentConflictError extends Error {
  constructor(public readonly code: GooglePmaxDeploymentConflictCode, message: string) {
    super(message)
    this.name = 'GooglePmaxDeploymentConflictError'
  }
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
}

const DEPLOYMENT_COLUMNS = `id,
  tenant_id,
  client_id,
  contract_version,
  contract_hash,
  source_connector_id,
  merchant_account_id,
  merchant_data_source_id,
  ads_connection_id,
  ads_customer_id,
  ads_campaign_id,
  tracking_site_id,
  brief_id,
  project_id,
  campaign_launch_id,
  normalized_contract,
  state,
  created_by,
  created_at,
  updated_at,
  verified_at,
  activated_at`

const ALLOWED_TRANSITIONS: Record<GooglePmaxDeploymentState, GooglePmaxDeploymentState[]> = {
  DRAFT: ['VERIFIED', 'REVOKED'],
  VERIFIED: ['ACTIVE', 'SUPERSEDED', 'REVOKED'],
  ACTIVE: ['SUPERSEDED', 'REVOKED'],
  SUPERSEDED: [],
  REVOKED: []
}

function toDeploymentContract(value: unknown): GooglePmaxStoredDeploymentContract {
  const row = DeploymentRowSchema.parse(value)
  const normalized = normalizeGooglePmaxDeploymentContract(row.normalized_contract)
  if (normalized.contractHash !== row.contract_hash) {
    throw new GooglePmaxDeploymentConflictError(
      'DEPLOYMENT_REPLAY_CONFLICT',
      'Stored deployment evidence no longer matches its immutable hash.'
    )
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    contractVersion: row.contract_version,
    contractHash: row.contract_hash,
    sourceConnectorId: row.source_connector_id,
    merchantAccountId: row.merchant_account_id,
    merchantDataSourceId: row.merchant_data_source_id,
    adsConnectionId: row.ads_connection_id,
    adsCustomerId: row.ads_customer_id,
    adsCampaignId: row.ads_campaign_id,
    trackingSiteId: row.tracking_site_id,
    briefId: row.brief_id,
    projectId: row.project_id,
    campaignLaunchId: row.campaign_launch_id,
    normalizedContract: normalized.contract,
    state: row.state,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
    activatedAt: row.activated_at
  }
}

function serializeSafeEvidence(evidence: Record<string, unknown>): string {
  if (!evidence || Array.isArray(evidence) || typeof evidence !== 'object') {
    throw new GooglePmaxDeploymentConflictError(
      'DEPLOYMENT_EVIDENCE_REJECTED',
      'Deployment evidence must be a JSON object.'
    )
  }
  let serialized: string
  try {
    serialized = serializeCanonicalLaunchJson(evidence)
  } catch (error) {
    throw new GooglePmaxDeploymentConflictError(
      'DEPLOYMENT_EVIDENCE_REJECTED',
      error instanceof GooglePmaxLaunchJsonError ? error.message : 'Deployment evidence is invalid.'
    )
  }
  const canonical = JSON.parse(serialized) as Record<string, unknown>
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, nested] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (['token', 'authorization', 'password', 'secret', 'credential', 'apikey', 'privatekey', 'cookie', 'bearer']
        .some(prohibited => normalizedKey.includes(prohibited))) {
        throw new GooglePmaxDeploymentConflictError(
          'DEPLOYMENT_EVIDENCE_REJECTED',
          'Deployment evidence contains a prohibited sensitive field.'
        )
      }
      visit(nested)
    }
  }
  visit(canonical)
  if (new TextEncoder().encode(serialized).byteLength > 32_768) {
    throw new GooglePmaxDeploymentConflictError(
      'DEPLOYMENT_EVIDENCE_REJECTED',
      'Deployment evidence exceeds 32 KiB.'
    )
  }
  return serialized
}

async function insertEvent(db: Queryable, input: {
  deploymentContract: GooglePmaxStoredDeploymentContract
  eventType: string
  fromState: GooglePmaxDeploymentState | null
  toState: GooglePmaxDeploymentState
  actorId: string
  evidenceJson?: string
}): Promise<void> {
  await db.query(
    `INSERT INTO google_pmax_deployment_contract_events (
       deployment_contract_id, contract_version, contract_hash, event_type,
       from_state, to_state, actor_id, evidence
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::jsonb)`,
    [
      input.deploymentContract.id,
      input.deploymentContract.contractVersion,
      input.deploymentContract.contractHash,
      input.eventType,
      input.fromState,
      input.toState,
      input.actorId,
      input.evidenceJson || '{}'
    ]
  )
}

export async function createGooglePmaxDeploymentContract(input: {
  contractInput: unknown
  contractVersion: number
  actorId: string
  briefId?: string | null
  projectId?: string | null
  campaignLaunchId?: string | null
}): Promise<{ deploymentContract: GooglePmaxStoredDeploymentContract, isReplay: boolean }> {
  if (!Number.isInteger(input.contractVersion) || input.contractVersion < 1) {
    throw new GooglePmaxDeploymentConflictError(
      'DEPLOYMENT_VERSION_CONFLICT',
      'Deployment contract version must be a positive integer.'
    )
  }
  const normalized = normalizeGooglePmaxDeploymentContract(input.contractInput)
  const normalizedJson = serializeCanonicalLaunchJson(normalized.contract)
  try {
    return await transaction(async (db) => {
      const lockIdentity = `${normalized.contract.tenantId}:${normalized.contract.clientId}`
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockIdentity])
      const inserted = await db.query(
        `INSERT INTO google_pmax_deployment_contracts (
           tenant_id, client_id, contract_version, contract_hash,
           source_connector_id, merchant_account_id, merchant_data_source_id,
           ads_connection_id, ads_customer_id, ads_campaign_id, tracking_site_id,
           brief_id, project_id, campaign_launch_id, normalized_contract, created_by
         ) VALUES (
           $1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, $8::uuid, $9, $10,
           $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::jsonb, $16::uuid
         )
         ON CONFLICT (tenant_id, contract_hash) DO NOTHING
         RETURNING ${DEPLOYMENT_COLUMNS}`,
        [
          normalized.contract.tenantId,
          normalized.contract.clientId,
          input.contractVersion,
          normalized.contractHash,
          normalized.contract.source.connectorId,
          normalized.contract.merchant.accountId,
          normalized.contract.merchant.dataSourceId,
          normalized.contract.ads.connectionId,
          normalized.contract.ads.customerId,
          normalized.contract.ads.campaignId,
          normalized.contract.measurement.trackingSiteId,
          input.briefId || null,
          input.projectId || null,
          input.campaignLaunchId || null,
          normalizedJson,
          input.actorId
        ]
      )
      if (inserted.rows[0]) {
        const deploymentContract = toDeploymentContract(inserted.rows[0])
        await insertEvent(db, {
          deploymentContract,
          eventType: 'DEPLOYMENT_CONTRACT_CREATED',
          fromState: null,
          toState: 'DRAFT',
          actorId: input.actorId
        })
        return { deploymentContract, isReplay: false }
      }

      const existing = await db.query(
        `SELECT ${DEPLOYMENT_COLUMNS}
           FROM google_pmax_deployment_contracts
          WHERE tenant_id = $1::uuid
            AND contract_hash = $2
          FOR UPDATE`,
        [normalized.contract.tenantId, normalized.contractHash]
      )
      if (!existing.rows[0]) {
        throw new GooglePmaxDeploymentConflictError(
          'DEPLOYMENT_REPLAY_CONFLICT',
          'Deployment contract idempotency claim could not be resolved.'
        )
      }
      const deploymentContract = toDeploymentContract(existing.rows[0])
      if (
        deploymentContract.clientId !== normalized.contract.clientId
        || deploymentContract.contractVersion !== input.contractVersion
        || serializeCanonicalLaunchJson(deploymentContract.normalizedContract) !== normalizedJson
      ) {
        throw new GooglePmaxDeploymentConflictError(
          'DEPLOYMENT_REPLAY_CONFLICT',
          'Deployment contract hash belongs to different launch evidence.'
        )
      }
      return { deploymentContract, isReplay: true }
    })
  } catch (error: unknown) {
    if (error instanceof GooglePmaxDeploymentConflictError) throw error
    if ((error as { code?: string })?.code === '23505') {
      throw new GooglePmaxDeploymentConflictError(
        'DEPLOYMENT_VERSION_CONFLICT',
        'This deployment version or live campaign is already claimed by different evidence.'
      )
    }
    throw error
  }
}

export async function transitionGooglePmaxDeploymentContract(input: {
  deploymentContractId: string
  tenantId: string
  expectedState: GooglePmaxDeploymentState
  toState: GooglePmaxDeploymentState
  actorId: string
  eventType: string
  evidence?: Record<string, unknown>
}): Promise<GooglePmaxStoredDeploymentContract> {
  if (!ALLOWED_TRANSITIONS[input.expectedState].includes(input.toState)) {
    throw new GooglePmaxDeploymentConflictError(
      'DEPLOYMENT_TRANSITION_INVALID',
      `Deployment contract cannot transition from ${input.expectedState} to ${input.toState}.`
    )
  }
  const evidenceJson = serializeSafeEvidence(input.evidence || {})
  return await transaction(async (db) => {
    const locked = await db.query(
      `SELECT ${DEPLOYMENT_COLUMNS}
         FROM google_pmax_deployment_contracts
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
        FOR UPDATE`,
      [input.deploymentContractId, input.tenantId]
    )
    if (!locked.rows[0]) {
      throw new GooglePmaxDeploymentConflictError(
        'DEPLOYMENT_NOT_FOUND',
        'Deployment contract was not found in this tenant.'
      )
    }
    const current = toDeploymentContract(locked.rows[0])
    if (current.state !== input.expectedState) {
      throw new GooglePmaxDeploymentConflictError(
        'DEPLOYMENT_CONCURRENT_TRANSITION',
        `Deployment contract is ${current.state}, not ${input.expectedState}.`
      )
    }
    const updated = await db.query(
      `UPDATE google_pmax_deployment_contracts
          SET state = $3,
              verified_at = CASE WHEN $3 = 'VERIFIED' THEN NOW() ELSE verified_at END,
              activated_at = CASE WHEN $3 = 'ACTIVE' THEN NOW() ELSE activated_at END,
              updated_at = NOW()
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND state = $4
        RETURNING ${DEPLOYMENT_COLUMNS}`,
      [input.deploymentContractId, input.tenantId, input.toState, input.expectedState]
    )
    if (!updated.rows[0]) {
      throw new GooglePmaxDeploymentConflictError(
        'DEPLOYMENT_CONCURRENT_TRANSITION',
        'Deployment contract state changed before the transition could be recorded.'
      )
    }
    const deploymentContract = toDeploymentContract(updated.rows[0])
    await insertEvent(db, {
      deploymentContract,
      eventType: input.eventType,
      fromState: input.expectedState,
      toState: input.toState,
      actorId: input.actorId,
      evidenceJson
    })
    return deploymentContract
  })
}
