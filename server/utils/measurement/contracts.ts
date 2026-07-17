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
export const CanonicalEventNameSchema = z.enum([
  'lead_created',
  'lead_contacted',
  'lead_qualified',
  'lead_won',
  'lead_lost',
  'purchase',
  'web_conversion'
])

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

export const ClientMeasurementProfilePatchSchema = z.strictObject({
  enabled: z.boolean().optional(),
  environment: MeasurementEnvironmentSchema.optional(),
  collectionTier: CollectionTierSchema.optional(),
  trackingSiteId: z.string().uuid().nullable().optional(),
  firstPartyHostname: z.string().trim().min(1).max(253).toLowerCase().nullable().optional(),
  hostnameStatus: z.enum(['not_required', 'pending', 'active', 'error']).optional(),
  consentMode: ConsentModeSchema.optional(),
  vertical: z.string().trim().min(1).max(100).optional(),
  outcomeAuthority: OutcomeAuthoritySchema.optional(),
  nativeLifecycleMode: NativeLifecycleModeSchema.optional(),
  portalOutcomeMode: PortalOutcomeModeSchema.optional()
}).refine(patch => Object.keys(patch).length > 0, {
  message: 'At least one profile field must change'
})

export const MeasurementActorSchema = z.strictObject({
  type: z.enum(['team_member', 'client_user', 'system', 'import']),
  id: z.string().trim().min(1).max(255).nullable().default(null)
})

export const UpdateClientMeasurementProfileSchema = z.strictObject({
  clientId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  actor: MeasurementActorSchema,
  patch: ClientMeasurementProfilePatchSchema
})

export const ClientMeasurementProfileStateSchema = ClientMeasurementProfileCreateSchema.extend({
  id: z.string().uuid(),
  configVersion: z.number().int().positive(),
  cacheStatus: z.enum(['not_published', 'fresh', 'stale', 'error']),
  cacheVersion: z.number().int().positive().nullable(),
  cacheErrorClass: z.string().trim().min(1).max(255).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
}).superRefine((profile, ctx) => {
  if (profile.portalOutcomeMode === 'authoritative' && profile.outcomeAuthority !== 'zero_native') {
    ctx.addIssue({
      code: 'custom',
      path: ['portalOutcomeMode'],
      message: 'Authoritative portal outcomes require Zero-native lifecycle authority'
    })
  }
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

export const OperatorCapabilityStatusSchema = z.enum([
  'not_configured',
  'configured',
  'blocked'
])

export const DestinationCapabilityConfigurationSchema = z.strictObject({
  mode: CapabilityModeSchema,
  status: OperatorCapabilityStatusSchema.default('not_configured'),
  managementOrigin: ManagementOriginSchema,
  canZeroMutate: z.boolean().default(false),
  blockingReason: z.string().trim().min(1).max(1000).nullable().default(null)
}).superRefine((capability, ctx) => {
  if (capability.managementOrigin !== 'zero' && capability.canZeroMutate) {
    ctx.addIssue({
      code: 'custom',
      path: ['canZeroMutate'],
      message: 'Only Zero-managed capabilities may be mutated by Zero'
    })
  }
  if (capability.status === 'blocked' && capability.blockingReason === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'Blocked capabilities require a reason'
    })
  }
  if (capability.status !== 'blocked' && capability.blockingReason !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'Only blocked capabilities may include a blocking reason'
    })
  }
})

export const ConversionEventMappingConfigurationSchema = z.strictObject({
  canonicalEventName: CanonicalEventNameSchema,
  providerEventName: z.string().trim().min(1).max(255),
  isActive: z.boolean().default(false)
})

