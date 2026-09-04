import { z } from 'zod'
import { CanonicalEventNameSchema } from '~~/server/utils/measurement/contracts'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import type {
  GoogleDeliveryInput,
  MetaDeliveryInput,
  ProviderDeliveryResult,
  RefreshGoogleAccessTokenInput,
  TikTokDeliveryInput
} from '~~/workers/measurement-delivery/src/providers'

const GOOGLE_DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager'
const META_WEB_TEST_EVENTS = new Set(['lead_created', 'purchase', 'web_conversion'])
const META_BROWSER_IDENTIFIER_PATTERN = /^fb\.\d+\.\d{10,16}\.[^\s]{1,384}$/

const CommonProviderTestSchema = z.strictObject({
  clientId: z.string().uuid(),
  destinationId: z.string().uuid(),
  expectedConfigVersion: z.number().int().positive(),
  canonicalEventName: CanonicalEventNameSchema,
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
  actor: z.strictObject({ id: z.string().uuid() })
})

const MetaProviderTestCommonSchema = CommonProviderTestSchema.extend({
  mode: z.literal('meta_test_events'),
  testEventCode: z.string().trim().min(4).max(128).regex(/^[a-z0-9_-]+$/i)
})

const SafeWebEventSourceUrlSchema = z.string().trim().url().max(2048).refine((value) => {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
  } catch {
    return false
  }
})

const MetaCrmProviderTestSchema = MetaProviderTestCommonSchema.extend({
  deliveryMode: z.literal('crm').default('crm'),
  metaLeadId: z.string().regex(/^\d{15,16}$/),
  browserEventId: z.null().default(null)
})

const MetaWebProviderTestSchema = MetaProviderTestCommonSchema.extend({
  deliveryMode: z.literal('web'),
  browserEventId: z.string().trim().min(1).max(128),
  fbc: z.string().trim().max(512).regex(META_BROWSER_IDENTIFIER_PATTERN).nullable().default(null),
  fbp: z.string().trim().max(512).regex(META_BROWSER_IDENTIFIER_PATTERN).nullable().default(null),
  eventSourceUrl: SafeWebEventSourceUrlSchema,
  clientUserAgent: z.string().trim().min(1).max(1024)
}).superRefine((value, context) => {
  if (!value.fbc && !value.fbp) {
    context.addIssue({
      code: 'custom',
      path: ['fbc'],
      message: 'Meta Web Test Events require fbc or fbp browser context'
    })
  }
  if (!META_WEB_TEST_EVENTS.has(value.canonicalEventName)) {
    context.addIssue({
      code: 'custom',
      path: ['canonicalEventName'],
      message: 'Downstream lifecycle outcomes must use the Meta CRM delivery path'
    })
  }
})

const GoogleProviderTestSchema = CommonProviderTestSchema.extend({
  mode: z.literal('google_validate_only'),
  clickIdentifier: z.strictObject({
    type: z.enum(['gclid', 'gbraid', 'wbraid']),
    value: z.string().trim().min(1).max(512)
  })
})

const TikTokProviderTestSchema = CommonProviderTestSchema.extend({
  mode: z.literal('tiktok_test_events'),
  testEventCode: z.string().trim().min(4).max(128).regex(/^[a-z0-9_-]+$/i),
  browserEventId: z.string().trim().min(1).max(128),
  ttclid: z.string().trim().min(1).max(512).nullable().default(null),
  ttp: z.string().trim().min(1).max(512).nullable().default(null),
  eventSourceUrl: SafeWebEventSourceUrlSchema,
  clientUserAgent: z.string().trim().min(1).max(1024)
}).superRefine((value, context) => {
  if (!value.ttclid && !value.ttp) {
    context.addIssue({
      code: 'custom',
      path: ['ttclid'],
      message: 'TikTok Test Events require ttclid or ttp browser context'
    })
  }
})

export const MeasurementProviderTestInputSchema = z.union([
  MetaCrmProviderTestSchema,
  MetaWebProviderTestSchema,
  GoogleProviderTestSchema,
  TikTokProviderTestSchema
])

export type MeasurementProviderTestInput = z.infer<typeof MeasurementProviderTestInputSchema>
export type ProviderTestMode = MeasurementProviderTestInput['mode']
export type ProviderTestStatus = 'requested' | 'accepted' | 'failed'

export interface ProviderTestRunSummary {
  id: string
  mode: ProviderTestMode
  status: ProviderTestStatus
  providerRequestId?: string | null
  errorClass?: string | null
  redactedError?: string | null
  completedAt?: string | null
}

export interface ReservedProviderTestContext {
  run: ProviderTestRunSummary
  delivery: {
    eventId: string
    eventName: string
    providerEventName: string
    occurredAt: string
    idempotencyKey: string
    externalDestinationId: string
    operatingAccountId: string
    loginAccountId: string
    metaDeliveryMode: 'crm' | 'web'
  }
  credential: {
    credentialRef: string | null
    refreshToken: string | null
    scopes: string[]
  }
}

