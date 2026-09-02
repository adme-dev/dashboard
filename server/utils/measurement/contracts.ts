import { z } from 'zod'
import { isMeasurementProviderCredentialRef } from '~~/shared/utils/measurementProviderCredential'
import {
  MEASUREMENT_PLATFORMS,
  PLATFORM_MODE_PREFIX
} from '~~/shared/utils/measurementPlatform'

export const MeasurementEnvironmentSchema = z.enum(['test', 'live', 'paused'])
export const CollectionTierSchema = z.enum([
  'cloudflare_owned',
  'first_party_cname',
  'shared_endpoint',
  'backend_only'
])
export const ConsentModeSchema = z.enum(['off', 'au_optout', 'consent_gated'])
export const MeasurementDesiredStateSourceSchema = z.enum([
  'new_client_default', 'existing_review', 'operator', 'explicit_opt_out'
])
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
  'web_conversion',
  'phone_click',
  'directions_click',
  'add_to_wishlist',
  'form_submit'
])
export const MeasurementEnquiryTypeSchema = z.enum([
  'stock', 'finance', 'test_drive', 'contact', 'model_variant', 'service_booking'
])

export const MeasurementPlatformSchema = z.enum(MEASUREMENT_PLATFORMS)
export const CapabilityModeSchema = z.enum([
  'meta_pixel',
  'meta_web_capi',
  'meta_crm_capi',
  'meta_conversion_leads',
  'google_tag_enhanced_conversions',
  'google_enhanced_conversions_for_leads',
  'google_data_manager',
  'ga4_measurement_protocol'
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

const FirstPartyHostnameSchema = z.string()
  .trim()
  .min(1)
  .max(253)
  .toLowerCase()
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
    'Invalid first-party hostname'
  )

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

const ClientMeasurementProfileCoreSchema = z.strictObject({
  clientId: z.string().uuid(),
  desiredEnabled: z.boolean().default(true),
  desiredStateSource: MeasurementDesiredStateSourceSchema.default('new_client_default'),
  enabled: z.boolean().default(false),
  environment: MeasurementEnvironmentSchema.default('test'),
  collectionTier: CollectionTierSchema.default('backend_only'),
  trackingSiteId: z.string().uuid().nullable().default(null),
  firstPartyHostname: FirstPartyHostnameSchema.nullable().default(null),
  hostnameStatus: z.enum(['not_required', 'pending', 'active', 'error']).default('not_required'),
  consentMode: ConsentModeSchema.default('consent_gated'),
  vertical: z.string().trim().min(1).max(100),
  outcomeAuthority: OutcomeAuthoritySchema.default('zero_native'),
  nativeLifecycleMode: NativeLifecycleModeSchema.default('crm_preferred'),
  portalOutcomeMode: PortalOutcomeModeSchema.default('disabled')
})

function validateCollectionTransport(
  profile: {
    collectionTier: z.infer<typeof CollectionTierSchema>
    trackingSiteId: string | null
    firstPartyHostname: string | null
    hostnameStatus: 'not_required' | 'pending' | 'active' | 'error'
  },
  ctx: z.RefinementCtx
) {
  if (profile.collectionTier === 'first_party_cname') {
    if (profile.trackingSiteId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['trackingSiteId'],
        message: 'First-party collection requires a linked tracking site'
      })
    }
    if (profile.firstPartyHostname === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['firstPartyHostname'],
        message: 'First-party collection requires a hostname'
      })
    }
    if (profile.hostnameStatus === 'not_required') {
      ctx.addIssue({
        code: 'custom',
        path: ['hostnameStatus'],
        message: 'First-party hostname readiness must be provider verified'
      })
    }
    return
  }

  if (profile.firstPartyHostname !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['firstPartyHostname'],
      message: 'Only first-party collection may configure a hostname'
    })
  }
  if (profile.hostnameStatus !== 'not_required') {
    ctx.addIssue({
      code: 'custom',
      path: ['hostnameStatus'],
      message: 'Hostname readiness is not applicable to this collection tier'
    })
  }
}

export const ClientMeasurementProfileCreateSchema = ClientMeasurementProfileCoreSchema
  .superRefine(validateCollectionTransport)

