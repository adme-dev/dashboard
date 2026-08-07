import { z } from 'zod'
import { queryRows, transaction } from '~~/server/utils/db'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import {
  hashCanonicalLaunchJson,
  serializeCanonicalLaunchJson
} from '~~/server/utils/googlePmaxLaunchHash'
import type { GooglePmaxOnboardingEvidence } from '~~/server/utils/googlePmaxOnboarding'

const IdSchema = z.string().trim().min(1).max(255)
const OptionalIdSchema = IdSchema.nullable()
const StoreCodeSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/)

export const GooglePmaxOnboardingEvidenceSchema = z.strictObject({
  countryCode: z.string().trim().length(2).transform(value => value.toUpperCase()),
  platform: z.strictObject({
    googleCloudProjectId: OptionalIdSchema,
    oauth: z.strictObject({
      clientConfigured: z.boolean(),
      consentScreenConfigured: z.boolean(),
      offlineAccessGranted: z.boolean(),
      googleAdsScopeGranted: z.boolean(),
      merchantScopeGranted: z.boolean(),
      businessProfileScopeGranted: z.boolean()
    }),
    googleAdsApi: z.strictObject({
      enabled: z.boolean(),
      developerTokenAccess: z.enum(['standard', 'basic', 'explorer', 'test', 'pending', 'missing'])
    }),
    merchantApi: z.strictObject({
      enabled: z.boolean(),
      createAndConfigureAccess: z.boolean(),
      providerAccountId: OptionalIdSchema
    }),
    businessProfileApis: z.strictObject({
      enabled: z.boolean(),
      access: z.enum(['approved', 'pending', 'not_requested', 'rejected'])
    })
  }),
  googleAds: z.strictObject({
    customerId: OptionalIdSchema,
    managerCustomerId: OptionalIdSchema,
    status: z.enum(['active', 'inactive', 'missing']),
    adminAccess: z.boolean(),
    apiAccess: z.boolean(),
    clientAccountCreationEligible: z.boolean(),
    currencyCode: z.string().trim().length(3).nullable().transform(value => value?.toUpperCase() || null),
    timeZone: z.string().trim().min(1).max(100).nullable(),
    billingStatus: z.enum(['active', 'pending', 'missing']),
    policyStatus: z.enum(['clear', 'under_review', 'restricted', 'suspended', 'unknown'])
  }),
  merchant: z.strictObject({
    accountId: OptionalIdSchema,
    status: z.enum(['active', 'inactive', 'missing']),
    adminAccess: z.boolean(),
    apiAccess: z.boolean(),
    clientAdminPresent: z.boolean(),
    termsOfService: z.enum(['accepted', 'not_accepted', 'unknown']),
    businessInformation: z.enum(['complete', 'incomplete', 'missing']),
    homepage: z.enum(['claimed', 'verified', 'unverified', 'conflict', 'missing'])
  }),
  businessProfile: z.strictObject({
    accountId: OptionalIdSchema,
    locationId: OptionalIdSchema,
    storeCode: StoreCodeSchema.nullable(),
    verified: z.boolean(),
    apiAccess: z.boolean(),
    accessRole: z.enum(['owner', 'manager', 'none']),
    locationStatus: z.enum(['active', 'temporarily_closed', 'permanently_closed', 'missing']),
    duplicateCheck: z.enum(['clear', 'possible', 'duplicate', 'unknown']),
    physicalStoreConfirmed: z.boolean()
  }),
  dealershipLocations: z.strictObject({
    source: z.enum(['business_profile', 'store_data_source']),
    storeDataSourceId: OptionalIdSchema,
    storeDataSourceStatus: z.enum(['active', 'inactive', 'missing', 'not_used']),
    storeCodes: z.array(StoreCodeSchema).max(200)
  }),
  feed: z.strictObject({
    storeCodes: z.array(StoreCodeSchema).max(200),
    destination: z.enum(['VEHICLE_ADS_ONLY', 'SHOPPING_ADS', 'FREE_LISTINGS', 'UNKNOWN'])
  }),
  links: z.strictObject({
    adsToMerchant: z.enum(['active', 'pending', 'missing']),
    merchantToBusinessProfile: z.enum(['active', 'pending', 'missing'])
  }),
  vehicleAds: z.strictObject({
    addon: z.enum(['enabled', 'pending', 'not_enabled', 'unavailable']),
    dealershipLicenseReview: z.enum(['approved', 'pending', 'not_started', 'rejected']),
    websiteReview: z.enum(['approved', 'pending', 'not_started', 'failed']),
    accountStateScope: z.enum(['single_state', 'multi_state', 'unknown'])
  })
})

const IdentitySchema = z.strictObject({
  launchId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  configHash: z.string().regex(/^[a-f0-9]{64}$/)
})

const SnapshotCoreSchema = z.strictObject({
  schemaVersion: z.literal(1),
  identity: IdentitySchema,
  evidence: GooglePmaxOnboardingEvidenceSchema
})

const SnapshotSchema = SnapshotCoreSchema.extend({
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/)
})