export type ReserveProviderTestResult
  = | { status: 'reserved', context: ReservedProviderTestContext }
    | { status: 'existing', run: ProviderTestRunSummary }
    | { status: 'not_found' | 'version_conflict' | 'not_test_mode' | 'mapping_not_found' | 'connection_not_found' | 'capability_not_configured' | 'delivery_mode_mismatch' | 'source_origin_not_approved' }

export interface MeasurementProviderTestRepository {
  reserve(input: MeasurementProviderTestInput): Promise<ReserveProviderTestResult>
  complete(input: {
    clientId: string
    runId: string
    status: 'accepted' | 'failed'
    providerRequestId: string | null
    errorClass: string | null
    redactedError: string | null
    completedAt: string
  }): Promise<void>
}

interface ProviderTestServiceDeps {
  repository: MeasurementProviderTestRepository
  deliverMeta(input: Omit<MetaDeliveryInput, 'fetch'>): Promise<ProviderDeliveryResult>
  deliverGoogle(input: Omit<GoogleDeliveryInput, 'fetch'>): Promise<ProviderDeliveryResult>
  deliverTikTok(input: Omit<TikTokDeliveryInput, 'fetch'>): Promise<ProviderDeliveryResult>
  refreshGoogleAccessToken(input: Omit<RefreshGoogleAccessTokenInput, 'fetch'>): Promise<string>
  resolveProviderCredential(credentialRef: string): Promise<string | null>
  graphApiVersion: string
  googleClientId: string
  googleClientSecret: string
  now: () => Date
}

function validationError(message = 'Invalid measurement provider test request') {
  return new MeasurementError('MEASUREMENT_VALIDATION_ERROR', 422, message)
}

function repositoryError(status: Exclude<ReserveProviderTestResult['status'], 'reserved' | 'existing'>) {
  if (status === 'not_found') {
    return new MeasurementError('MEASUREMENT_NOT_FOUND', 404, 'Measurement destination not found')
  }
  if (status === 'version_conflict') {
    return new MeasurementError(
      'MEASUREMENT_VERSION_CONFLICT',
      409,
      'Measurement configuration changed; refresh before testing'
    )
  }
  if (status === 'not_test_mode') {
    return new MeasurementError(
      'MEASUREMENT_NOT_READY',
      409,
      'Provider tests require a dormant test profile and destination'
    )
  }
  if (status === 'mapping_not_found') return validationError('No active mapping exists for this event')
  if (status === 'capability_not_configured') {
    return new MeasurementError(
      'MEASUREMENT_NOT_READY',
      409,
      'The requested provider delivery capability is not configured and owned by Zero'
    )
  }
  if (status === 'delivery_mode_mismatch') {
    return validationError('The selected event does not match its server-owned Meta delivery path')
  }
  if (status === 'source_origin_not_approved') {
    return validationError('The event source origin is not approved for this client tracking site')
  }
  return validationError('The destination has no active provider connection')
}

function sanitized(run: ProviderTestRunSummary) {
  return {
    run: {
      id: run.id,
      mode: run.mode,
      status: run.status,
      providerRequestId: run.providerRequestId ?? null,
      errorClass: run.errorClass ?? null,
      redactedError: run.redactedError ?? null,
      completedAt: run.completedAt ?? null
    }
  }
}

function networkFailure(): ProviderDeliveryResult {
  return {
    outcome: 'retryable',
    providerRequestId: null,
    errorClass: 'provider_network_error',
    redactedDiagnostic: 'Provider validation failed before a response'
  }
}

