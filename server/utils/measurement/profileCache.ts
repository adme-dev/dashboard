import { z } from 'zod'
import type {
  MeasurementProfileCacheProjection,
  MeasurementProfileCachePublisher
} from '~~/server/utils/measurement/profileService'

interface MeasurementProfileKV {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>
}

const MeasurementProfileCacheProjectionSchema = z.strictObject({
  profileId: z.string().uuid(),
  clientId: z.string().uuid(),
  enabled: z.boolean(),
  environment: z.enum(['test', 'live', 'paused']),
  collectionTier: z.enum(['cloudflare_owned', 'first_party_cname', 'shared_endpoint', 'backend_only']),
  trackingSiteId: z.string().uuid().nullable(),
  firstPartyHostname: z.string().trim().min(1).max(253).toLowerCase().nullable(),
  hostnameStatus: z.enum(['not_required', 'pending', 'active', 'error']),
  consentMode: z.enum(['off', 'au_optout', 'consent_gated']),
  configVersion: z.number().int().positive()
})

function parseExisting(raw: string | null): MeasurementProfileCacheProjection | null {
  if (!raw) return null
  try {
    const result = MeasurementProfileCacheProjectionSchema.safeParse(JSON.parse(raw))
    // The repository runs with TypeScript strictness disabled, which makes Zod's
    // inferred object properties optional. Runtime parsing still proves the
    // complete strict projection before this boundary cast.
    return result.success ? result.data as MeasurementProfileCacheProjection : null
  } catch {
    return null
  }
}

export function createMeasurementProfileCachePublisher(
  kv: MeasurementProfileKV,
  ttlSeconds = 3600
): MeasurementProfileCachePublisher {
  const ttl = z.number().int().min(60).max(86400).parse(ttlSeconds)

  return {
    async publish(rawProjection) {
      const projection = MeasurementProfileCacheProjectionSchema.parse(rawProjection)
      const key = `measurement:profile:${projection.clientId}`
      const current = parseExisting(await kv.get(key))

      if (current?.configVersion && current.configVersion > projection.configVersion) return
      if (
        current?.configVersion === projection.configVersion
        && JSON.stringify(current) === JSON.stringify(projection)
      ) return

      await kv.put(key, JSON.stringify(projection), { expirationTtl: ttl })
    }
  }
}
