import { describe, expect, it } from 'vitest'
import { isGoogleProfileAccountDiscoveryPath } from '~~/server/utils/social/googleProfileAccountDiscoveryGodMode'

const PROFILE_ID = '47030c6c-f67a-4150-968a-258c24e2c124'
const ROUTE = `/api/agency/social/google/profiles/${PROFILE_ID}/discover-account`

describe('Google profile account discovery God mode boundary', () => {
  it('admits only the exact profile-scoped discovery route', () => {
    expect(isGoogleProfileAccountDiscoveryPath(ROUTE)).toBe(true)
    expect(isGoogleProfileAccountDiscoveryPath(`${ROUTE}/extra`)).toBe(false)
    expect(isGoogleProfileAccountDiscoveryPath(
      '/api/agency/social/google/profiles/not-a-uuid/discover-account'
    )).toBe(false)
  })
})
