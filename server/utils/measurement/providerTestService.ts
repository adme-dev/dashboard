import { z } from 'zod'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import type {
  GoogleDeliveryInput,
  MetaDeliveryInput,
  ProviderDeliveryResult,
  RefreshGoogleAccessTokenInput
} from '~~/workers/measurement-delivery/src/providers'

const GOOGLE_DATA_MANAGER_SCOPE = 'https://www.googleapis.com/auth/datamanager'

const CommonProviderTestSchema = z.strictObject({
  clientId: z.string().uuid(),
  destinationId: z.string().uuid(),
  expectedConfigVersion: z.number().int().positive(),
  canonicalEventName: z.enum([
    'lead_created',
    'lead_contacted',
    'lead_qualified',
    'lead_won',
    'lead_lost',
    'purchase',
    'web_conversion'
  ]),
  occurredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
  actor: z.strictObject({ id: z.string().uuid() })
})

const MetaProviderTestSchema = CommonProviderTestSchema.extend({
  mode: z.literal('meta_test_events'),
  testEventCode: z.string().trim().min(4).max(128).regex(/^[a-z0-9_-]+$/i),
  metaLeadId: z.string().regex(/^\d{15,16}$/),
  browserEventId: z.string().trim().min(1).max(128).nullable().default(null)
})

const GoogleProviderTestSchema = CommonProviderTestSchema.extend({
  mode: z.literal('google_validate_only'),
  clickIdentifier: z.strictObject({
    type: z.enum(['gclid', 'gbraid', 'wbraid']),
    value: z.string().trim().min(1).max(512)
  })
})

export const MeasurementProviderTestInputSchema = z.discriminatedUnion('mode', [
  MetaProviderTestSchema,
  GoogleProviderTestSchema
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
  }
  credential: {
    accessToken: string | null
    refreshToken: string | null
    scopes: string[]
  }
}

export type ReserveProviderTestResult
  = | { status: 'reserved', context: ReservedProviderTestContext }
    | { status: 'existing', run: ProviderTestRunSummary }
    | { status: 'not_found' | 'version_conflict' | 'not_test_mode' | 'mapping_not_found' | 'connection_not_found' }

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
  refreshGoogleAccessToken(input: Omit<RefreshGoogleAccessTokenInput, 'fetch'>): Promise<string>
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
      'MEASUREMENT_TEST_MODE_REQUIRED',
      409,
      'Provider tests require a dormant test profile and destination'
    )
  }
  if (status === 'mapping_not_found') return validationError('No active mapping exists for this event')
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
        ? [input.testEventCode, input.metaLeadId, input.browserEventId]
        : [input.clickIdentifier.value]
      if (transientValues.some(value => value && input.reason.includes(value))) {
        throw validationError('Approval reasons must not contain transient provider identifiers')
      }
      const reserved = await deps.repository.reserve(input)
      if (reserved.status === 'existing') return sanitized(reserved.run)
      if (reserved.status !== 'reserved') throw repositoryError(reserved.status)

      const { context } = reserved
      const baseDelivery = {
        ...context.delivery,
        attribution: {
          browserEventId: input.mode === 'meta_test_events' ? input.browserEventId : null,
          metaLeadId: input.mode === 'meta_test_events' ? input.metaLeadId : null,
          gclid: input.mode === 'google_validate_only' && input.clickIdentifier.type === 'gclid'
            ? input.clickIdentifier.value
            : null,
          gbraid: input.mode === 'google_validate_only' && input.clickIdentifier.type === 'gbraid'
            ? input.clickIdentifier.value
            : null,
          wbraid: input.mode === 'google_validate_only' && input.clickIdentifier.type === 'wbraid'
            ? input.clickIdentifier.value
            : null
        }
      }

      let providerResult: ProviderDeliveryResult
      try {
        if (input.mode === 'meta_test_events') {
          providerResult = context.credential.accessToken
            ? await deps.deliverMeta({
                delivery: baseDelivery,
                accessToken: context.credential.accessToken,
                graphApiVersion: deps.graphApiVersion,
                environment: 'test',
                testEventCode: input.testEventCode
              })
            : {
                outcome: 'permanent_failure',
                providerRequestId: null,
                errorClass: 'meta_credential_missing',
                redactedDiagnostic: 'Meta connection has no active credential'
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
