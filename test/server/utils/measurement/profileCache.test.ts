import { describe, expect, it, vi } from 'vitest'
import { createMeasurementProfileCachePublisher } from '../../../../server/utils/measurement/profileCache'
import type { MeasurementProfileCacheProjection } from '../../../../server/utils/measurement/profileService'

const projection: MeasurementProfileCacheProjection = {
  profileId: '22222222-2222-4222-8222-222222222222',
  clientId: '11111111-1111-4111-8111-111111111111',
  enabled: false,
  environment: 'test',
  collectionTier: 'backend_only',
  trackingSiteId: null,
  firstPartyHostname: null,
  hostnameStatus: 'not_required',
  consentMode: 'consent_gated',
  configVersion: 2
}

function cache(existing: string | null = null) {
  return {
    get: vi.fn(async (_key: string) => existing),
    put: vi.fn(async (
      _key: string,
      _value: string,
      _options: { expirationTtl: number }
    ) => {})
  }
}

describe('Measurement profile cache publisher', () => {
  it('writes the exact redacted projection under a tenant-scoped key', async () => {
    const kv = cache()
    const publisher = createMeasurementProfileCachePublisher(kv, 3600)

    await publisher.publish(projection)

    expect(kv.put).toHaveBeenCalledWith(
      `measurement:profile:${projection.clientId}`,
      JSON.stringify(projection),
      { expirationTtl: 3600 }
    )
  })

  it('does not let an older version overwrite a newer projection', async () => {
    const kv = cache(JSON.stringify({ ...projection, configVersion: 3 }))
    const publisher = createMeasurementProfileCachePublisher(kv)

    await publisher.publish(projection)

    expect(kv.put).not.toHaveBeenCalled()
  })

  it('accepts a complete current projection without rewriting it', async () => {
    const kv = cache(JSON.stringify(projection))
    const publisher = createMeasurementProfileCachePublisher(kv)

    await publisher.publish(projection)

    expect(kv.put).not.toHaveBeenCalled()
  })

  it('replaces a divergent same-version value with the canonical projection', async () => {
    const kv = cache(JSON.stringify({ ...projection, consentMode: 'off' }))
    const publisher = createMeasurementProfileCachePublisher(kv)

    await publisher.publish(projection)

    expect(kv.put).toHaveBeenCalledWith(
      `measurement:profile:${projection.clientId}`,
      JSON.stringify(projection),
      { expirationTtl: 3600 }
    )
  })

  it('replaces malformed cache data with the validated canonical projection', async () => {
    const kv = cache('{"configVersion":"attacker-controlled"}')
    const publisher = createMeasurementProfileCachePublisher(kv)

    await publisher.publish(projection)

    expect(kv.put).toHaveBeenCalledOnce()
    expect(JSON.parse(kv.put.mock.calls[0]![1])).toEqual(projection)
  })
})
