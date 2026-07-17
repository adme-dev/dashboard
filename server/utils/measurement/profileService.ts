import { ClientMeasurementProfileStateSchema, UpdateClientMeasurementProfileSchema } from '~~/server/utils/measurement/contracts'
import type { UpdateClientMeasurementProfile } from '~~/server/utils/measurement/contracts'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import type {
  MeasurementProfile,
  MeasurementProfileRepository
} from '~~/server/utils/measurement/profileRepository'

export interface MeasurementProfileCacheProjection {
  profileId: string
  clientId: string
  enabled: boolean
  environment: 'test' | 'live' | 'paused'
  collectionTier: 'cloudflare_owned' | 'first_party_cname' | 'shared_endpoint' | 'backend_only'
  trackingSiteId: string | null
  firstPartyHostname: string | null
  hostnameStatus: 'not_required' | 'pending' | 'active' | 'error'
  consentMode: 'off' | 'au_optout' | 'consent_gated'
  configVersion: number
}

export interface MeasurementProfileCachePublisher {
  publish(profile: MeasurementProfileCacheProjection): Promise<void>
}

export interface MeasurementProfileServiceDeps {
  repository: MeasurementProfileRepository
  cache: MeasurementProfileCachePublisher
}

export interface MeasurementProfileUpdateResult {
  profile: MeasurementProfile
  warnings: Array<{ code: 'MEASUREMENT_CACHE_STALE' }>
}

function validationError() {
  return new MeasurementError(
    'MEASUREMENT_VALIDATION_ERROR',
    422,
    'Invalid measurement profile configuration'
  )
}

function notFoundError() {
  return new MeasurementError(
    'MEASUREMENT_NOT_FOUND',
    404,
    'Measurement profile not found'
  )
}

export function toMeasurementProfileCacheProjection(
  profile: MeasurementProfile
): MeasurementProfileCacheProjection {
  return {
    profileId: profile.id,
    clientId: profile.clientId,
    enabled: profile.enabled,
    environment: profile.environment,
    collectionTier: profile.collectionTier,
    trackingSiteId: profile.trackingSiteId,
    firstPartyHostname: profile.firstPartyHostname,
    hostnameStatus: profile.hostnameStatus,
    consentMode: profile.consentMode,
    configVersion: profile.configVersion
  }
}

export async function repairMeasurementProfileCacheFromCanonical(
  deps: Pick<MeasurementProfileServiceDeps, 'repository' | 'cache'>,
  supersededProfile: MeasurementProfile
): Promise<void> {
  let observedVersion = supersededProfile.configVersion

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let latest: MeasurementProfile | null
    try {
      latest = await deps.repository.getByClientId(supersededProfile.clientId)
    } catch {
      return
    }
    if (!latest || latest.configVersion <= observedVersion) return

    try {
      await deps.cache.publish(toMeasurementProfileCacheProjection(latest))
    } catch {
      try {
        await deps.repository.recordCachePublication({
          clientId: latest.clientId,
          profileId: latest.id,
          configVersion: latest.configVersion,
          status: 'stale',
          errorClass: 'cache_repair_failed'
        })
      } catch {
        // Neon remains canonical; the stale response warning triggers operational follow-up.
      }
      return
    }

    try {
      const repaired = await deps.repository.recordCachePublication({
        clientId: latest.clientId,
        profileId: latest.id,
        configVersion: latest.configVersion,
        status: 'fresh',
        errorClass: null
      })
      if (repaired) return
    } catch {
      return
    }

    observedVersion = latest.configVersion
  }
}

export function createMeasurementProfileService(deps: MeasurementProfileServiceDeps) {
  return {
    async get(clientId: string): Promise<MeasurementProfile> {
      const clientResult = UpdateClientMeasurementProfileSchema.shape.clientId.safeParse(clientId)
      if (!clientResult.success) throw validationError()

      const profile = await deps.repository.getByClientId(clientResult.data)
      if (!profile) throw notFoundError()
      return profile
    },

    async update(rawInput: UpdateClientMeasurementProfile): Promise<MeasurementProfileUpdateResult> {
      const inputResult = UpdateClientMeasurementProfileSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()
      const input = inputResult.data

      const current = await deps.repository.getByClientId(input.clientId)
      if (!current) throw notFoundError()
      if (current.configVersion !== input.expectedVersion) {
        throw new MeasurementError(
          'MEASUREMENT_VERSION_CONFLICT',
          409,
          'Measurement profile changed; refresh before updating'
        )
      }

      const nextResult = ClientMeasurementProfileStateSchema.safeParse({
        ...current,
        ...input.patch,
        configVersion: current.configVersion + 1,
        cacheStatus: 'not_published',
        cacheVersion: null,
        cacheErrorClass: null
      })
      if (!nextResult.success) throw validationError()
      const next = nextResult.data

      if (next.enabled || next.environment === 'live') {
        throw new MeasurementError(
          'MEASUREMENT_DISABLED',
          409,
          'Live measurement activation requires the dedicated approval gate'
        )
      }

      const persisted = await deps.repository.update({
        clientId: input.clientId,
        expectedVersion: input.expectedVersion,
        nextProfile: next,
        changedFields: Object.keys(input.patch),
        actor: input.actor,
        reason: input.reason
      })

      if (persisted.status === 'not_found') throw notFoundError()
      if (persisted.status === 'version_conflict') {
        throw new MeasurementError(
          'MEASUREMENT_VERSION_CONFLICT',
          409,
          'Measurement profile changed; refresh before updating'
        )
      }

      const warnings: MeasurementProfileUpdateResult['warnings'] = []
      let cacheStatus: 'fresh' | 'stale' = 'fresh'
      let cacheErrorClass: string | null = null

      try {
        await deps.cache.publish(toMeasurementProfileCacheProjection(persisted.profile))
      } catch {
        cacheStatus = 'stale'
        cacheErrorClass = 'cache_publication_failed'
        warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
      }

      try {
        const cacheHealthRecorded = await deps.repository.recordCachePublication({
          clientId: persisted.profile.clientId,
          profileId: persisted.profile.id,
          configVersion: persisted.profile.configVersion,
          status: cacheStatus,
          errorClass: cacheErrorClass
        })
        if (!cacheHealthRecorded) {
          if (warnings.length === 0) warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
          await repairMeasurementProfileCacheFromCanonical(deps, persisted.profile)
          return { profile: persisted.profile, warnings }
        }
      } catch {
        if (warnings.length === 0) warnings.push({ code: 'MEASUREMENT_CACHE_STALE' })
        return { profile: persisted.profile, warnings }
      }

      return {
        profile: {
          ...persisted.profile,
          cacheStatus,
          cacheVersion: cacheStatus === 'fresh' ? persisted.profile.configVersion : null,
          cacheErrorClass
        },
        warnings
      }
    }
  }
}
