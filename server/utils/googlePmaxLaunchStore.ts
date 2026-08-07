import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import {
  GooglePmaxLaunchJsonError,
  hashSerializedCanonicalLaunchJson,
  serializeCanonicalLaunchJson
} from '~~/server/utils/googlePmaxLaunchHash'
import {
  evaluateGooglePmaxLaunchTransition,
  GOOGLE_PMAX_LAUNCH_STATES,
  type GooglePmaxLaunchState
} from '~~/server/utils/googlePmaxLaunchState'

const TimestampSchema = z.preprocess(
  value => value instanceof Date ? value.toISOString() : value,
  z.string().datetime({ offset: true })
)

const JsonObjectSchema = z.record(z.string(), z.unknown())
const LaunchRowSchema = z.strictObject({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  brief_id: z.string().uuid(),
  client_id: z.string().uuid(),
  connection_id: z.string().uuid(),
  platform: z.literal('google_ads'),
  campaign_type: z.literal('G_PMaxInventory'),
  config_version: z.number().int().positive(),
  config_hash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotency_key: z.string().regex(/^[a-f0-9]{64}$/),
  normalized_config: JsonObjectSchema,
  state: z.enum(GOOGLE_PMAX_LAUNCH_STATES),
  preflight_result: JsonObjectSchema,
  provider_resources: JsonObjectSchema,
  verification_result: JsonObjectSchema,
  retry_from_state: z.enum(['EXECUTING', 'ENABLING']).nullable(),
  media_spend_id: z.string().uuid().nullable(),
  last_error_code: z.string().nullable(),
  last_error_message: z.string().nullable(),
  created_by: z.string().uuid(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema
})

export interface GooglePmaxLaunch {
  id: string
  tenantId: string
  briefId: string
  clientId: string
  connectionId: string
  platform: 'google_ads'
  campaignType: 'G_PMaxInventory'
  configVersion: number
  configHash: string
  idempotencyKey: string
  normalizedConfig: Record<string, unknown>
  state: GooglePmaxLaunchState
  preflightResult: Record<string, unknown>
  providerResources: Record<string, unknown>
  verificationResult: Record<string, unknown>
  retryFromState: 'EXECUTING' | 'ENABLING' | null
  mediaSpendId: string | null
  lastErrorCode: string | null
  lastErrorMessage: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

type LaunchConflictCode
  = | 'LAUNCH_NOT_FOUND'
    | 'LAUNCH_IDEMPOTENCY_CONFLICT'
    | 'LAUNCH_CONCURRENT_TRANSITION'
    | 'LAUNCH_APPROVAL_CONFLICT'
    | 'LAUNCH_CONFIG_HASH_MISMATCH'
    | 'LAUNCH_EVENT_PAYLOAD_REJECTED'

export class GooglePmaxLaunchConflictError extends Error {
  constructor(public readonly code: LaunchConflictCode, message: string) {
    super(message)
    this.name = 'GooglePmaxLaunchConflictError'
  }
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
}

const LAUNCH_COLUMNS = `id,
  tenant_id,
  brief_id,
  client_id,
  connection_id,
  platform,
  campaign_type,
  config_version,
  config_hash,
  idempotency_key,
  normalized_config,
  state,
  preflight_result,
  provider_resources,
  verification_result,
  retry_from_state,
  media_spend_id,
  last_error_code,
  last_error_message,
  created_by,
  created_at,
  updated_at`

function toLaunch(value: unknown): GooglePmaxLaunch {
  const row = LaunchRowSchema.parse(value)
  return {
    id: row.id,
    tenantId: row.tenant_id,
    briefId: row.brief_id,
    clientId: row.client_id,
    connectionId: row.connection_id,
    platform: row.platform,
    campaignType: row.campaign_type,
    configVersion: row.config_version,
    configHash: row.config_hash,
    idempotencyKey: row.idempotency_key,
    normalizedConfig: row.normalized_config,
    state: row.state,
    preflightResult: row.preflight_result,
    providerResources: row.provider_resources,
    verificationResult: row.verification_result,
    retryFromState: row.retry_from_state,
    mediaSpendId: row.media_spend_id,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function serializeSafePayload(payload: Record<string, unknown>): string {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new GooglePmaxLaunchConflictError(
      'LAUNCH_EVENT_PAYLOAD_REJECTED',
      'Launch event payload must be a JSON object.'
    )
  }

  let serialized: string
  try {
    serialized = serializeCanonicalLaunchJson(payload)
  } catch (error) {
    if (error instanceof GooglePmaxLaunchJsonError) {
      throw new GooglePmaxLaunchConflictError('LAUNCH_EVENT_PAYLOAD_REJECTED', error.message)
    }
    throw error
  }

  const canonicalPayload = JSON.parse(serialized) as Record<string, unknown>
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
        throw new GooglePmaxLaunchConflictError(
          'LAUNCH_EVENT_PAYLOAD_REJECTED',
          'Launch event payload contains a prohibited sensitive field.'
        )
      }
      visit(nested)
    }
  }

  visit(canonicalPayload)
  if (new TextEncoder().encode(serialized).byteLength > 32_768) {
    throw new GooglePmaxLaunchConflictError('LAUNCH_EVENT_PAYLOAD_REJECTED', 'Launch event payload exceeds 32 KiB.')
  }
  return serialized
}