const TimestampSchema = z.preprocess(
  value => value instanceof Date ? value.toISOString() : value,
  z.string().datetime({ offset: true })
)

const RowSchema = z.strictObject({
  id: z.string().uuid(),
  launch_id: z.string().uuid(),
  config_version: z.number().int().positive(),
  config_hash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: SnapshotSchema,
  reason: z.string(),
  attested_by: z.string().uuid(),
  attested_at: TimestampSchema,
  expires_at: TimestampSchema,
  created_at: TimestampSchema
})

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

export class GooglePmaxOnboardingAttestationError extends Error {
  constructor(public readonly code:
    | 'PMAX_ONBOARDING_ATTESTATION_INVALID'
    | 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH'
    | 'PMAX_ONBOARDING_ATTESTATION_STATE_INVALID') {
    super('Google PMax onboarding attestation could not be recorded.')
    this.name = 'GooglePmaxOnboardingAttestationError'
  }
}

function digits(value: string | null): string | null {
  return value ? value.replace(/[\s-]/g, '') : null
}

function validateEvidence(
  config: GooglePmaxInventoryLaunchConfig,
  value: unknown
): GooglePmaxOnboardingEvidence {
  const parsed = GooglePmaxOnboardingEvidenceSchema.safeParse(value)
  if (!parsed.success) {
    throw new GooglePmaxOnboardingAttestationError('PMAX_ONBOARDING_ATTESTATION_INVALID')
  }
  if (
    parsed.data.countryCode !== 'AU'
    || digits(parsed.data.googleAds.customerId) !== config.customerId
    || digits(parsed.data.merchant.accountId) !== config.merchantCenterId
    || (parsed.data.googleAds.currencyCode && parsed.data.googleAds.currencyCode !== config.budget.currency)
  ) {
    throw new GooglePmaxOnboardingAttestationError('PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH')
  }
  return parsed.data
}

function snapshot(input: {
  launchId: string
  configVersion: number
  configHash: string
  evidence: GooglePmaxOnboardingEvidence
}) {
  const core = SnapshotCoreSchema.parse({
    schemaVersion: 1,
    identity: {
      launchId: input.launchId,
      configVersion: input.configVersion,
      configHash: input.configHash
    },
    evidence: input.evidence
  })
  return SnapshotSchema.parse({
    ...core,
    snapshotHash: hashCanonicalLaunchJson(core)
  })
}

function toAttestation(value: unknown, now: Date): GooglePmaxOnboardingAttestation {
  const row = RowSchema.parse(value)
  const core = SnapshotCoreSchema.parse({
    schemaVersion: row.snapshot.schemaVersion,
    identity: row.snapshot.identity,
    evidence: row.snapshot.evidence
  })
  if (
    row.snapshot_hash !== row.snapshot.snapshotHash
    || row.snapshot_hash !== hashCanonicalLaunchJson(core)
    || row.launch_id !== row.snapshot.identity.launchId
    || row.config_version !== row.snapshot.identity.configVersion
    || row.config_hash !== row.snapshot.identity.configHash
  ) {
    throw new GooglePmaxOnboardingAttestationError('PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH')
  }
  return {
    id: row.id,
    launchId: row.launch_id,
    configVersion: row.config_version,
    configHash: row.config_hash,
    snapshotHash: row.snapshot_hash,
    evidence: row.snapshot.evidence,
    reason: row.reason,
    attestedBy: row.attested_by,
    attestedAt: row.attested_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    active: new Date(row.expires_at).getTime() > now.getTime()
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
}): Promise<{ attestation: GooglePmaxOnboardingAttestation, isReplay: boolean }> {
  const now = input.now || (() => new Date())
  const attestedAt = now()
  const reason = input.reason.trim()
  if (reason.length < 20 || reason.length > 2000) {
    throw new GooglePmaxOnboardingAttestationError('PMAX_ONBOARDING_ATTESTATION_INVALID')
  }
  if (
    input.config.briefVersion !== input.configVersion
    || hashCanonicalLaunchJson(input.config) !== input.configHash
  ) {
    throw new GooglePmaxOnboardingAttestationError('PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH')
  }
  const evidence = validateEvidence(input.config, input.evidence)
  const value = snapshot({
    launchId: input.launchId,
    configVersion: input.configVersion,
    configHash: input.configHash,
    evidence
  })
  const serialized = serializeCanonicalLaunchJson(value)
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
        value.snapshotHash,
        serialized,
        reason,
        input.actorId,
        attestedAt.toISOString(),
        expiresAt.toISOString()
      ]
    )
    if (inserted.rows[0]) return { attestation: toAttestation(inserted.rows[0], attestedAt), isReplay: false }

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
      [input.launchId, input.tenantId, input.configVersion, input.configHash, value.snapshotHash, input.actorId]
    )
    if (existing.rows[0]) return { attestation: toAttestation(existing.rows[0], attestedAt), isReplay: true }
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
}): Promise<GooglePmaxOnboardingAttestation | null> {
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
  return rows[0] ? toAttestation(rows[0], readAt) : null
}