export const ClientMeasurementProfilePatchSchema = z.strictObject({
  desiredEnabled: z.boolean().optional(),
  enabled: z.boolean().optional(),
  environment: MeasurementEnvironmentSchema.optional(),
  collectionTier: CollectionTierSchema.optional(),
  trackingSiteId: z.string().uuid().nullable().optional(),
  firstPartyHostname: FirstPartyHostnameSchema.nullable().optional(),
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

export const ClientMeasurementProfileStateSchema = ClientMeasurementProfileCoreSchema.extend({
  id: z.string().uuid(),
  configVersion: z.number().int().positive(),
  cacheStatus: z.enum(['not_published', 'fresh', 'stale', 'error']),
  cacheVersion: z.number().int().positive().nullable(),
  cacheErrorClass: z.string().trim().min(1).max(255).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
}).superRefine((profile, ctx) => {
  validateCollectionTransport(profile, ctx)
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

const MeasurementProviderCredentialRefSchema = z.string()
  .trim()
  .refine(isMeasurementProviderCredentialRef, {
    message: 'Provider credentials must use a purpose-scoped measurement binding'
  })

export const ConversionDestinationCreateSchema = z.strictObject({
  profileId: z.string().uuid(),
  platform: MeasurementPlatformSchema,
  socialConnectionId: z.string().uuid().nullable().default(null),
  externalDestinationId: z.string().trim().min(1).max(255),
  credentialRef: MeasurementProviderCredentialRefSchema.nullable().default(null),
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

    const belongsToPlatform = capability.mode.startsWith(PLATFORM_MODE_PREFIX[destination.platform])
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
  enquiryType: MeasurementEnquiryTypeSchema.nullable().optional(),
  providerEventName: z.string().trim().min(1).max(255),
  isActive: z.boolean().default(false)
})

const DestinationConfigurationInputSchema = z.strictObject({
  platform: MeasurementPlatformSchema,
  socialConnectionId: z.string().uuid().nullable().default(null),
  externalDestinationId: z.string().trim().min(1).max(255),
  credentialRef: MeasurementProviderCredentialRefSchema.nullable().default(null),
  capabilities: z.array(DestinationCapabilityConfigurationSchema)
    .min(1)
    .max(CapabilityModeSchema.options.length),
  mappings: z.array(ConversionEventMappingConfigurationSchema)
    .max(CanonicalEventNameSchema.options.length * 6)
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

    const belongsToPlatform = capability.mode.startsWith(PLATFORM_MODE_PREFIX[destination.platform])
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
    const key = `${mapping.canonicalEventName}:${mapping.enquiryType ?? '__aggregate__'}`
    if (canonicalNames.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mappings', index, 'canonicalEventName'],
        message: 'Canonical event mappings must be unique within a destination'
      })
    }
    canonicalNames.add(key)
  })
})

export const CreateConversionDestinationConfigurationSchema = z.strictObject({
  clientId: z.string().uuid(),
  expectedProfileVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  actor: MeasurementActorSchema,
  destination: DestinationConfigurationInputSchema
})

const DestinationConfigurationPatchSchema = z.strictObject({
  socialConnectionId: z.string().uuid().nullable().optional(),
  externalDestinationId: z.string().trim().min(1).max(255).optional(),
  credentialRef: MeasurementProviderCredentialRefSchema.nullable().optional(),
  capabilities: z.array(DestinationCapabilityConfigurationSchema)
    .min(1)
    .max(CapabilityModeSchema.options.length)
    .optional(),
  mappings: z.array(ConversionEventMappingConfigurationSchema)
    .max(CanonicalEventNameSchema.options.length * 6)
    .optional()
}).superRefine((patch, ctx) => {
  if (Object.keys(patch).length === 0) {
    ctx.addIssue({
      code: 'custom',
      message: 'At least one destination field must change'
    })
  }

  const capabilityModes = new Set<string>()
  patch.capabilities?.forEach((capability, index) => {
    if (capabilityModes.has(capability.mode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities', index, 'mode'],
        message: 'Capability modes must be unique within a destination'
      })
    }
    capabilityModes.add(capability.mode)
  })

  const canonicalNames = new Set<string>()
  patch.mappings?.forEach((mapping, index) => {
    const key = `${mapping.canonicalEventName}:${mapping.enquiryType ?? '__aggregate__'}`
    if (canonicalNames.has(key)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mappings', index, 'canonicalEventName'],
        message: 'Canonical event mappings must be unique within a destination'
      })
    }
    canonicalNames.add(key)
  })
})