export function createMeasurementProviderTestService(deps: ProviderTestServiceDeps) {
  return {
    async run(rawInput: unknown) {
      const parsed = MeasurementProviderTestInputSchema.safeParse(rawInput)
      if (!parsed.success) throw validationError()
      const input = parsed.data
      const now = deps.now()
      const occurredAt = new Date(input.occurredAt)
      if (
        occurredAt.getTime() > now.getTime() + 5 * 60 * 1000
        || occurredAt.getTime() < now.getTime() - 7 * 24 * 60 * 60 * 1000
      ) throw validationError('Provider test timestamps must be within the supported seven-day window')

      const transientValues = input.mode === 'meta_test_events'
        ? input.deliveryMode === 'web'
          ? [
              input.testEventCode,
              input.browserEventId,
              input.fbc,
              input.fbp,
              input.eventSourceUrl,
              input.clientUserAgent
            ]
          : [input.testEventCode, input.metaLeadId]
        : input.mode === 'tiktok_test_events'
          ? [
              input.testEventCode,
              input.browserEventId,
              input.ttclid,
              input.ttp,
              input.eventSourceUrl,
              input.clientUserAgent
            ]
          : [input.clickIdentifier.value]
      const normalizedReason = input.reason.toLocaleLowerCase()
      if (transientValues.some(value => (
        value && normalizedReason.includes(value.toLocaleLowerCase())
      ))) {
        throw validationError('Approval reasons must not contain transient provider identifiers')
      }
      const reserved = await deps.repository.reserve(input)
      if (reserved.status === 'existing') return sanitized(reserved.run)
      if (reserved.status !== 'reserved') throw repositoryError(reserved.status)

      const { context } = reserved
      const isMetaWeb = input.mode === 'meta_test_events' && input.deliveryMode === 'web'
      const isTikTok = input.mode === 'tiktok_test_events'
      const baseDelivery = {
        ...context.delivery,
        attribution: {
          browserEventId: isMetaWeb || isTikTok ? input.browserEventId : null,
          metaLeadId: input.mode === 'meta_test_events' && input.deliveryMode === 'crm'
            ? input.metaLeadId
            : null,
          gclid: input.mode === 'google_validate_only' && input.clickIdentifier.type === 'gclid'
            ? input.clickIdentifier.value
            : null,
          gbraid: input.mode === 'google_validate_only' && input.clickIdentifier.type === 'gbraid'
            ? input.clickIdentifier.value
            : null,
          wbraid: input.mode === 'google_validate_only' && input.clickIdentifier.type === 'wbraid'
            ? input.clickIdentifier.value
            : null,
          fbc: isMetaWeb ? input.fbc : null,
          fbp: isMetaWeb ? input.fbp : null,
          ttclid: isTikTok ? input.ttclid : null,
          ttp: isTikTok ? input.ttp : null,
          eventSourceUrl: isMetaWeb || isTikTok ? input.eventSourceUrl : null,
          clientUserAgent: isMetaWeb || isTikTok ? input.clientUserAgent : null
        }
      }

      let providerResult: ProviderDeliveryResult
      try {
        if (input.mode === 'meta_test_events') {
          if (!context.credential.credentialRef) {
            providerResult = {
              outcome: 'permanent_failure',
              providerRequestId: null,
              errorClass: 'meta_capi_credential_ref_required',
              redactedDiagnostic: 'Meta CAPI requires a purpose-scoped secret binding'
            }
          } else {
            const accessToken = await deps.resolveProviderCredential(context.credential.credentialRef)
            providerResult = accessToken
              ? await deps.deliverMeta({
                  delivery: baseDelivery,
                  accessToken,
                  graphApiVersion: deps.graphApiVersion,
                  environment: 'test',
                  testEventCode: input.testEventCode
                })
              : {
                  outcome: 'permanent_failure',
                  providerRequestId: null,
                  errorClass: 'meta_capi_credential_unavailable',
                  redactedDiagnostic: 'Meta CAPI secret binding is unavailable'
                }
          }
        } else if (input.mode === 'tiktok_test_events') {
          if (!context.delivery.externalDestinationId) {
            providerResult = {
              outcome: 'permanent_failure',
              providerRequestId: null,
              errorClass: 'tiktok_pixel_id_missing',
              redactedDiagnostic: 'TikTok Pixel/Data Source id is not configured'
            }
          } else if (!context.credential.credentialRef) {
            providerResult = {
              outcome: 'permanent_failure',
              providerRequestId: null,
              errorClass: 'tiktok_events_api_credential_unavailable',
              redactedDiagnostic: 'TikTok Events API secret binding is unavailable'
            }
          } else {
            const accessToken = await deps.resolveProviderCredential(context.credential.credentialRef)
            providerResult = accessToken
              ? await deps.deliverTikTok({
                  delivery: baseDelivery,
                  accessToken,
                  environment: 'test',
                  testEventCode: input.testEventCode
                })
              : {
                  outcome: 'permanent_failure',
                  providerRequestId: null,
                  errorClass: 'tiktok_events_api_credential_unavailable',
                  redactedDiagnostic: 'TikTok Events API secret binding is unavailable'
                }
          }
        } else if (!context.credential.scopes.includes(GOOGLE_DATA_MANAGER_SCOPE)) {
          providerResult = {
            outcome: 'permanent_failure',
            providerRequestId: null,
            errorClass: 'google_datamanager_reconsent_required',
            redactedDiagnostic: 'Google connection must be re-consented for Data Manager'
          }
        } else if (
          !context.credential.refreshToken
          || !deps.googleClientId
          || !deps.googleClientSecret
        ) {
          providerResult = {
            outcome: 'permanent_failure',
            providerRequestId: null,
            errorClass: 'google_credential_missing',
            redactedDiagnostic: 'Google Data Manager OAuth is not configured'
          }
        } else {
          const accessToken = await deps.refreshGoogleAccessToken({
            refreshToken: context.credential.refreshToken,
            clientId: deps.googleClientId,
            clientSecret: deps.googleClientSecret
          })
          providerResult = await deps.deliverGoogle({
            delivery: baseDelivery,
            accessToken,
            validateOnly: true
          })
        }
      } catch {
        providerResult = networkFailure()
      }

      const completedAt = deps.now().toISOString()
      const status = providerResult.outcome === 'accepted' ? 'accepted' as const : 'failed' as const
      await deps.repository.complete({
        clientId: input.clientId,
        runId: context.run.id,
        status,
        providerRequestId: providerResult.providerRequestId,
        errorClass: providerResult.errorClass,
        redactedError: providerResult.redactedDiagnostic,
        completedAt
      })
      return sanitized({
        id: context.run.id,
        mode: input.mode,
        status,
        providerRequestId: providerResult.providerRequestId,
        errorClass: providerResult.errorClass,
        redactedError: providerResult.redactedDiagnostic,
        completedAt
      })
    }
  }
}
