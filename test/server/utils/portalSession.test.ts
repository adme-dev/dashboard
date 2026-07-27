import { describe, expect, it } from 'vitest'
import { digestPortalSessionToken } from '../../../server/utils/portalSession'

describe('portal session token digest', () => {
  it('returns the lowercase SHA-256 digest used by the indexed session lookup', async () => {
    await expect(digestPortalSessionToken('portal-session-token')).resolves.toBe(
      '3aa80ed56dafd59e468c6188742ca8eb9aa13220b8346ffb76ad382b089076a1'
    )
  })
})
