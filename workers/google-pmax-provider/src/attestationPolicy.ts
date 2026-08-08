import { z } from 'zod'
import type { GooglePmaxInventoryLaunchConfig } from './contracts'
import type { GooglePmaxOnboardingEvidence } from '../../../server/utils/googlePmaxOnboarding'
import {
  hashCanonicalLaunchJson,
  serializeCanonicalLaunchJson
} from '../../../server/utils/googlePmaxLaunchHash'

const IdSchema = z.string().trim().min(1).max(255)
const OptionalIdSchema = IdSchema.nullable()
const StoreCodeSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/)

const EvidenceSchema = z.strictObject({
  countryCode: z.string().trim().length(2).transform(value => value.toUpperCase()),
  platform: z.strictObject({
    googleCloudProjectId: OptionalIdSchema,
    oauth: z.strictObject({
      clientConfigured: z.boolean(), consentScreenConfigured: z.boolean(), offlineAccessGranted: z.boolean(),
      googleAdsScopeGranted: z.boolean(), merchantScopeGranted: z.boolean(), businessProfileScopeGranted: z.boolean()
    }),
    googleAdsApi: z.strictObject({
      enabled: z.boolean(), developerTokenAccess: z.enum(['standard', 'basic', 'explorer', 'test', 'pending', 'missing'])
    }),
    merchantApi: z.strictObject({ enabled: z.boolean(), createAndConfigureAccess: z.boolean(), providerAccountId: OptionalIdSchema }),
    businessProfileApis: z.strictObject({ enabled: z.boolean(), access: z.enum(['approved', 'pending', 'not_requested', 'rejected']) })
  }),
  googleAds: z.strictObject({
    customerId: OptionalIdSchema, managerCustomerId: OptionalIdSchema, status: z.enum(['active', 'inactive', 'missing']),
    adminAccess: z.boolean(), apiAccess: z.boolean(), clientAccountCreationEligible: z.boolean(),
    currencyCode: z.string().trim().length(3).nullable().transform(value => value?.toUpperCase() || null),
    timeZone: z.string().trim().min(1).max(100).nullable(), billingStatus: z.enum(['active', 'pending', 'missing']),
    policyStatus: z.enum(['clear', 'under_review', 'restricted', 'suspended', 'unknown'])
  }),
  merchant: z.strictObject({
    accountId: OptionalIdSchema, status: z.enum(['active', 'inactive', 'missing']), adminAccess: z.boolean(),
    apiAccess: z.boolean(), clientAdminPresent: z.boolean(), termsOfService: z.enum(['accepted', 'not_accepted', 'unknown']),
    businessInformation: z.enum(['complete', 'incomplete', 'missing']), homepage: z.enum(['claimed', 'verified', 'unverified', 'conflict', 'missing'])
  }),
  businessProfile: z.strictObject({
    accountId: OptionalIdSchema, locationId: OptionalIdSchema, storeCode: StoreCodeSchema.nullable(), verified: z.boolean(),
    apiAccess: z.boolean(), accessRole: z.enum(['owner', 'manager', 'none']),
    locationStatus: z.enum(['active', 'temporarily_closed', 'permanently_closed', 'missing']),
    duplicateCheck: z.enum(['clear', 'possible', 'duplicate', 'unknown']), physicalStoreConfirmed: z.boolean()
  }),
  dealershipLocations: z.strictObject({
    source: z.enum(['business_profile', 'store_data_source']), storeDataSourceId: OptionalIdSchema,
    storeDataSourceStatus: z.enum(['active', 'inactive', 'missing', 'not_used']), storeCodes: z.array(StoreCodeSchema).max(200)
  }),
  feed: z.strictObject({
    storeCodes: z.array(StoreCodeSchema).max(200), destination: z.enum(['VEHICLE_ADS_ONLY', 'SHOPPING_ADS', 'FREE_LISTINGS', 'UNKNOWN'])
  }),
  links: z.strictObject({
    adsToMerchant: z.enum(['active', 'pending', 'missing']), merchantToBusinessProfile: z.enum(['active', 'pending', 'missing'])
  }),
  vehicleAds: z.strictObject({
    addon: z.enum(['enabled', 'pending', 'not_enabled', 'unavailable']),
    dealershipLicenseReview: z.enum(['approved', 'pending', 'not_started', 'rejected']),
    websiteReview: z.enum(['approved', 'pending', 'not_started', 'failed']),
    accountStateScope: z.enum(['single_state', 'multi_state', 'unknown'])
  })
})

