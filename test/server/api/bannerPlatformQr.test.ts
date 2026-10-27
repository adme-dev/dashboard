import { createHash, createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  write: vi.fn(),
  fresh: vi.fn(),
  execute: vi.fn(),
  projectAccess: vi.fn(),
  qrAccess: vi.fn(),
  qrClient: vi.fn(),
  delivery: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn()
}))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: m.write }))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: m.fresh,
  execute: m.execute
}))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  requireSocialClientAccess: m.projectAccess
}))
vi.mock('~~/server/utils/qr/access', () => ({
  requireQrCodeAccess: m.qrAccess,
  shortUrl: (code: string) => `https://app.xeroflow.io/q/${code}`
}))
vi.mock('~~/server/utils/qr/permissions', () => ({
  requireQrClientAccess: m.qrClient
}))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({
  resolveBannerAssetDelivery: m.delivery
}))
vi.mock('~~/server/utils/bannerStorage', () => ({
  bannerAssetDeliveryUrl: async (id: string) =>
    `https://app.test/api/public/banner-assets/${id}`,
  createBannerAssetStorageKey: () => 'banner-assets/request/key.svg',
  uploadBannerAsset: m.upload,
  deleteBannerFile: m.remove
}))
vi.mock('~~/server/utils/appUrl', () => ({
  getAppUrl: () => 'https://app.test'
}))
const { insertBannerPlatformQr }
  = await import('../../../server/utils/banner/platformQr')
const projectId = '00000000-0000-4000-8000-000000000001',
  qrCodeId = '00000000-0000-4000-8000-000000000002',
  clientId = '00000000-0000-4000-8000-000000000003',
  revision = '2026-10-26T00:00:00.000Z'
const event = { context: {} } as unknown as import('h3').H3Event
let project: { id: string, client_id: string | null, updated_at: string },
  qr: {
    id: string
    client_id: string
    code: string
    name: string
    is_active: boolean
    updated_at: string
    style: Record<string, unknown>
    frame: Record<string, unknown>
  }
const input = () => ({ qrCodeId, sourceRevision: revision })
beforeEach(() => {
  vi.resetAllMocks()
  project = { id: projectId, client_id: clientId, updated_at: revision }
  qr = {
    id: qrCodeId,
    client_id: clientId,
    code: 'AbCd1234',
    name: 'Campaign landing page',
    is_active: true,
    updated_at: revision,
    style: { margin: 4 },
    frame: {}
  }
  m.write.mockResolvedValue({ id: 'user' })
  m.qrAccess.mockResolvedValue({ user: { id: 'user' }, row: qr })
  m.fresh.mockImplementation(async (sql: string) =>
    sql.includes('banner_projects') ? project : qr
  )
  m.delivery.mockReturnValue({ signingSecret: 'x'.repeat(32) })
  m.remove.mockResolvedValue(undefined)
})
describe('platform QR insertion asset boundary', () => {
  it('renders the existing canonical platform QR into a signed owned SVG without creating a QR or changing project', async () => {
    const result = await insertBannerPlatformQr(event, projectId, input())
    expect(result).toMatchObject({
      projectId,
      sourceRevision: revision,
      asset: { mimeType: 'image/svg+xml' },
      platformQr: {
        version: 1,
        qrCodeId,
        clientId,
        code: 'AbCd1234',
        shortUrl: 'https://app.xeroflow.io/q/AbCd1234',
        name: qr.name,
        qrUpdatedAt: revision
      }
    })
    expect(result.asset.width).toBeGreaterThan(0)
    expect(result.asset.sha256).toHaveLength(64)
    expect(result.platformQr.assetId).toBe(result.asset.id)
    expect(m.projectAccess).toHaveBeenCalledWith(event, clientId)
    expect(m.qrAccess).toHaveBeenCalledWith(event, qrCodeId)
    expect(m.qrClient).toHaveBeenCalledWith(event, clientId)
    expect(
      m.execute.mock.calls.every(
        ([sql]) =>
          !sql.includes('INSERT INTO qr_')
          && !sql.includes('UPDATE banner_projects')
      )
    ).toBe(true)
    expect(m.upload.mock.calls[0][2]).toBe('image/svg+xml')
    const bytes = m.upload.mock.calls[0][0]
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    expect(result.asset.sha256).toBe(sha256)
    const signature = createHmac('sha256', 'x'.repeat(32)).update(JSON.stringify([
      'xeroflow:banner-platform-qr:v1', result.asset.id, clientId,
      qrCodeId, qr.code, sha256
    ])).digest('hex')
    const [, params] = m.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO banner_assets'))!
    expect(params[8]).toEqual(['platform-qr', `qr:${qrCodeId}`, `platform-qr-attestation:v1:${signature}`])
  })
  it('enforces write access, assigned project, QR access, same client and active QR before upload', async () => {
    m.write.mockRejectedValueOnce({ statusCode: 401 })
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 401 })
    project.client_id = null
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 400 })
    project.client_id = clientId
    m.qrAccess.mockRejectedValueOnce({ statusCode: 403 })
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 403 })
    qr.client_id = 'other'
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 403 })
    qr.client_id = clientId
    qr.is_active = false
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
  })
  it('rejects stale revision and arbitrary QR input fields', async () => {
    await expect(
      insertBannerPlatformQr(event, projectId, {
        ...input(),
        url: 'https://arbitrary'
      })
    ).rejects.toMatchObject({ statusCode: 400 })
    project.updated_at = '2026-10-27T00:00:00Z'
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(m.upload).not.toHaveBeenCalled()
  })
  it('compensates only the generated asset when project or QR changes during upload', async () => {
    m.upload.mockImplementationOnce(async () => {
      project.updated_at = '2026-10-27T00:00:00Z'
    })
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(m.remove).toHaveBeenCalled()
    expect(
      m.execute.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO banner_assets')
      )
    ).toBe(false)
    project.updated_at = revision
    m.upload.mockImplementationOnce(async () => {
      qr.updated_at = '2026-10-28T00:00:00Z'
    })
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 409 })
  })
  it('rejects unsafe saved SVG logos and low contrast without modifying QR settings', async () => {
    qr.style = { margin: 4, fg: '#eeeeee', bg: '#ffffff' }
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 400 })
    qr.style = {
      margin: 4,
      logo: {
        dataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
        sizePct: 20,
        padding: 1
      }
    }
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(m.upload).not.toHaveBeenCalled()
  })
  it('cleans up this new object and row after post-insert revision failure', async () => {
    m.execute.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO banner_assets'))
        project.updated_at = '2026-10-29T00:00:00Z'
    })
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(m.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM banner_assets'),
      expect.any(Array)
    )
    expect(m.remove).toHaveBeenCalled()
  })
})

