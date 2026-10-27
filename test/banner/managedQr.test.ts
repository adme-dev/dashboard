import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import type { BannerProject } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onScopeDispose', () => {})
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio }
  = await import('../../app/composables/useBannerStudio')
vi.stubGlobal('useBannerStudio', useBannerStudio)
const list = vi.fn(),
  fetcher = vi.fn(),
  sendLayerAdd = vi.fn()
vi.stubGlobal('useQrCodes', () => ({ list }))
vi.stubGlobal('useBannerRealtime', () => ({ sendLayerAdd }))
const { useBannerQr, managedQrPlacement }
  = await import('../../app/composables/useBannerQr')
const projectId = '12345678-1234-4234-8234-123456789012',
  clientId = '12345678-1234-4234-8234-123456789013',
  qrId = '12345678-1234-4234-8234-123456789014',
  assetId = '12345678-1234-4234-8234-123456789015',
  revision = '2026-10-26T01:00:00.000Z'
const studio = useBannerStudio()
const code = () => ({
  id: qrId,
  name: 'Ringwood map',
  code: 'ABcd1234',
  client_id: clientId,
  is_active: true,
  destination_url: 'https://maps.google.com/approved'
})
function project() {
  return {
    id: projectId,
    clientId,
    name: 'Managed QR trial',
    updatedAt: revision,
    canvasData: { custom_1000x1000: { layers: [] } }
  } as unknown as BannerProject
}
function response() {
  return {
    projectId,
    sourceRevision: revision,
    asset: {
      id: assetId,
      url: 'https://example.invalid/owned-qr.svg',
      mimeType: 'image/svg+xml',
      width: 400,
      height: 500,
      sha256: 'a'.repeat(64)
    },
    platformQr: {
      version: 1,
      qrCodeId: qrId,
      clientId,
      code: 'ABcd1234',
      shortUrl: 'https://app.xeroflow.io/q/ABcd1234',
      name: 'Ringwood map',
      renderedAt: revision,
      assetId,
      qrUpdatedAt: revision,
      quietZone: 4,
      sourceQuietZone: 4,
      warnings: [],
      sha256: 'a'.repeat(64)
    }
  }
}
async function setup() {
  const api = useBannerQr()
  list.mockResolvedValueOnce({ codes: [code()] })
  await api.show()
  api.selectedId.value = qrId
  return api
}
beforeEach(() => {
  studio.loadProject(project())
  fetcher.mockReset()
  list.mockReset()
  sendLayerAdd.mockClear()
  vi.stubGlobal('$fetch', fetcher)
})
describe('managed Banner Studio QR insertion', () => {
  it('preserves framed aspect, includes whole code and stays within the artboard', () => {
    expect(
      managedQrPlacement({ width: 400, height: 500 }, { w: 1000, h: 1000 })
    ).toEqual({ x: 760, y: 710, w: 200, h: 250 })
    expect(() =>
      managedQrPlacement({ width: 0, height: 500 }, { w: 1000, h: 1000 })
    ).toThrow()
  })
  it('requires assigned client and never lists another client or inactive records', async () => {
    const api = useBannerQr()
    studio.state.project!.clientId = null
    await api.show()
    expect(list).not.toHaveBeenCalled()
    expect(api.error.value).toContain('Assign a client')
    studio.state.project!.clientId = clientId
    list.mockResolvedValueOnce({
      codes: [
        code(),
        { ...code(), id: assetId, is_active: false },
        { ...code(), id: projectId, client_id: assetId }
      ]
    })
    await api.show()
    expect(list).toHaveBeenCalledWith({ clientId })
    expect(api.codes.value.map(item => item.id)).toEqual([qrId])
  })
  it('adds a separate nonanimated managed image and saves metadata through undo/redo and reload', async () => {
    const api = await setup()
    fetcher
      .mockResolvedValueOnce({ ...project(), updatedAt: revision })
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(project())
    await api.insert()
    expect(studio.activeLayers.value).toHaveLength(1)
    expect(studio.activeLayers.value[0]).toMatchObject({
      type: 'image',
      fit: 'contain',
      animIn: 'none',
      animOut: 'none',
      platformQr: {
        qrCodeId: qrId,
        shortUrl: 'https://app.xeroflow.io/q/ABcd1234'
      }
    })
    expect(fetcher.mock.calls[2][1].body).toEqual({
      qrCodeId: qrId,
      sourceRevision: revision
    })
    expect(sendLayerAdd).toHaveBeenCalledTimes(1)
    const saved = studio.getCanvasData()
    studio.undo()
    expect(studio.activeLayers.value).toHaveLength(0)
    studio.redo()
    expect(studio.getCanvasData()).toEqual(saved)
    studio.loadProject({ ...project(), canvasData: saved })
    expect(studio.activeLayers.value[0].platformQr?.qrCodeId).toBe(qrId)
  })
  it.each(['selection', 'document', 'project', 'code', 'cancel'])(
    'ignores pending assets after %s changes',
    async (change) => {
      const api = await setup()
      let finish!: (value: unknown) => void
      fetcher
        .mockResolvedValueOnce(project())
        .mockResolvedValueOnce(project())
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              finish = resolve
            })
        )
      const pending = api.insert()
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
      if (change === 'selection') studio.state.selectedLayerId = 99
      if (change === 'document')
        studio.addLayer({ type: 'text', text: 'Do not replace' })
      if (change === 'project')
        studio.loadProject({ ...project(), id: assetId })
      if (change === 'code') api.selectedId.value = 'none'
      if (change === 'cancel') api.cancel()
      const before = studio.getCanvasData()
      finish(response())
      await pending
      expect(studio.getCanvasData()).toEqual(before)
      expect(studio.activeLayers.value.some(layer => layer.platformQr)).toBe(
        false
      )
    }
  )
  it('blocks duplicate clicks during one pending operation', async () => {
    const api = await setup()
    let finish!: (value: unknown) => void
    fetcher
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      .mockResolvedValueOnce(project())
    const pending = api.insert()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    await api.insert()
    expect(fetcher).toHaveBeenCalledTimes(3)
    finish(response())
    await pending
    expect(studio.activeLayers.value).toHaveLength(1)
  })
  it('rejects a mismatched record/client response before any broadcast', async () => {
    const api = await setup()
    fetcher
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce({
        ...response(),
        platformQr: { ...response().platformQr, clientId: assetId }
      })
    await api.insert()
    expect(studio.activeLayers.value).toHaveLength(0)
    expect(sendLayerAdd).not.toHaveBeenCalled()
    expect(api.error.value).toContain('match')
  })
  it('rejects incomplete or noncanonical metadata before adding any layer', async () => {
    const api = await setup()
    fetcher
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce({
        ...response(),
        platformQr: {
          ...response().platformQr,
          shortUrl: 'https://maps.google.com/guessed'
        }
      })
    await api.insert()
    expect(studio.activeLayers.value).toHaveLength(0)
    expect(sendLayerAdd).not.toHaveBeenCalled()
    expect(api.error.value).toContain('incomplete')
  })
  it('retains an unsaved local QR after a save conflict without enabling accidental duplicate insertion', async () => {
    const api = await setup()
    fetcher
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(project())
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce({ statusCode: 409 })
    await api.insert()
    expect(studio.activeLayers.value).toHaveLength(1)
    expect(studio.state.isDirty).toBe(true)
    expect(api.selectedId.value).toBe('none')
    await api.insert()
    expect(studio.activeLayers.value).toHaveLength(1)
    expect(api.error.value).toContain('could not be saved')
  })
  it('provides a manager link and explicit forbidden state', async () => {
    const api = useBannerQr()
    list.mockRejectedValueOnce({ statusCode: 403 })
    await api.show()
    expect(api.error.value).toContain('access')
    expect(api.managerUrl.value).toContain('/agency/qr-codes?clientId=')
  })
})
