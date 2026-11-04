import { expect, it, vi } from 'vitest'
import { DesignModuleError } from '../../shared/emailRendering/designModules'
import { assertCanonicalCampaignReady } from '../../server/utils/email-marketing/designCampaigns'
import { preparedCampaignHtml, type Campaign } from '../../server/utils/email-marketing/campaigns'

it('refuses an unresolved canonical projection before any mirror fetch or upload', async () => {
  const fetchAsset = vi.fn(async () => {
    throw new Error('external mirror reached')
  })
  const uploadAsset = vi.fn()
  await expect(preparedCampaignHtml({ id: crypto.randomUUID(), client_id: crypto.randomUUID(),
    email_design_revision_id: crypto.randomUUID(), body_html: '<img src="https://external.example/image.png">' } as Campaign,
  { appUrl: 'https://app.example', mirrorExternalAssets: true, fetchAsset, uploadAsset,
    canonicalDb: { query: async () => ({ rows: [] }) } } as never)).rejects.toMatchObject({ statusCode: 409 })
  expect(fetchAsset).not.toHaveBeenCalled()
  expect(uploadAsset).not.toHaveBeenCalled()
})

it.each([new Error('database offline'), Object.assign(new Error('transport timeout'), { code: 'ETIMEDOUT' })])('keeps unknown canonical readiness failure transient rather than image-correction guidance', async (failure) => {
  const db = { query: async () => {
    throw failure
  } }
  await expect(assertCanonicalCampaignReady({ id: crypto.randomUUID() } as Campaign, db)).rejects.toBe(failure)
})
it('maps registered storage unavailability to 503 rather than image correction', async () => {
  const db = { query: async () => {
    throw new DesignModuleError('ASSET_STORAGE_UNAVAILABLE')
  } }
  await expect(assertCanonicalCampaignReady({ id: crypto.randomUUID() } as Campaign, db)).rejects.toMatchObject({ statusCode: 503, statusMessage: 'ASSET_STORAGE_UNAVAILABLE' })
})