const IdentitySchema = z.strictObject({
  launchId: z.string().uuid(), configVersion: z.number().int().positive(), configHash: z.string().regex(/^[a-f0-9]{64}$/)
})
const SnapshotCoreSchema = z.strictObject({ schemaVersion: z.literal(1), identity: IdentitySchema, evidence: EvidenceSchema })
const SnapshotSchema = SnapshotCoreSchema.extend({ snapshotHash: z.string().regex(/^[a-f0-9]{64}$/) })
const TimestampSchema = z.preprocess(
  value => value instanceof Date ? value.toISOString() : value,
  z.string().datetime({ offset: true })
)
const RowSchema = z.strictObject({
  id: z.string().uuid(), launch_id: z.string().uuid(), config_version: z.number().int().positive(),
  config_hash: z.string().regex(/^[a-f0-9]{64}$/), snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: SnapshotSchema, reason: z.string(), attested_by: z.string().uuid(), attested_at: TimestampSchema,
  expires_at: TimestampSchema, created_at: TimestampSchema
})

function digits(value: string | null): string | null {
  return value ? value.replace(/[\s-]/g, '') : null
}

export class AttestationPolicyError extends Error {
  constructor(public readonly code: 'PMAX_ONBOARDING_ATTESTATION_INVALID' | 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH') {
    super(code)
  }
}

export function prepareAttestation(input: {
  launchId: string
  configVersion: number
  configHash: string
  config: GooglePmaxInventoryLaunchConfig
  evidence: unknown
}) {
  const parsed = EvidenceSchema.safeParse(input.evidence)
  if (!parsed.success) throw new AttestationPolicyError('PMAX_ONBOARDING_ATTESTATION_INVALID')
  const evidence = parsed.data as GooglePmaxOnboardingEvidence
  if (
    evidence.countryCode !== 'AU'
    || digits(evidence.googleAds.customerId) !== input.config.customerId
    || digits(evidence.merchant.accountId) !== input.config.merchantCenterId
    || (evidence.googleAds.currencyCode && evidence.googleAds.currencyCode !== input.config.budget.currency)
    || input.config.briefVersion !== input.configVersion
    || hashCanonicalLaunchJson(input.config) !== input.configHash
  ) throw new AttestationPolicyError('PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH')
  const core = SnapshotCoreSchema.parse({
    schemaVersion: 1,
    identity: { launchId: input.launchId, configVersion: input.configVersion, configHash: input.configHash },
    evidence
  })
  const snapshot = SnapshotSchema.parse({ ...core, snapshotHash: hashCanonicalLaunchJson(core) })
  return {
    evidence,
    snapshotHash: snapshot.snapshotHash,
    serializedSnapshot: serializeCanonicalLaunchJson(snapshot)
  }
}

export function parseAttestationRow(value: unknown, now: string) {
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
  ) throw new AttestationPolicyError('PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH')
  return {
    id: row.id, launchId: row.launch_id, configVersion: row.config_version, configHash: row.config_hash,
    snapshotHash: row.snapshot_hash, evidence: row.snapshot.evidence as GooglePmaxOnboardingEvidence,
    reason: row.reason, attestedBy: row.attested_by, attestedAt: row.attested_at,
    expiresAt: row.expires_at, createdAt: row.created_at,
    active: new Date(row.expires_at).getTime() > new Date(now).getTime()
  }
}