export const UpdateConversionDestinationConfigurationSchema = z.strictObject({
  clientId: z.string().uuid(),
  destinationId: z.string().uuid(),
  expectedProfileVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  actor: MeasurementActorSchema,
  patch: DestinationConfigurationPatchSchema
})

const ValidationEvidenceCapabilitySchema = z.strictObject({
  mode: CapabilityModeSchema,
  status: z.enum(['ready', 'degraded', 'blocked']),
  blockingReason: z.string().trim().min(1).max(1000).nullable().default(null)
}).superRefine((capability, ctx) => {
  if (capability.status !== 'ready' && capability.blockingReason === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'Degraded and blocked evidence requires a redacted reason'
    })
  }
  if (capability.status === 'ready' && capability.blockingReason !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'Ready evidence cannot include a blocking reason'
    })
  }
})

export const RecordDestinationValidationEvidenceSchema = z.strictObject({
  clientId: z.string().uuid(),
  destinationId: z.string().uuid(),
  expectedConfigVersion: z.number().int().positive(),
  observedAt: z.string().datetime({ offset: true }),
  actor: z.strictObject({
    // Must stay within MeasurementActorSchema's vocabulary: the
    // measurement_config_audit.actor_type CHECK constraint only permits
    // team_member | client_user | system | import. 'system' marks evidence a
    // provider call produced; 'team_member' marks evidence an operator asserted.
    type: z.enum(['system', 'team_member']),
    id: z.string().trim().min(1).max(255)
  }),
  reason: z.string().trim().min(1).max(1000),
  providerRequestId: z.string().trim().min(1).max(255).nullable().default(null),
  errorClass: z.string().trim().min(1).max(255).nullable().default(null),
  redactedError: z.string().trim().min(1).max(1000).nullable().default(null),
  capabilities: z.array(ValidationEvidenceCapabilitySchema)
    .min(1)
    .max(CapabilityModeSchema.options.length)
}).superRefine((evidence, ctx) => {
  const modes = new Set<string>()
  evidence.capabilities.forEach((capability, index) => {
    if (modes.has(capability.mode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['capabilities', index, 'mode'],
        message: 'Validation evidence must contain each capability once'
      })
    }
    modes.add(capability.mode)
  })
})

export const MeasurementApprovalKindSchema = z.enum(['privacy', 'live'])
const MeasurementTeamActorSchema = z.strictObject({
  type: z.literal('team_member'),
  id: z.string().uuid()
})

export const ApproveMeasurementActivationSchema = z.strictObject({
  clientId: z.string().uuid(),
  expectedConfigVersion: z.number().int().positive(),
  approvalKind: MeasurementApprovalKindSchema,
  actor: MeasurementTeamActorSchema,
  reason: z.string().trim().min(1).max(1000),
  separationOverride: z.boolean().default(false)
})

export const ActivateMeasurementProfileSchema = z.strictObject({
  clientId: z.string().uuid(),
  expectedConfigVersion: z.number().int().positive(),
  actor: MeasurementTeamActorSchema,
  reason: z.string().trim().min(1).max(1000)
})

export const MeasurementActivationApprovalSchema = z.strictObject({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  profileId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  approvalKind: MeasurementApprovalKindSchema,
  approvedBy: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
  separationOverride: z.boolean().default(false),
  createdAt: z.string().datetime({ offset: true })
})

const OutcomeEndpointConfigurationInputSchema = z.strictObject({
  label: z.string().trim().min(1).max(100),
  sourceSystem: z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_-]*$/),
  currentSecretRef: OpaqueCredentialRefSchema,
  replayWindowSeconds: z.number().int().min(60).max(900).default(300),
  rateLimitPerMinute: z.number().int().min(1).max(1000).default(60)
})

export const CreateOutcomeEndpointConfigurationSchema = z.strictObject({
  clientId: z.string().uuid(),
  expectedProfileVersion: z.number().int().positive(),
  actor: MeasurementTeamActorSchema,
  reason: z.string().trim().min(1).max(1000),
  endpoint: OutcomeEndpointConfigurationInputSchema
})

