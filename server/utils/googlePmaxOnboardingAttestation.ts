import { queryRows, transaction } from '~~/server/utils/db'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import type { GooglePmaxOnboardingEvidence } from '~~/server/utils/googlePmaxOnboarding'
import {
  createGooglePmaxRemoteDecisionEngine,
  GooglePmaxRemoteDecisionError
} from '~~/server/utils/googlePmaxRemoteDecisionEngine'

export interface GooglePmaxOnboardingAttestation {
  id: string
  launchId: string
  configVersion: number
  configHash: string
  snapshotHash: string
  evidence: GooglePmaxOnboardingEvidence
  reason: string
  attestedBy: string
  attestedAt: string
  expiresAt: string
  createdAt: string
  active: boolean
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
}

interface AttestationPolicy {
  prepareAttestation(input: {
    launchId: string
    configVersion: number
    configHash: string
    config: GooglePmaxInventoryLaunchConfig
    evidence: unknown
  }): Promise<{ evidence: GooglePmaxOnboardingEvidence, snapshotHash: string, serializedSnapshot: string }>
  parseAttestation(row: Record<string, unknown>, now: string): Promise<GooglePmaxOnboardingAttestation>
}

export class GooglePmaxOnboardingAttestationError extends Error {
  constructor(public readonly code:
    | 'PMAX_ONBOARDING_ATTESTATION_INVALID'
    | 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH'
    | 'PMAX_ONBOARDING_ATTESTATION_STATE_INVALID') {
    super('Google PMax onboarding attestation could not be recorded.')
    this.name = 'GooglePmaxOnboardingAttestationError'
  }
}

function remotePolicy(): AttestationPolicy {
  return createGooglePmaxRemoteDecisionEngine(useEvent())
}

async function parseRow(
  value: unknown,
  now: Date,
  policy: AttestationPolicy
): Promise<GooglePmaxOnboardingAttestation> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GooglePmaxOnboardingAttestationError('PMAX_ONBOARDING_ATTESTATION_INVALID')
  }
  try {
    return await policy.parseAttestation(value as Record<string, unknown>, now.toISOString())
  } catch (error) {
    const code = error instanceof GooglePmaxRemoteDecisionError
      && error.code === 'PMAX_ONBOARDING_ATTESTATION_INVALID'
      ? 'PMAX_ONBOARDING_ATTESTATION_INVALID'
      : 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH'
    throw new GooglePmaxOnboardingAttestationError(code)
  }
}

const COLUMNS = `id, launch_id, config_version, config_hash, snapshot_hash,
  snapshot, reason, attested_by, attested_at, expires_at, created_at`
const SELECT_COLUMNS = `attestation.id, attestation.launch_id, attestation.config_version,
  attestation.config_hash, attestation.snapshot_hash, attestation.snapshot,
  attestation.reason, attestation.attested_by, attestation.attested_at,
  attestation.expires_at, attestation.created_at`