describe('platform QR rendering and failure integrity', () => {
  it('adds a documented minimum quiet zone without changing the saved style and returns framed geometry', async () => {
    qr.style = { margin: 2 }
    qr.frame = { style: 'label-below', label: 'Scan to enter' }
    const before = JSON.stringify(qr)
    const result = await insertBannerPlatformQr(event, projectId, input())
    expect(result.platformQr).toMatchObject({
      quietZone: 4,
      sourceQuietZone: 2
    })
    expect(result.platformQr.warnings[0]).toContain(
      'saved QR code settings are unchanged'
    )
    expect(result.asset.height).toBeGreaterThan(result.asset.width)
    expect(JSON.stringify(qr)).toBe(before)
  })
  it('uses the existing deterministic QR renderer for the canonical short URL', async () => {
    const { renderQrSvg } = await import('../../../shared/qr/render-svg')
    const { QrStyleSchema } = await import('../../../shared/qr/style')
    const expected = renderQrSvg({
      text: 'https://app.xeroflow.io/q/AbCd1234',
      style: QrStyleSchema.parse({ margin: 4 })
    })
    await insertBannerPlatformQr(event, projectId, input())
    expect(m.upload.mock.calls[0][0].toString('utf8')).toBe(expected)
  })
  it('does not upload if signed delivery is unavailable; cleans a partial upload or failed row insert', async () => {
    m.delivery.mockReturnValueOnce({ signingSecret: null })
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 503 })
    expect(m.upload).not.toHaveBeenCalled()
    m.upload.mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toThrow('Storage unavailable')
    expect(m.remove).toHaveBeenCalledTimes(1)
    m.execute.mockRejectedValueOnce(new Error('Database unavailable'))
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toThrow('Database unavailable')
    expect(m.remove).toHaveBeenCalledTimes(2)
  })
  it('rejects a client change during storage even if the revision string did not change', async () => {
    m.upload.mockImplementationOnce(async () => {
      project.client_id = '00000000-0000-4000-8000-000000000004'
    })
    await expect(
      insertBannerPlatformQr(event, projectId, input())
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(
      m.execute.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO banner_assets')
      )
    ).toBe(false)
    expect(m.remove).toHaveBeenCalled()
  })
})