async function insertEvent(db: Queryable, input: {
  launch: GooglePmaxLaunch
  eventType: string
  fromState: GooglePmaxLaunchState | null
  toState: GooglePmaxLaunchState
  actorId: string
  payloadJson?: string
  providerRequestId?: string | null
}): Promise<void> {
  await db.query(
    `INSERT INTO campaign_launch_events (
       launch_id, config_version, config_hash, event_type, from_state, to_state,
       actor_id, payload, provider_request_id
     ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::jsonb, $9)`,
    [
      input.launch.id,
      input.launch.configVersion,
      input.launch.configHash,
      input.eventType,
      input.fromState,
      input.toState,
      input.actorId,
      input.payloadJson || '{}',
      input.providerRequestId || null
    ]
  )
}

async function getLockedLaunch(db: Queryable, launchId: string, tenantId: string): Promise<GooglePmaxLaunch> {
  const identity = await db.query(
    `SELECT brief_id
       FROM campaign_launches
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid`,
    [launchId, tenantId]
  )
  if (!identity.rows[0]) {
    throw new GooglePmaxLaunchConflictError('LAUNCH_NOT_FOUND', 'Campaign launch was not found in this tenant.')
  }
  const briefId = z.object({ brief_id: z.string().uuid() }).parse(identity.rows[0]).brief_id
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [briefId])

  const result = await db.query(
    `SELECT ${LAUNCH_COLUMNS}
       FROM campaign_launches
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      FOR UPDATE`,
    [launchId, tenantId]
  )
  if (!result.rows[0]) {
    throw new GooglePmaxLaunchConflictError('LAUNCH_NOT_FOUND', 'Campaign launch was not found in this tenant.')
  }
  const launch = toLaunch(result.rows[0])
  const newerVersion = await db.query(
    `SELECT 1
       FROM campaign_launches
      WHERE brief_id = $1::uuid
        AND config_version > $2
      LIMIT 1`,
    [launch.briefId, launch.configVersion]
  )
  if (newerVersion.rows[0]) {
    throw new GooglePmaxLaunchConflictError(
      'LAUNCH_CONFIG_HASH_MISMATCH',
      'This launch plan is obsolete because a newer brief configuration version exists.'
    )
  }
  return launch
}