const DestinationConfigurationInputSchema = z.strictObject({
  platform: MeasurementPlatformSchema,
  socialConnectionId: z.string().uuid().nullable().default(null),
  externalDestinationId: z.string().trim().min(1).max(255),
  credentialRef: OpaqueCredentialRefSchema.nullable().default(null),
  capabilities: z.array(DestinationCapabilityConfigurationSchema)
    .min(1)
    .max(CapabilityModeSchema.options.length),
  mappings: z.array(ConversionEventMappingConfigurationSchema)
    .max(CanonicalEventNameSchema.options.length)
    .default([])
}).superRefine((destination, ctx) => {
  const capabilityModes = new Set<string>()
  destination.capabilities.forEach((capability, index) => {
    if (capabilityModes.has(capability.mode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities', index, 'mode'],
        message: 'Capability modes must be unique within a destination'
      })
    }
    capabilityModes.add(capability.mode)

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

  const hasConfiguredZeroCapability = destination.capabilities.some(capability => (
    capability.managementOrigin === 'zero' && capability.status === 'configured'
  ))
  if (
    hasConfiguredZeroCapability
    && destination.socialConnectionId === null
    && destination.credentialRef === null
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['credentialRef'],
      message: 'Zero-managed configured capabilities require a connection or credential reference'
    })
  }

  const canonicalNames = new Set<string>()
  destination.mappings.forEach((mapping, index) => {
    if (canonicalNames.has(mapping.canonicalEventName)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mappings', index, 'canonicalEventName'],
        message: 'Canonical event mappings must be unique within a destination'
      })
    }
    canonicalNames.add(mapping.canonicalEventName)
  })
})

export const CreateConversionDestinationConfigurationSchema = z.strictObject({
  clientId: z.string().uuid(),
  expectedProfileVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  actor: MeasurementActorSchema,
  destination: DestinationConfigurationInputSchema
})

export const ConversionDestinationCapabilityStateSchema = z.strictObject({
  id: z.string().uuid(),
  destinationId: z.string().uuid(),
  platform: MeasurementPlatformSchema,
  mode: CapabilityModeSchema,
  status: CapabilityStatusSchema,
  managementOrigin: ManagementOriginSchema,
  canZeroMutate: z.boolean(),
  evidenceAt: z.string().datetime({ offset: true }).nullable(),
  blockingReason: z.string().trim().min(1).max(1000).nullable(),
  configVersion: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
})

