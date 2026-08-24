import { describe, it, expect } from 'vitest'
import { qrShortUrl, qrExportUrl } from '../../app/composables/useQrCodes'

describe('useQrCodes helpers', () => {
  it('builds short and svg export urls', () => {
    expect(qrShortUrl('AbC1234')).toBe('https://app.xeroflow.io/q/AbC1234')
    expect(qrExportUrl('id1')).toBe('/api/agency/qr-codes/id1/export.svg')
  })
})