export const OutcomeEndpointReadModelSchema = z.strictObject({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  profileId: z.string().uuid(),
  endpointKey: z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/),
  label: z.string().trim().min(1).max(100),
  sourceSystem: z.string().trim().min(1).max(100),
  secretConfigured: z.boolean(),
  secretVersion: z.number().int().positive(),
  status: z.enum(['disabled', 'test', 'live', 'paused']),
  replayWindowSeconds: z.number().int().min(60).max(900),
  rateLimitPerMinute: z.number().int().min(1).max(1000),
  configVersion: z.number().int().positive(),
  lastReceivedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true })
})

export const ListOutcomeEndpointsSchema = z.strictObject({
  clientId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
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
  enquiryType: MeasurementEnquiryTypeSchema.nullable().optional(),
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
  'outcome_endpoint',
  'lifecycle_mapping'
])
export const MeasurementConfigAuditActionSchema = z.enum([
  'created',
  'updated',
  'enabled',
  'disabled',
  'paused',
  'validated',
  'approved',
  'activated'
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
  'outcome_endpoint_not_ready',
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
  activeMappings: z.number().int().nonnegative(),
  outcomeEndpoints: z.number().int().nonnegative(),
  readyOutcomeEndpoints: z.number().int().nonnegative()
})

export const MeasurementReadinessSummarySchema = z.strictObject({
  clientId: z.string().uuid(),
  profileId: z.string().uuid(),
  configVersion: z.number().int().positive(),
  status: MeasurementReadinessStatusSchema,
  liveEligible: z.boolean(),
  approvals: z.strictObject({
    privacy: z.boolean(),
    live: z.boolean()
  }),
  profile: z.strictObject({
    enabled: z.boolean(),
    environment: MeasurementEnvironmentSchema,
    cacheStatus: z.enum(['not_published', 'fresh', 'stale', 'error']),
    outcomeAuthority: OutcomeAuthoritySchema
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
  wbraid: z.string().trim().min(1).max(512).nullable().default(null),
  gaClientId: z.string().trim().min(1).max(128).nullable().default(null),
  utm_source: z.string().regex(/^[a-z][a-z0-9_-]*$/).max(64).optional(),
  utm_medium: z.enum(['classifieds', 'paid-social', 'cpc', 'lead_ingest']).optional(),
  provider: z.string().regex(/^[a-z][a-z0-9_-]*$/).max(64).optional(),
  email_endpoint_id: z.string().uuid().optional(),
  parser: z.enum(['adf', 'provider', 'generic', 'ai_fallback']).optional(),
  confidence_band: z.enum(['high', 'medium', 'low']).optional(),
  transport: z.literal('email').optional()
})

const EMPTY_CANONICAL_ATTRIBUTION = {
  browserEventId: null,
  metaLeadId: null,
  gclid: null,
  gbraid: null,
  wbraid: null,
  gaClientId: null
}

export const CanonicalConversionEventSchema = z.strictObject({
  eventId: z.string().uuid(),
  clientId: z.string().uuid(),
  eventName: CanonicalEventNameSchema,
  enquiryType: MeasurementEnquiryTypeSchema.nullable().optional(),
  sourceSystem: CanonicalEventSourceSystemSchema,
  sourceEntityType: CanonicalEventSourceEntitySchema,
  sourceEntityId: z.string().trim().min(1).max(255),
  sourceEventId: z.string().trim().min(1).max(255),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().trim().min(1).max(512),
  configVersion: z.number().int().positive(),
  consentMode: ConsentModeSchema,
  attribution: CanonicalAttributionSchema.default(EMPTY_CANONICAL_ATTRIBUTION),
  value: z.number().positive().max(9_999_999.99).nullable().default(null),
  currencyCode: z.literal('AUD').nullable().default(null)
})

export const CanonicalConsentDecisionSchema = z.enum(['granted', 'denied', 'unknown'])
export const CanonicalOutboxStatusSchema = z.enum([
  'paused',
  'pending',
  'claimed',
  'published',
  'policy_skipped',
  'failed'
])

export const AppendCanonicalConversionEventSchema = z.strictObject({
  clientId: z.string().uuid(),
  eventName: CanonicalEventNameSchema,
  enquiryType: MeasurementEnquiryTypeSchema.nullable().optional(),
  sourceSystem: CanonicalEventSourceSystemSchema,
  sourceEntityType: CanonicalEventSourceEntitySchema,
  sourceEntityId: z.string().trim().min(1).max(255),
  sourceEventId: z.string().trim().min(1).max(255),
  occurredAt: z.string().datetime({ offset: true }),
  consentDecision: CanonicalConsentDecisionSchema.default('unknown'),
  attribution: CanonicalAttributionSchema.default(EMPTY_CANONICAL_ATTRIBUTION),
  value: z.number().positive().max(9_999_999.99).nullable().default(null)
})

export const CanonicalConversionOutboxEventSchema = CanonicalConversionEventSchema.extend({
  profileId: z.string().uuid(),
  outboxStatus: CanonicalOutboxStatusSchema,
  policyReason: z.string().trim().min(1).max(255).nullable()
})

export const ConversionDeliveryQueueMessageSchema = z.strictObject({
  schemaVersion: z.literal(1),
  clientId: z.string().uuid(),
  eventId: z.string().uuid(),
  enqueuedAt: z.string().datetime({ offset: true })
})

export type ClientMeasurementProfileCreate = z.infer<typeof ClientMeasurementProfileCreateSchema>
export type CanonicalEventName = z.infer<typeof CanonicalEventNameSchema>
export type MeasurementEnquiryType = z.infer<typeof MeasurementEnquiryTypeSchema>
export type CanonicalConsentDecision = z.infer<typeof CanonicalConsentDecisionSchema>
export type ClientMeasurementProfilePatch = z.infer<typeof ClientMeasurementProfilePatchSchema>
export type ClientMeasurementProfileState = z.infer<typeof ClientMeasurementProfileStateSchema>
export type UpdateClientMeasurementProfile = z.infer<typeof UpdateClientMeasurementProfileSchema>
export type MeasurementActor = z.infer<typeof MeasurementActorSchema>
export type ConversionDestinationCreate = z.infer<typeof ConversionDestinationCreateSchema>
export type CreateConversionDestinationConfiguration = z.infer<typeof CreateConversionDestinationConfigurationSchema>
export type UpdateConversionDestinationConfiguration = z.infer<typeof UpdateConversionDestinationConfigurationSchema>
export type RecordDestinationValidationEvidence = z.infer<typeof RecordDestinationValidationEvidenceSchema>
export type ApproveMeasurementActivation = z.infer<typeof ApproveMeasurementActivationSchema>
export type ActivateMeasurementProfile = z.infer<typeof ActivateMeasurementProfileSchema>
export type MeasurementActivationApproval = z.infer<typeof MeasurementActivationApprovalSchema>
export type CreateOutcomeEndpointConfiguration = z.infer<typeof CreateOutcomeEndpointConfigurationSchema>
export type OutcomeEndpointReadModel = z.infer<typeof OutcomeEndpointReadModelSchema>
export type ListOutcomeEndpoints = z.infer<typeof ListOutcomeEndpointsSchema>
export type ConversionDestinationReadModel = z.infer<typeof ConversionDestinationReadModelSchema>
export type ConversionDestinationCapabilityState = z.infer<typeof ConversionDestinationCapabilityStateSchema>
export type ConversionEventMappingState = z.infer<typeof ConversionEventMappingStateSchema>
export type ListConversionDestinations = z.infer<typeof ListConversionDestinationsSchema>
export type MeasurementAuditEntry = z.infer<typeof MeasurementAuditEntrySchema>
export type ListMeasurementAudit = z.infer<typeof ListMeasurementAuditSchema>
export type MeasurementReadinessSummary = z.infer<typeof MeasurementReadinessSummarySchema>
export type CapabilityState = z.infer<typeof CapabilityStateSchema>
export type CanonicalConversionEvent = z.infer<typeof CanonicalConversionEventSchema>
export type AppendCanonicalConversionEvent = z.infer<typeof AppendCanonicalConversionEventSchema>
export type CanonicalConversionOutboxEvent = z.infer<typeof CanonicalConversionOutboxEventSchema>
export type ConversionDeliveryQueueMessage = z.infer<typeof ConversionDeliveryQueueMessageSchema>