export async function createGooglePmaxLaunch(input: {
  tenantId: string
  briefId: string
  clientId: string
  connectionId: string
  configVersion: number
  configHash: string
  idempotencyKey: string
  normalizedConfig: Record<string, unknown>
  actorId: string
}): Promise<{ launch: GooglePmaxLaunch, isReplay: boolean }> {
  if (!input.normalizedConfig || Array.isArray(input.normalizedConfig) || typeof input.normalizedConfig !== 'object') {
    throw new GooglePmaxLaunchConflictError(
      'LAUNCH_CONFIG_HASH_MISMATCH',
      'Normalized launch configuration must be a JSON object.'
    )
  }

  let normalizedConfigJson: string
  let actualConfigHash: string
  try {
    normalizedConfigJson = serializeCanonicalLaunchJson(input.normalizedConfig)
    actualConfigHash = hashSerializedCanonicalLaunchJson(normalizedConfigJson)
  } catch (error) {
    throw new GooglePmaxLaunchConflictError(
      'LAUNCH_CONFIG_HASH_MISMATCH',
      error instanceof Error ? error.message : 'Normalized launch configuration is invalid.'
    )
  }
  if (actualConfigHash !== input.configHash) {
    throw new GooglePmaxLaunchConflictError(
      'LAUNCH_CONFIG_HASH_MISMATCH',
      'Config hash does not identify the canonical normalized launch configuration.'
    )
  }

  try {
    return await transaction(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.briefId])
      const inserted = await db.query(
        `INSERT INTO campaign_launches (
         tenant_id, brief_id, client_id, connection_id, config_version, config_hash,
         idempotency_key, normalized_config, created_by
       ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8::jsonb, $9::uuid)
       ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
       RETURNING ${LAUNCH_COLUMNS}`,
        [
          input.tenantId,
          input.briefId,
          input.clientId,
          input.connectionId,
          input.configVersion,
          input.configHash,
          input.idempotencyKey,
          normalizedConfigJson,
          input.actorId
        ]
      )

      if (inserted.rows[0]) {
        const launch = toLaunch(inserted.rows[0])
        await insertEvent(db, {
          launch,
          eventType: 'LAUNCH_PLAN_CREATED',
          fromState: null,
          toState: 'DRAFT',
          actorId: input.actorId
        })
        return { launch, isReplay: false }
      }

      const existingResult = await db.query(
        `SELECT ${LAUNCH_COLUMNS}
         FROM campaign_launches
        WHERE tenant_id = $1::uuid
          AND idempotency_key = $2
        FOR UPDATE`,
        [input.tenantId, input.idempotencyKey]
      )
      if (!existingResult.rows[0]) {
        throw new GooglePmaxLaunchConflictError('LAUNCH_IDEMPOTENCY_CONFLICT', 'Launch idempotency claim could not be resolved.')
      }
      const launch = toLaunch(existingResult.rows[0])
      if (
        launch.briefId !== input.briefId
        || launch.clientId !== input.clientId
        || launch.connectionId !== input.connectionId
        || launch.configVersion !== input.configVersion
        || launch.configHash !== input.configHash
        || launch.createdBy !== input.actorId
        || serializeCanonicalLaunchJson(launch.normalizedConfig) !== normalizedConfigJson
      ) {
        throw new GooglePmaxLaunchConflictError('LAUNCH_IDEMPOTENCY_CONFLICT', 'Idempotency key belongs to different launch evidence.')
      }
      return { launch, isReplay: true }
    })
  } catch (error: unknown) {
    if (error instanceof GooglePmaxLaunchConflictError) throw error
    if ((error as { code?: string })?.code === '23505') {
      throw new GooglePmaxLaunchConflictError(
        'LAUNCH_IDEMPOTENCY_CONFLICT',
        'This brief configuration version already belongs to another launch plan.'
      )
    }
    throw error
  }
}

