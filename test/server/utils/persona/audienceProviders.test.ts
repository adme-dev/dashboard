import { describe, expect, it } from 'vitest'
import {
  hashAudienceMember,
  normalizeAudienceEmail,
  normalizeAudiencePhone,
  sha256AudienceValue
} from '../../../../server/utils/persona/audienceProviders'

describe('persona audience provider identifiers', () => {
  it('normalizes Australian contact data for provider matching', () => {
    expect(normalizeAudienceEmail(' Paul@Example.COM ')).toBe('paul@example.com')
    expect(normalizeAudiencePhone('0400 123 456')).toBe('+61400123456')
    expect(normalizeAudiencePhone('+61 400 123 456')).toBe('+61400123456')
  })

  it('hashes normalized identifiers locally and deterministically', async () => {
    const emailHash = await sha256AudienceValue('paul@example.com')
    const phoneHash = await sha256AudienceValue('+61400123456')
    await expect(hashAudienceMember({
      profileId: 'profile-1',
      email: ' Paul@Example.COM ',
      phone: '0400 123 456'
    })).resolves.toEqual({
      profileId: 'profile-1',
      emailHash,
      phoneHash,
      fingerprint: await sha256AudienceValue(`${emailHash}:${phoneHash}`)
    })
  })

  it('does not create a provider member without a matchable identifier', async () => {
    await expect(hashAudienceMember({ profileId: 'profile-1' })).resolves.toBeNull()
  })
})
