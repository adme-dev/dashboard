import { z } from 'zod'

export const MeasurementEnvironmentSchema = z.enum(['test', 'live', 'paused'])
export const CollectionTierSchema = z.enum([
  'cloudflare_owned',
  'first_party_cname',
  'shared_endpoint',
  'backend_only'
])
export const ConsentModeSchema = z.enum(['off', 'au_optout', 'consent_gated'])
export const OutcomeAuthoritySchema = z.enum([
  'zero_native',
  'client_webhook',
  'connector_sync',
  'manual_import'
])
export const NativeLifecycleModeSchema = z.enum(['crm_preferred', 'leads_only'])
export const PortalOutcomeModeSchema = z.enum(['disabled', 'propose', 'authoritative'])

export const MeasurementPlatformSchema = z.enum(['meta', 'google_data_manager'])
export const CapabilityModeSchema = z.enum([
  'meta_pixel',
  'meta_web_capi',
  'meta_crm_capi',
  'meta_conversion_leads',
  'google_tag_enhanced_conversions',
  'google_enhanced_conversions_for_leads',
  'google_data_manager'
])
export const CapabilityStatusSchema = z.enum([
  'not_configured',
  'detected',
  'configured',
  'validating',
  'ready',
  'degraded',
  'blocked'
])
export const ManagementOriginSchema = z.enum(['zero', 'gtm', 'partner', 'external'])

export const CapabilityStateSchema = z.strictObject({
  mode: CapabilityModeSchema,
  status: CapabilityStatusSchema.default('not_configured'),
  managementOrigin: ManagementOriginSchema,
  canZeroMutate: z.boolean().default(false),
  evidenceAt: z.string().datetime({ offset: true }).nullable().default(null),
  blockingReason: z.string().trim().min(1).max(1000).nullable().default(null)
}).superRefine((capability, ctx) => {
  if (capability.managementOrigin !== 'zero' && capability.canZeroMutate) {
    ctx.addIssue({
      code: 'custom',
      path: ['canZeroMutate'],
      message: 'Only Zero-managed capabilities may be mutated by Zero'
    })
  }

  if (['ready', 'degraded'].includes(capability.status) && capability.evidenceAt === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['evidenceAt'],
      message: 'Ready and degraded capabilities require timestamped evidence'
    })
  }
})

export const ClientMeasurementProfileCreateSchema = z.strictObject({
  clientId: z.string().uuid(),
  enabled: z.boolean().default(false),
  environment: MeasurementEnvironmentSchema.default('test'),
  collectionTier: CollectionTierSchema.default('backend_only'),
  trackingSiteId: z.string().uuid().nullable().default(null),
  firstPartyHostname: z.string().trim().min(1).max(253).toLowerCase().nullable().default(null),
  hostnameStatus: z.enum(['not_required', 'pending', 'active', 'error']).default('not_required'),
  consentMode: ConsentModeSchema.default('consent_gated'),
  vertical: z.string().trim().min(1).max(100),
  outcomeAuthority: OutcomeAuthoritySchema.default('zero_native'),
  nativeLifecycleMode: NativeLifecycleModeSchema.default('crm_preferred'),
  portalOutcomeMode: PortalOutcomeModeSchema.default('disabled')
})

const OpaqueCredentialRefSchema = z.string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9/_:.-]*$/, 'Invalid credential reference')

export const ConversionDestinationCreateSchema = z.strictObject({
  profileId: z.string().uuid(),
  platform: MeasurementPlatformSchema,
  socialConnectionId: z.string().uuid().nullable().default(null),
  externalDestinationId: z.string().trim().min(1).max(255),
  credentialRef: OpaqueCredentialRefSchema.nullable().default(null),
  enabled: z.boolean().default(false),
  environment: MeasurementEnvironmentSchema.default('test'),
  capabilities: z.array(CapabilityStateSchema).min(1).max(CapabilityModeSchema.options.length)
}).superRefine((destination, ctx) => {
  const seen = new Set<string>()
  destination.capabilities.forEach((capability, index) => {
    if (seen.has(capability.mode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities', index, 'mode'],
        message: 'Capability modes must be unique within a destination'
      })
    }
    seen.add(capability.mode)

    const belongsToPlatform = destination.platform === 'meta'
      ? capability.mode.startsWith('meta_')
      : capability.mode.startsWith('google_')
    if (!belongsToPlatform) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities', index, 'mode'],
        message: 'Capability mode does not belong to the destination platform'
      })
    }
  })
})

export const CanonicalEventNameSchema = z.enum([
  'lead_created',
  'lead_contacted',
  'lead_qualified',
  'lead_won',
  'lead_lost',
  'purchase',
  'web_conversion'
])
export const CanonicalEventSourceSystemSchema = z.enum([
  'browser',
  'zero_lead',
  'zero_crm',
  'client_webhook',
  'connector_sync',
  'manual_import'
])
export const CanonicalEventSourceEntitySchema = z.enum([
  'tracking_event',
  'lead',
  'crm_opportunity',
  'external_lead'
])

const CanonicalAttributionSchema = z.strictObject({
  browserEventId: z.string().trim().min(1).max(128).nullable().default(null),
  metaLeadId: z.string().regex(/^\d{15,16}$/, 'Meta lead ID must contain 15 or 16 digits').nullable().default(null),
  gclid: z.string().trim().min(1).max(512).nullable().default(null),
  gbraid: z.string().trim().min(1).max(512).nullable().default(null),
  wbraid: z.string().trim().min(1).max(512).nullable().default(null)
})

const EMPTY_CANONICAL_ATTRIBUTION = {
  browserEventId: null,
  metaLeadId: null,
  gclid: null,
  gbraid: null,
  wbraid: null
}

export const CanonicalConversionEventSchema = z.strictObject({
  eventId: z.string().uuid(),
  clientId: z.string().uuid(),
  eventName: CanonicalEventNameSchema,
  sourceSystem: CanonicalEventSourceSystemSchema,
  sourceEntityType: CanonicalEventSourceEntitySchema,
  sourceEntityId: z.string().trim().min(1).max(255),
  sourceEventId: z.string().trim().min(1).max(255),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().trim().min(1).max(512),
  configVersion: z.number().int().positive(),
  consentMode: ConsentModeSchema,
  attribution: CanonicalAttributionSchema.default(EMPTY_CANONICAL_ATTRIBUTION)
})

export type ClientMeasurementProfileCreate = z.infer<typeof ClientMeasurementProfileCreateSchema>
export type ConversionDestinationCreate = z.infer<typeof ConversionDestinationCreateSchema>
export type CapabilityState = z.infer<typeof CapabilityStateSchema>
export type CanonicalConversionEvent = z.infer<typeof CanonicalConversionEventSchema>