export async function transitionGooglePmaxLaunch(input: {
  launchId: string
  tenantId: string
  expectedState: GooglePmaxLaunchState
  toState: GooglePmaxLaunchState
  expectedConfigVersion: number
  expectedConfigHash: string
  actorId: string
  eventType: string
  payload?: Record<string, unknown>
  providerRequestId?: string | null
}): Promise<GooglePmaxLaunch> {
  const payload = input.payload === undefined ? {} : input.payload
  const payloadJson = serializeSafePayload(payload)

  return transaction(async (db) => {
    const current = await getLockedLaunch(db, input.launchId, input.tenantId)
    if (current.state !== input.expectedState) {
      throw new GooglePmaxLaunchConflictError('LAUNCH_CONCURRENT_TRANSITION', 'Launch state changed before this transition was claimed.')
    }
    const decision = evaluateGooglePmaxLaunchTransition({
      from: current.state,
      to: input.toState,
      currentConfigVersion: current.configVersion,
      expectedConfigVersion: input.expectedConfigVersion,
      currentConfigHash: current.configHash,
      expectedConfigHash: input.expectedConfigHash,
      retryFromState: current.retryFromState
    })
    if (decision.ok === false) {
      if (decision.code === 'LAUNCH_APPROVAL_EVIDENCE_REQUIRED') {
        throw new GooglePmaxLaunchConflictError('LAUNCH_APPROVAL_CONFLICT', decision.message)
      }
      throw new GooglePmaxLaunchConflictError('LAUNCH_CONCURRENT_TRANSITION', decision.message)
    }

    const retryFromState = input.toState === 'FAILED_RETRYABLE'
      ? current.state as 'EXECUTING' | 'ENABLING'
      : null

    const updated = await db.query(
      `UPDATE campaign_launches
          SET state = $3,
              retry_from_state = $7
        WHERE id = $1::uuid
          AND tenant_id = $2::uuid
          AND state = $4
          AND config_version = $5
          AND config_hash = $6
      RETURNING ${LAUNCH_COLUMNS}`,
      [
        input.launchId,
        input.tenantId,
        input.toState,
        input.expectedState,
        input.expectedConfigVersion,
        input.expectedConfigHash,
        retryFromState
      ]
    )
    if (!updated.rows[0]) {
      throw new GooglePmaxLaunchConflictError('LAUNCH_CONCURRENT_TRANSITION', 'Launch transition compare-and-set failed.')
    }
    const launch = toLaunch(updated.rows[0])
    await insertEvent(db, {
      launch,
      eventType: input.eventType,
      fromState: current.state,
      toState: launch.state,
      actorId: input.actorId,
      payloadJson,
      providerRequestId: input.providerRequestId
    })
    return launch
  })
}

export async function approveGooglePmaxLaunch(input: {
  launchId: string
  tenantId: string
  approvalKind: 'create' | 'activate'
  expectedConfigVersion: number
  expectedConfigHash: string
  actorId: string
  reason: string
}): Promise<GooglePmaxLaunch> {
  const expectedState = input.approvalKind === 'create' ? 'READY_FOR_APPROVAL' : 'VERIFIED_PAUSED'
  const toState = input.approvalKind === 'create' ? 'APPROVED' : 'ACTIVATION_APPROVED'
  const eventType = input.approvalKind === 'create' ? 'CREATE_APPROVED' : 'ACTIVATION_APPROVED'

  try {
    return await transaction(async (db) => {
      const current = await getLockedLaunch(db, input.launchId, input.tenantId)
      const decision = evaluateGooglePmaxLaunchTransition({
        from: current.state,
        to: toState,
        currentConfigVersion: current.configVersion,
        expectedConfigVersion: input.expectedConfigVersion,
        currentConfigHash: current.configHash,
        expectedConfigHash: input.expectedConfigHash,
        authorization: input.approvalKind === 'create' ? 'create_approval' : 'activation_approval'
      })
      if (current.state !== expectedState || !decision.ok) {
        throw new GooglePmaxLaunchConflictError('LAUNCH_APPROVAL_CONFLICT', 'Approval is stale or invalid for the current launch state.')
      }

      await db.query(
        `INSERT INTO campaign_launch_approvals (
           launch_id, config_version, config_hash, approval_kind, approved_by, reason
         ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)
         RETURNING id`,
        [current.id, current.configVersion, current.configHash, input.approvalKind, input.actorId, input.reason]
      )

      const updated = await db.query(
        `UPDATE campaign_launches
            SET state = $3
          WHERE id = $1::uuid
            AND tenant_id = $2::uuid
            AND state = $4
            AND config_version = $5
            AND config_hash = $6
        RETURNING ${LAUNCH_COLUMNS}`,
        [current.id, current.tenantId, toState, expectedState, current.configVersion, current.configHash]
      )
      if (!updated.rows[0]) {
        throw new GooglePmaxLaunchConflictError('LAUNCH_APPROVAL_CONFLICT', 'Approval compare-and-set failed.')
      }
      const launch = toLaunch(updated.rows[0])
      await insertEvent(db, {
        launch,
        eventType,
        fromState: current.state,
        toState: launch.state,
        actorId: input.actorId,
        payloadJson: serializeSafePayload({ reasonRecorded: true })
      })
      return launch
    })
  } catch (error: unknown) {
    if (error instanceof GooglePmaxLaunchConflictError) throw error
    if ((error as { code?: string })?.code === '23505') {
      throw new GooglePmaxLaunchConflictError('LAUNCH_APPROVAL_CONFLICT', 'This approval was already recorded.')
    }
    throw error
  }
}