export const ConversionEventMappingStateSchema = z.strictObject({
  id: z.string().uuid(),
  destinationId: z.string().uuid(),
  canonicalEventName: CanonicalEventNameSchema,
  providerEventName: z.string().trim().min(1).max(255),
  isActive: z.boolean(),
  configVersion: z.number().int().positive(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
})

export const ConversionDestinationReadModelSchema = z.strictObject({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  profileId: z.string().uuid(),
  platform: MeasurementPlatformSchema,
  socialConnectionId: z.string().uuid().nullable(),
  externalDestinationId: z.string().trim().min(1).max(255),
  credentialConfigured: z.boolean(),
  enabled: z.boolean(),
  environment: MeasurementEnvironmentSchema,
  healthStatus: CapabilityStatusSchema,
  configVersion: z.number().int().positive(),
  lastValidatedAt: z.string().datetime({ offset: true }).nullable(),
  lastSuccessAt: z.string().datetime({ offset: true }).nullable(),
  lastFailureAt: z.string().datetime({ offset: true }).nullable(),
  providerRequestId: z.string().trim().min(1).max(255).nullable(),
  errorClass: z.string().trim().min(1).max(255).nullable(),
  redactedError: z.string().trim().min(1).max(1000).nullable(),
  capabilities: z.array(ConversionDestinationCapabilityStateSchema),
  mappings: z.array(ConversionEventMappingStateSchema),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
})

export const ListConversionDestinationsSchema = z.strictObject({
  clientId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  platform: MeasurementPlatformSchema.optional()
})

export const MeasurementConfigEntityTypeSchema = z.enum([
  'profile',
  'destination',
  'capability',
  'mapping',
  'outcome_endpoint'
])
export const MeasurementConfigAuditActionSchema = z.enum([
  'created',
  'updated',
  'enabled',
  'disabled',
  'paused',
  'validated'
])

export const MeasurementAuditEntrySchema = z.strictObject({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  entityType: MeasurementConfigEntityTypeSchema,
  entityId: z.string().uuid(),
  action: MeasurementConfigAuditActionSchema,
  configVersion: z.number().int().positive(),
  changedFields: z.array(z.string().trim().min(1).max(100)).max(100),
  actorType: z.enum(['team_member', 'client_user', 'system', 'import']),
  actorId: z.string().trim().min(1).max(255).nullable(),
  reason: z.string().trim().min(1).max(1000),
  requestId: z.string().trim().min(1).max(255).nullable(),
  createdAt: z.string().datetime({ offset: true })
})

export const ListMeasurementAuditSchema = z.strictObject({
  clientId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  entityType: MeasurementConfigEntityTypeSchema.optional()
})

export const MeasurementReadinessStatusSchema = z.enum([
  'onboarding',
  'paused',
  'blocked',
  'degraded',
  'ready'
])
export const MeasurementReadinessBlockerCodeSchema = z.enum([
  'profile_disabled',
  'profile_paused',
  'cache_stale',
  'no_destinations',
  'destination_not_ready',
  'capability_not_ready',
  'capability_blocked',
  'no_active_mappings',
  'live_approval_missing',
  'privacy_approval_missing',
  'activation_gate_unavailable'
])

const MeasurementReadinessCountsSchema = z.strictObject({
  destinations: z.number().int().nonnegative(),
  readyDestinations: z.number().int().nonnegative(),
  degradedDestinations: z.number().int().nonnegative(),
  blockedDestinations: z.number().int().nonnegative(),
  capabilities: z.number().int().nonnegative(),
  readyCapabilities: z.number().int().nonnegative(),
  degradedCapabilities: z.number().int().nonnegative(),
  blockedCapabilities: z.number().int().nonnegative(),
  activeMappings: z.number().int().nonnegative()
})

export const MeasurementReadinessSummarySchema = z.strictObject({
  clientId: z.string().uuid(),
  profileId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  status: MeasurementReadinessStatusSchema,
  liveEligible: z.boolean(),
  profile: z.strictObject({
    enabled: z.boolean(),
    environment: MeasurementEnvironmentSchema,
    cacheStatus: z.enum(['not_published', 'fresh', 'stale', 'error'])
  }),
  counts: MeasurementReadinessCountsSchema,
  blockers: z.array(z.strictObject({
    code: MeasurementReadinessBlockerCodeSchema,
    message: z.string().trim().min(1).max(500)
  })).max(20),
  lastValidatedAt: z.string().datetime({ offset: true }).nullable(),
  lastSuccessAt: z.string().datetime({ offset: true }).nullable()
})

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
export type ClientMeasurementProfilePatch = z.infer<typeof ClientMeasurementProfilePatchSchema>
export type ClientMeasurementProfileState = z.infer<typeof ClientMeasurementProfileStateSchema>
export type UpdateClientMeasurementProfile = z.infer<typeof UpdateClientMeasurementProfileSchema>
export type MeasurementActor = z.infer<typeof MeasurementActorSchema>
export type ConversionDestinationCreate = z.infer<typeof ConversionDestinationCreateSchema>
export type CreateConversionDestinationConfiguration = z.infer<typeof CreateConversionDestinationConfigurationSchema>
export type ConversionDestinationReadModel = z.infer<typeof ConversionDestinationReadModelSchema>
export type ConversionDestinationCapabilityState = z.infer<typeof ConversionDestinationCapabilityStateSchema>
export type ConversionEventMappingState = z.infer<typeof ConversionEventMappingStateSchema>
export type ListConversionDestinations = z.infer<typeof ListConversionDestinationsSchema>
export type MeasurementAuditEntry = z.infer<typeof MeasurementAuditEntrySchema>
export type ListMeasurementAudit = z.infer<typeof ListMeasurementAuditSchema>
export type MeasurementReadinessSummary = z.infer<typeof MeasurementReadinessSummarySchema>
export type CapabilityState = z.infer<typeof CapabilityStateSchema>
export type CanonicalConversionEvent = z.infer<typeof CanonicalConversionEventSchema>
