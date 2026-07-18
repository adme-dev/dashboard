import { describe, expect, it, vi } from 'vitest'
import { resolveMeasurementProviderCredential } from '../../workers/measurement-delivery/src/credential'

describe('measurement provider credential resolver', () => {
  it('resolves a Pages encrypted-secret string from an allowlisted measurement binding', async () => {
    await expect(resolveMeasurementProviderCredential({
      MEASUREMENT_PROVIDER_META_BIG_GARAGE: '  dataset-token  '
    }, 'MEASUREMENT_PROVIDER_META_BIG_GARAGE')).resolves.toBe('dataset-token')
  })

  it('resolves a Workers Secrets Store binding without exposing the value', async () => {
    const get = vi.fn(async () => 'dataset-token')

    await expect(resolveMeasurementProviderCredential({
      MEASUREMENT_PROVIDER_META_BIG_GARAGE: { get }
    }, 'MEASUREMENT_PROVIDER_META_BIG_GARAGE')).resolves.toBe('dataset-token')
    expect(get).toHaveBeenCalledOnce()
  })

  it.each([
    null,
    '',
    'GOOGLE_CLIENT_SECRET',
    'cloudflare/measurement/meta/big-garage',
    'MEASUREMENT_PROVIDER_meta_token'
  ])('refuses absent or non-allowlisted binding references: %s', async (credentialRef) => {
    await expect(resolveMeasurementProviderCredential({
      GOOGLE_CLIENT_SECRET: 'must-not-leak',
      MEASUREMENT_PROVIDER_META_TOKEN: 'must-not-leak'
    }, credentialRef)).resolves.toBeNull()
  })
})
