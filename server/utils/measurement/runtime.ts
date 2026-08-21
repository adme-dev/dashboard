import type { H3Event } from 'h3'
import { getKV } from '~~/server/utils/kv'
import { queryOne } from '~~/server/utils/db'
import { resolveGoogleOAuthRuntimeConfig } from '~~/server/utils/googleOAuthRuntimeConfig'
import { createPostgresMeasurementActivationRepository } from '~~/server/utils/measurement/activationRepository'
import { createMeasurementActivationService } from '~~/server/utils/measurement/activationService'
import { createMeasurementAttestationService } from '~~/server/utils/measurement/attestationService'
import { createPostgresMeasurementDestinationRepository } from '~~/server/utils/measurement/destinationRepository'
import { createMeasurementDestinationService } from '~~/server/utils/measurement/destinationService'
import { createPostgresMeasurementHealthRepository } from '~~/server/utils/measurement/healthRepository'
import { createMeasurementHealthService } from '~~/server/utils/measurement/healthService'
import { createPostgresMeasurementOutcomeEndpointRepository } from '~~/server/utils/measurement/outcomeEndpointRepository'
import { createMeasurementOutcomeEndpointService } from '~~/server/utils/measurement/outcomeEndpointService'
import { createMeasurementProfileCachePublisher } from '~~/server/utils/measurement/profileCache'
import { createPostgresMeasurementProfileRepository } from '~~/server/utils/measurement/profileRepository'
import { createMeasurementProfileService } from '~~/server/utils/measurement/profileService'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'
import { createPostgresMeasurementProviderTestRepository } from '~~/server/utils/measurement/providerTestRepository'
import { createMeasurementProviderTestService } from '~~/server/utils/measurement/providerTestService'
import { createPostgresMeasurementReadRepository } from '~~/server/utils/measurement/readRepository'
import { createMeasurementReadService } from '~~/server/utils/measurement/readService'
import {
  deliverGoogleDataManagerEvent,
  deliverMetaConversionEvent,
  refreshGoogleDataManagerAccessToken,
  validateGa4MeasurementProtocolEvent
} from '~~/workers/measurement-delivery/src/providers'
import { resolveMeasurementProviderCredential } from '~~/workers/measurement-delivery/src/credential'

function createMeasurementRuntimeCache(event: H3Event) {
  const kv = getKV(event)
  return kv
    ? createMeasurementProfileCachePublisher({
        get: key => kv.get(key, 'text'),
        put: (key, value, options) => kv.put(key, value, options)
      })
    : {
        async publish() {
          throw new Error('Measurement cache unavailable')
        }
      }
}

function transactionBoundRepositoryDeps(db: GodModeTransactionDb) {
  const query = async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
    const result = await db.query(sql, params)
    return (result.rows ?? []) as T[]
  }
  const queryOne = async <T = any>(sql: string, params?: any[]): Promise<T | null> => {
    const rows = await query<T>(sql, params)
    return rows[0] ?? null
  }
  const execute = async (sql: string, params?: any[]): Promise<number> => {
    const result = await db.query(sql, params)
    return result.rowCount ?? 0
  }
  const transaction = async <T>(callback: (transactionDb: any) => Promise<T>): Promise<T> => (
    await callback(db)
  )
  return { query, queryOne, execute, transaction }
}

export function createMeasurementProfileRuntime(event: H3Event, db?: GodModeTransactionDb) {
  const repository = db
    ? createPostgresMeasurementProfileRepository(transactionBoundRepositoryDeps(db) as any)
    : createPostgresMeasurementProfileRepository()
  return createMeasurementProfileService({
    repository,
    cache: createMeasurementRuntimeCache(event)
  })
}

export function createMeasurementDestinationRuntime(event: H3Event, db?: GodModeTransactionDb) {
  const deps = db ? transactionBoundRepositoryDeps(db) : null
  const profileRepository = deps
    ? createPostgresMeasurementProfileRepository(deps as any)
    : createPostgresMeasurementProfileRepository()
  return createMeasurementDestinationService({
    repository: deps
      ? createPostgresMeasurementDestinationRepository(deps as any)
      : createPostgresMeasurementDestinationRepository(),
    profileRepository,
    cache: createMeasurementRuntimeCache(event)
  })
}

export function createMeasurementReadRuntime() {
  return createMeasurementReadService({
    repository: createPostgresMeasurementReadRepository()
  })
}

export function createMeasurementActivationRuntime(event: H3Event) {
  const profileRepository = createPostgresMeasurementProfileRepository()
  return createMeasurementActivationService({
    repository: createPostgresMeasurementActivationRepository(),
    profileRepository,
    cache: createMeasurementRuntimeCache(event)
  })
}

export function createMeasurementOutcomeEndpointRuntime(event: H3Event) {
  const profileRepository = createPostgresMeasurementProfileRepository()
  return createMeasurementOutcomeEndpointService({
    repository: createPostgresMeasurementOutcomeEndpointRepository(),
    profileRepository,
    cache: createMeasurementRuntimeCache(event)
  })
}

export function createMeasurementProviderTestRuntime(event: H3Event) {
  const config = useRuntimeConfig(event)
  const googleConfig = resolveGoogleOAuthRuntimeConfig(event, {
    googleClientId: String(config.googleClientId || ''),
    googleClientSecret: String(config.googleClientSecret || '')
  })
  const providerFetch = globalThis.fetch.bind(globalThis)
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } })
    .cloudflare?.env ?? {}
  const healthService = createMeasurementHealthService({
    repository: createPostgresMeasurementHealthRepository()
  })
  return createMeasurementProviderTestService({
    repository: createPostgresMeasurementProviderTestRepository(),
    deliverMeta: input => deliverMetaConversionEvent({ ...input, fetch: providerFetch }),
    deliverGoogle: input => deliverGoogleDataManagerEvent({ ...input, fetch: providerFetch }),
    refreshGoogleAccessToken: input => refreshGoogleDataManagerAccessToken({
      ...input,
      fetch: providerFetch
    }),
    validateGa4: input => validateGa4MeasurementProtocolEvent({ ...input, fetch: providerFetch }),
    resolveProviderCredential: credentialRef => resolveMeasurementProviderCredential(
      env,
      credentialRef
    ),
    recordValidation: async (evidence) => {
      const { directlyExercised, inferred, ...rest } = evidence as Record<string, unknown>
      const result = await healthService.recordValidation({
        ...rest,
        reason: [
          String(rest.reason ?? ''),
          `[directly exercised: ${(directlyExercised as string[] ?? []).join(', ') || 'none'}]`,
          `[inferred: ${(inferred as string[] ?? []).join(', ') || 'none'}]`
        ].join(' ').slice(0, 1000)
      })
      return { healthStatus: result.healthStatus }
    },
    graphApiVersion: String(config.metaGraphApiVersion || 'v25.0'),
    googleClientId: googleConfig.googleClientId,
    googleClientSecret: googleConfig.googleClientSecret,
    now: () => new Date()
  })
}

export function createMeasurementAttestationRuntime(_event: H3Event) {
  return createMeasurementAttestationService({
    healthService: createMeasurementHealthService({
      repository: createPostgresMeasurementHealthRepository()
    }),
    readDestination: async ({ clientId, destinationId }) => {
      const row = await queryOne<{ enabled: boolean, environment: string }>(
        `SELECT enabled, environment
           FROM conversion_destinations
          WHERE client_id = $1 AND id = $2`,
        [clientId, destinationId]
      )
      return row ?? null
    },
    now: () => new Date()
  })
}