export async function createGooglePmaxOnboardingAttestation(input: {
  launchId: string
  tenantId: string
  actorId: string
  configVersion: number
  configHash: string
  config: GooglePmaxInventoryLaunchConfig
  evidence: unknown
  reason: string
  now?: () => Date
}, policy: AttestationPolicy = remotePolicy()): Promise<{ attestation: GooglePmaxOnboardingAttestation, isReplay: boolean }> {
  const now = input.now || (() => new Date())
  const attestedAt = now()
  const reason = input.reason.trim()
  if (reason.length < 20 || reason.length > 2000) {
    throw new GooglePmaxOnboardingAttestationError('PMAX_ONBOARDING_ATTESTATION_INVALID')
  }
  let prepared: Awaited<ReturnType<AttestationPolicy['prepareAttestation']>>
  try {
    prepared = await policy.prepareAttestation({
      launchId: input.launchId,
      configVersion: input.configVersion,
      configHash: input.configHash,
      config: input.config,
      evidence: input.evidence
    })
  } catch (error) {
    const code = error instanceof GooglePmaxRemoteDecisionError
      && error.code === 'PMAX_ONBOARDING_ATTESTATION_INVALID'
      ? 'PMAX_ONBOARDING_ATTESTATION_INVALID'
      : 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH'
    throw new GooglePmaxOnboardingAttestationError(code)
  }
  const expiresAt = new Date(attestedAt.getTime() + 30 * 24 * 60 * 60 * 1000)

  return transaction(async (db) => {
    const queryable = db as unknown as Queryable
    const inserted = await queryable.query(
      `INSERT INTO campaign_launch_onboarding_attestations (
         launch_id, config_version, config_hash, snapshot_hash, snapshot,
         reason, attested_by, attested_at, expires_at
       )
       SELECT launch.id, launch.config_version, launch.config_hash, $7, $8::jsonb,
              $9, $10::uuid, $11::timestamptz, $12::timestamptz
         FROM campaign_launches launch
        WHERE launch.id = $1::uuid
          AND launch.tenant_id = $2::uuid
          AND launch.client_id = $3::uuid
          AND launch.connection_id = $4::uuid
          AND launch.config_version = $5
          AND launch.config_hash = $6
          AND launch.state IN ('DRAFT', 'PREFLIGHT_FAILED')
       ON CONFLICT (launch_id, config_version, config_hash, snapshot_hash, attested_by) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        input.launchId,
        input.tenantId,
        input.config.clientId,
        input.config.connectionId,
        input.configVersion,
        input.configHash,
        prepared.snapshotHash,
        prepared.serializedSnapshot,
        reason,
        input.actorId,
        attestedAt.toISOString(),
        expiresAt.toISOString()
      ]
    )
    if (inserted.rows[0]) {
      return { attestation: await parseRow(inserted.rows[0], attestedAt, policy), isReplay: false }
    }

    const existing = await queryable.query(
      `SELECT ${SELECT_COLUMNS}
         FROM campaign_launch_onboarding_attestations attestation
         JOIN campaign_launches launch ON launch.id = attestation.launch_id
        WHERE attestation.launch_id = $1::uuid
          AND launch.tenant_id = $2::uuid
          AND attestation.config_version = $3
          AND attestation.config_hash = $4
          AND attestation.snapshot_hash = $5
          AND attestation.attested_by = $6::uuid
        LIMIT 1`,
      [input.launchId, input.tenantId, input.configVersion, input.configHash, prepared.snapshotHash, input.actorId]
    )
    if (existing.rows[0]) {
      return { attestation: await parseRow(existing.rows[0], attestedAt, policy), isReplay: true }
    }
    throw new GooglePmaxOnboardingAttestationError('PMAX_ONBOARDING_ATTESTATION_STATE_INVALID')
  })
}

export async function getLatestGooglePmaxOnboardingAttestation(input: {
  launchId: string
  tenantId: string
  configVersion: number
  configHash: string
  activeOnly?: boolean
  now?: () => Date
}, policy: AttestationPolicy = remotePolicy()): Promise<GooglePmaxOnboardingAttestation | null> {
  const now = input.now || (() => new Date())
  const readAt = now()
  const rows = await queryRows(
    `SELECT ${SELECT_COLUMNS}
       FROM campaign_launch_onboarding_attestations attestation
       JOIN campaign_launches launch ON launch.id = attestation.launch_id
      WHERE attestation.launch_id = $1::uuid
        AND launch.tenant_id = $2::uuid
        AND attestation.config_version = $3
        AND attestation.config_hash = $4
        ${input.activeOnly === false ? '' : 'AND attestation.expires_at > $5::timestamptz'}
      ORDER BY attestation.attested_at DESC, attestation.id DESC
      LIMIT 1`,
    input.activeOnly === false
      ? [input.launchId, input.tenantId, input.configVersion, input.configHash]
      : [input.launchId, input.tenantId, input.configVersion, input.configHash, readAt.toISOString()]
  )
  return rows[0] ? parseRow(rows[0], readAt, policy) : null
}
