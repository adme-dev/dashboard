import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import type { BannerBrandKit, BannerProject, Layer } from '../../app/types/banner-studio'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const { applyDesignProposal } = await import('../../server/utils/banner/designAssistant')
const { assertManagedQrCanvas } = await import('../../shared/bannerQrProtection')

function setup() {
  const studio = useBannerStudio()
  studio.loadProject({ id: 'qr-proof', name: 'QR proof', canvasData: { mrec: { layers: [] } } } as unknown as BannerProject)
  const qr = studio.addLayer({ type: 'image', src: '/owned-qr.svg', fit: 'contain', opacity: 1, platformQr: { version: 1, qrCodeId: '12345678-1234-4234-8234-123456789011', clientId: '12345678-1234-4234-8234-123456789012', assetId: '12345678-1234-4234-8234-123456789013', code: 'example', shortUrl: 'https://app.xeroflow.io/q/example', name: 'Brand QR', renderedAt: '2026-10-26T00:00:00.000Z', qrUpdatedAt: '2026-10-26T00:00:00.000Z', quietZone: 4, sourceQuietZone: 2, warnings: [], sha256: 'a'.repeat(64) }, animIn: 'none', animOut: 'none' })
  return { studio, qr }
}

describe('managed QR document protection', () => {
  it('rejects remote pixel replacement and masks while accepting remote movement', async () => {
    const { studio, qr } = setup()
    vi.stubGlobal('useBannerStudio', () => studio)
    vi.stubGlobal('useAuth', () => ({ user: ref({ id: 'me' }) }))
    vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900, location: { protocol: 'http:', host: 'localhost' } })
    const sockets: { onmessage: (event: { data: string }) => void }[] = []
    class Socket {
      onmessage = (_event: { data: string }) => {}
      close() {}
      constructor() { sockets.push(this) }
    }
    vi.stubGlobal('WebSocket', Socket)
    const { useBannerRealtime } = await import('../../app/composables/useBannerRealtime')
    const realtime = useBannerRealtime()
    realtime.connect('qr-proof')
    const message = (data: object) => sockets[0]!.onmessage({ data: JSON.stringify({ userId: 'other', formatKey: 'mrec', ...data }) })
    message({ type: 'layer_updated', layerId: qr.id, props: { src: '/fake.svg' } })
    expect(qr.src).toBe('/owned-qr.svg')
    message({ type: 'layer_updated', layerId: qr.id, props: { platformQr: null } })
    expect(qr.platformQr).toBeTruthy()
    message({ type: 'layer_added', layer: { id: 999, type: 'rect', isMask: true, maskTargetIds: [qr.id] } })
    expect(studio.activeLayers.value).toHaveLength(1)
    message({ type: 'layer_updated', layerId: qr.id, props: { x: 42 } })
    expect(studio.activeLayers.value[0]?.x).toBe(42)
    realtime.disconnect()
  })

  it('rejects malformed identity, effect and mask data', () => {
    const { studio } = setup()
    for (const changes of [{ id: undefined }, { id: '1' }, { keyframes: 'bad' }, { keyframes: { opacity: 1 } }, { maskTargetIds: 'bad' }, { feedBindings: {} }, { motionPath: 'bad' }]) {
      const canvas = studio.getCanvasData()
      Object.assign(canvas.mrec.layers[0]!, changes)
      expect(() => assertManagedQrCanvas(canvas)).toThrow()
    }
    const duplicate = studio.getCanvasData()
    duplicate.mrec.layers.push({ ...duplicate.mrec.layers[0]! })
    expect(() => assertManagedQrCanvas(duplicate)).toThrow()
  })

  it('blocks whole-canvas AI replacements and removals even when unlocked edits are allowed', () => {
    const { studio, qr } = setup()
    const before = studio.getCanvasData()
    for (const mutation of ['src', 'metadata', 'remove']) {
      const after = structuredClone(before)
      if (mutation === 'remove') after.mrec.layers = []
      else if (mutation === 'src') after.mrec.layers[0]!.src = '/redrawn.png'
      else delete after.mrec.layers[0]!.platformQr
      expect(() => studio.applyAssistantCanvas(after)).toThrow(/QR/)
      expect(studio.getCanvasData()).toEqual(before)
    }
    for (const operation of [{ updates: [{ formatKey: 'mrec', layerId: qr.id, changes: { opacity: 0.5 } }] }, { removals: [{ formatKey: 'mrec', layerId: qr.id }] }]) {
      expect(() => applyDesignProposal(JSON.stringify({ reply: 'Review', ...operation }), before, new Set(['/owned-qr.svg']), true)).toThrow(/QR/)
    }
  })

  it('does not replace a managed QR named Logo when applying a brand kit', () => {
    const { studio, qr } = setup()
    studio.updateLayer(qr.id, { name: 'Logo' })
    const before = studio.getCanvasData().mrec.layers[0]
    studio.applyBrandKit({ name: 'Brand', colors: [], fonts: [], logos: [{ url: '/new-logo.svg', variant: 'primary' }] } as unknown as BannerBrandKit, { insertLogo: false })
    expect(studio.getCanvasData().mrec.layers[0]).toEqual(before)
  })

  it('keeps code pixels and identity unchanged through ordinary property edits', () => {
    const { studio, qr } = setup()
    const before = structuredClone(studio.getCanvasData())
    for (const changes of [{ src: '/redrawn.png' }, { fit: 'cover' }, { opacity: 0.4 }, { platformQr: undefined }, { type: 'rect' }, { imageCrop: { x: 0, y: 0, w: 0.5, h: 0.5 } }, { visualFilter: 'blur(2px)' }]) {
      studio.updateLayer(qr.id, changes as Partial<Layer>)
      expect(studio.getCanvasData()).toEqual(before)
    }
    studio.updateLayer(qr.id, { x: 30, y: 40, w: 150, h: 150 })
    expect(studio.activeLayers.value[0]).toMatchObject({ x: 30, y: 40, fit: 'contain', platformQr: qr.platformQr })
    studio.undo()
    expect(studio.getCanvasData()).toEqual(before)
  })

  it('excludes a managed code from masks without changing other targets', () => {
    const { studio, qr } = setup()
    const other = studio.addLayer({ type: 'image', src: '/photo.png' })
    const mask = studio.addLayer({ type: 'rect' })
    studio.setMaskTargets(mask.id, [qr.id, other.id])
    expect(studio.activeLayers.value.find(l => l.id === mask.id)?.maskTargetIds).toEqual([other.id])
    studio.toggleMask(qr.id)
    expect(studio.activeLayers.value.find(l => l.id === qr.id)?.isMask).not.toBe(true)
  })
})
