import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Google Merchant readiness route', () => {
  const source = readFileSync('server/api/agency/social/google/merchant-readiness.get.ts', 'utf8')

  it('requires media buying and exact client authorization before provider discovery', () => {
    expect(source).toContain(`requirePermission(event, 'MEDIA_BUYING')`)
    expect(source).toContain('requireSocialClientAccess(event, parsed.data.clientId)')
    expect(source).toContain('readGoogleMerchantReadiness')
    expect(source).not.toContain('createVehicleDataSource')
    expect(source).not.toContain('insertProduct')
  })
})
