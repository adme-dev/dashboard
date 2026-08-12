import { z } from 'zod'
import type { GooglePmaxDecisionEvidence } from '~~/server/utils/googlePmaxDecisionEvidence'
import { serializeCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'

export class GooglePmaxDecisionEvidenceStoreError extends Error {
  constructor(
    public readonly code: 'PMAX_EVIDENCE_INVALID' | 'PMAX_EVIDENCE_LAUNCH_IDENTITY_MISMATCH',
    message: string
  ) {
    super(message)
    this.name = 'GooglePmaxDecisionEvidenceStoreError'
  }
}

const StoredRowSchema = z.strictObject({
  id: z.string().uuid(),
  evidence_hash: z.string().regex(/^[a-f0-9]{64}$/),
  collected_at: z.preprocess(
    value => value instanceof Date ? value.toISOString() : value,
    z.string().datetime({ offset: true })
  )
})

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>
}

async function validateEvidence(
  input: GooglePmaxDecisionEvidence,
  build: (input: Pick<GooglePmaxDecisionEvidence, 'identity' | 'collectedAt' | 'sections'>) => Promise<GooglePmaxDecisionEvidence>
): Promise<{
  evidence: GooglePmaxDecisionEvidence
  serialized: string
}> {
  try {
    const rebuilt = await build({
      identity: input.identity,
      collectedAt: input.collectedAt,
      sections: input.sections
    })
    const serialized = serializeCanonicalLaunchJson(rebuilt)
    if (serialized !== serializeCanonicalLaunchJson(input)) {
      throw new Error('Evidence contains fields that do not match its canonical derivation.')
    }
    return { evidence: rebuilt, serialized }
  } catch {
    throw new GooglePmaxDecisionEvidenceStoreError(
      'PMAX_EVIDENCE_INVALID',
      'Google PMax decision evidence is not a valid canonical snapshot.'
    )
  }
}

function result(rowValue: unknown, isReplay: boolean) {
  const row = StoredRowSchema.parse(rowValue)
  return {
    id: row.id,
    evidenceHash: row.evidence_hash,
    collectedAt: row.collected_at,
    isReplay
  }
}

async function persistWithDb(input: {
  launchId: string
  tenantId: string
  actorId: string
  evidence: GooglePmaxDecisionEvidence
}, db: Queryable, validated: Awaited<ReturnType<typeof validateEvidence>>) {
  const identity = validated.evidence.identity
  const inserted = await db.query(
    `INSERT INTO campaign_launch_evidence_snapshots (
       launch_id, config_version, config_hash, evidence_hash,
       snapshot, collected_at, created_by
     )
     SELECT launch.id, launch.config_version, launch.config_hash, $7,
            $8::jsonb, $9::timestamptz, $10::uuid
       FROM campaign_launches launch
      WHERE launch.id = $1::uuid
        AND launch.tenant_id = $2::uuid
        AND launch.client_id = $3::uuid
        AND launch.brief_id = $4::uuid
        AND launch.config_version = $5
        AND launch.config_hash = $6
     ON CONFLICT (launch_id, config_version, config_hash, evidence_hash) DO NOTHING
     RETURNING id, evidence_hash, collected_at`,
    [
      input.launchId,
      input.tenantId,
      identity.clientId,
      identity.briefId,
      identity.configVersion,
      identity.configHash,
      validated.evidence.evidenceHash,
      validated.serialized,
      validated.evidence.collectedAt,
      input.actorId
    ]
  )
  if (inserted.rows[0]) return result(inserted.rows[0], false)

  const existing = await db.query(
    `SELECT snapshot.id, snapshot.evidence_hash, snapshot.collected_at
       FROM campaign_launch_evidence_snapshots snapshot
       JOIN campaign_launches launch ON launch.id = snapshot.launch_id
      WHERE snapshot.launch_id = $1::uuid
        AND launch.tenant_id = $2::uuid
        AND snapshot.config_version = $3
        AND snapshot.config_hash = $4
        AND snapshot.evidence_hash = $5
      LIMIT 1`,
    [
      input.launchId,
      input.tenantId,
      identity.configVersion,
      identity.configHash,
      validated.evidence.evidenceHash
    ]
  )
  if (existing.rows[0]) return result(existing.rows[0], true)

  throw new GooglePmaxDecisionEvidenceStoreError(
    'PMAX_EVIDENCE_LAUNCH_IDENTITY_MISMATCH',
    'Decision evidence does not match the current tenant-scoped launch identity.'
  )
}

export async function persistGooglePmaxDecisionEvidence(input: {
  launchId: string
  tenantId: string
  actorId: string
  evidence: GooglePmaxDecisionEvidence
}, dependencies: {
  build: (input: Pick<GooglePmaxDecisionEvidence, 'identity' | 'collectedAt' | 'sections'>) => Promise<GooglePmaxDecisionEvidence>
  transaction: <T>(callback: (db: Queryable) => Promise<T>) => Promise<T>
}) {
  const validated = await validateEvidence(input.evidence, dependencies.build)
  return dependencies.transaction(db => persistWithDb(input, db, validated))
}
