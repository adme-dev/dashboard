import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive, ref, watch } from 'vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'
import { hashBridgeValue } from '../../shared/bannerDocumentBridge'
import { companionBlockReason } from '../../shared/bannerCompanion'
import type { CompanionRequest } from '../../shared/bannerCompanion'

vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('watch', watch)
vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 1000 })
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
const { useBannerCompanion } = await import('../../app/composables/useBannerCompanion')
const studio = useBannerStudio()
const cleanups: Array<() => void> = []
const bounds = { left: 0, top: 0, right: 170, bottom: 30 }
const project = (): BannerProject =>
  ({
    id: 'project-1',
    name: 'Letter',
    updatedAt: '2026-10-27T00:00:00Z',
    clientId: null,
    canvasData: {
      mrec: {
        layers: [
          {
            id: 1,
            type: 'text',
            name: 'Heading',
            text: 'Welcome home',
            x: 10,
            y: 20,
            w: 280,
            h: 100,
            fontSize: 24,
            fontFamily: 'Source Sans 3',
            fontWeight: 700,
            color: '#112233',
            zIndex: 1,
            opacity: 1,
            animIn: 'none',
            animOut: 'none',
            animInDur: 0,
            startTime: 0,
            endTime: 5
          },
          {
            id: 2,
            type: 'rect',
            name: 'Untouched artwork',
            x: 1,
            y: 2,
            w: 10,
            h: 10,
            zIndex: 2,
            opacity: 1,
            animIn: 'none',
            animOut: 'none',
            animInDur: 0,
            startTime: 0,
            endTime: 5
          }
        ]
      }
    }
  }) as BannerProject
function file(request: CompanionRequest, text = 'Come say hello') {
  const { snapshot: _, ...identity } = request
  const raw = JSON.stringify({
    ...identity,
    text,
    engine: { name: 'PhotoCraft', version: '0.16.0', platform: 'linux' }
  })
  return { size: new TextEncoder().encode(raw).length, text: async () => raw }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function setup() {
  const measure = vi.fn(async () => ({ ...bounds }))
  const hash = vi.fn(hashBridgeValue)
  const download = vi.fn()
  const api = useBannerCompanion({ measure, hash, download })
  cleanups.push(api.dispose)
  return { api, measure, hash, download }
}
beforeEach(() => {
  studio.loadProject(project())
  studio.selectLayer(1)
})
afterEach(() => cleanups.splice(0).forEach(dispose => dispose()))

describe('companion transient authority and reviewed transaction', () => {
  it('exports complete current canonical source, with random per-session request IDs', async () => {
    const { api, download } = setup()
    studio.updateLayer(2, { x: 11 })
    expect(await api.downloadRequest()).toBe(true)
    const request = JSON.parse(download.mock.calls[0]![0])
    expect(request.snapshot.canvasData).toEqual(studio.getCanvasData())
    expect(request.sourceHash).toBe(await hashBridgeValue(request.snapshot))
    expect(request.snapshot.updatedAt).toBe(studio.state.project!.updatedAt)
    expect(await api.downloadRequest()).toBe(true)
    expect(JSON.parse(download.mock.calls[1]![0]).requestId).not.toBe(request.requestId)
  })
  it('requires human review, freshly remeasures at apply, changes two fields and uses exactly one undo', async () => {
    const { api, measure } = setup(),
      before = studio.getCanvasData()
    const request = await api.createRequest()
    expect(request, api.error.value || api.blockReason.value).not.toBeNull()
    expect(await api.importFile(file(request!))).toBe(true)
    expect(api.previewLayer.value!.text).toBe('Come say hello')
    expect(studio.getCanvasData()).toEqual(before)
    expect(await api.apply()).toBe(false)
    api.reviewed.value = true
    expect(await api.apply()).toBe(true)
    expect(measure).toHaveBeenCalledTimes(2)
    const after = studio.getCanvasData(),
      edited = after.mrec!.layers[0]!
    expect(edited).toEqual({ ...before.mrec!.layers[0], text: 'Come say hello', companionEdit: edited.companionEdit })
    expect(edited.companionEdit).toMatchObject({
      engineVerified: false,
      sourceHash: request!.sourceHash,
      requestId: request!.requestId
    })
    expect(after.mrec!.layers[1]).toEqual(before.mrec!.layers[1])
    expect(companionBlockReason(edited, after.mrec!.layers)).toBe('')
    expect(await api.apply()).toBe(false)
    studio.undo()
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
    studio.redo()
    expect(studio.getCanvasData()).toEqual(after)
    const persisted = { ...project(), canvasData: after }
    studio.loadProject(persisted)
    expect(studio.getCanvasData()).toEqual(after)
    expect(api.request.value).toBeNull()
  })
  it('keeps managed QR bytes and metadata exact across apply and undo', async () => {
    const canvas = studio.getCanvasData()
    canvas.mrec!.layers.push({
      id: 3,
      type: 'image',
      name: 'Managed QR',
      x: 1,
      y: 1,
      w: 50,
      h: 50,
      zIndex: 3,
      opacity: 1,
      fit: 'contain',
      src: '/owned.svg',
      animIn: 'none',
      animOut: 'none',
      animInDur: 0,
      startTime: 0,
      endTime: 5,
      platformQr: {
        version: 1,
        qrCodeId: '12345678-1234-4234-8234-123456789014',
        clientId: '12345678-1234-4234-8234-123456789013',
        code: 'ABcd1234',
        shortUrl: 'https://app.xeroflow.io/q/ABcd1234',
        name: 'Map',
        renderedAt: '2026-10-26T01:00:00.000Z',
        assetId: '12345678-1234-4234-8234-123456789015',
        qrUpdatedAt: '2026-10-26T01:00:00.000Z',
        quietZone: 4,
        sourceQuietZone: 4,
        warnings: [],
        sha256: 'a'.repeat(64)
      }
    } as Layer)
    studio.loadProject({ ...project(), canvasData: canvas })
    studio.selectLayer(1)
    const { api } = setup(),
      before = studio.getCanvasData()
    const request = await api.createRequest()
    expect(await api.importFile(file(request!))).toBe(true)
    api.reviewed.value = true
    expect(await api.apply()).toBe(true)
    expect(JSON.stringify(studio.getCanvasData().mrec!.layers[2])).toBe(JSON.stringify(before.mrec!.layers[2]))
    studio.undo()
    expect(studio.getCanvasData()).toEqual(before)
  })
  it('never establishes authority from an imported request or proposal after reload', async () => {
    const first = setup(),
      request = await first.api.createRequest()
    first.api.dispose()
    const { api, measure } = setup()
    expect(await api.importFile(file(request!))).toBe(false)
    expect(api.error.value).toContain('No active request')
    expect(measure).not.toHaveBeenCalled()
    const fresh = await api.createRequest()
    const raw = JSON.stringify(fresh)
    expect(await api.importFile({ size: raw.length, text: async () => raw })).toBe(false)
    expect(api.proposal.value).toBeNull()
  })
  it.each(['selection', 'away-back', 'canvas', 'edit-undo', 'revision', 'project', 'close', 'dispose', 'new-request'])(
    'invalidates a reviewed file on %s',
    async (change) => {
      const { api } = setup(),
        request = await api.createRequest()
      await api.importFile(file(request!))
      api.reviewed.value = true
      if (change === 'selection') studio.selectLayer(2)
      if (change === 'away-back') {
        studio.selectLayer(2)
        studio.selectLayer(1)
      }
      if (change === 'canvas') studio.updateLayer(2, { x: 11 })
      if (change === 'edit-undo') {
        studio.updateLayer(1, { x: 11 })
        studio.undo()
      }
      if (change === 'revision') studio.state.project!.updatedAt = 'later'
      if (change === 'project') {
        studio.loadProject(project())
        studio.selectLayer(1)
      }
      if (change === 'close') api.close()
      if (change === 'dispose') api.dispose()
      if (change === 'new-request') await api.createRequest()
      const before = studio.getCanvasData()
      expect(await api.apply()).toBe(false)
      expect(studio.getCanvasData()).toEqual(before)
      expect(api.proposal.value).toBeNull()
    }
  )
  it.each(['file', 'import-hash', 'import-font', 'apply-hash', 'apply-font'])(
    'rejects an away-and-back selection race during %s',
    async (stage) => {
      const { api, hash, measure } = setup(),
        request = await api.createRequest()
      if (stage.startsWith('apply')) {
        await api.importFile(file(request!))
        api.reviewed.value = true
      }
      const gate = deferred<unknown>(),
        entered = deferred<boolean>()
      let originalFile = file(request!)
      const stall = () => {
        entered.resolve(true)
        return gate.promise
      }
      if (stage === 'file') originalFile = { ...originalFile, text: async () => await stall() as string }
      if (stage.endsWith('hash')) hash.mockImplementationOnce(async () => await stall() as string)
      if (stage.endsWith('font')) measure.mockImplementationOnce(async () => await stall() as typeof bounds)
      const pending = stage.startsWith('apply') ? api.apply() : api.importFile(originalFile)
      await entered.promise
      studio.selectLayer(2)
      studio.selectLayer(1)
      gate.resolve(
        stage === 'file' ? await file(request!).text() : stage.endsWith('hash') ? request!.sourceHash : bounds
      )
      expect(await pending).toBe(false)
      expect(api.proposal.value).toBeNull()
      expect(studio.selectedLayer.value!.text).toBe('Welcome home')
      expect(studio.canUndo.value).toBe(false)
    }
  )
  it('cancels request hashing on unmount and cannot download a late request', async () => {
    const gate = deferred<string>(),
      download = vi.fn(),
      scope = effectScope()
    const api = scope.run(() => useBannerCompanion({ hash: () => gate.promise, download }))!
    const pending = api.downloadRequest()
    scope.stop()
    gate.resolve('a'.repeat(64))
    expect(await pending).toBe(false)
    expect(download).not.toHaveBeenCalled()
    expect(api.request.value).toBeNull()
  })
  it('takes only the latest file read and resets previous human approval', async () => {
    const { api } = setup(),
      request = await api.createRequest(),
      slow = deferred<string>()
    const pending = api.importFile({ size: 500, text: () => slow.promise })
    expect(await api.importFile(file(request!, 'Hello again'))).toBe(true)
    api.reviewed.value = true
    slow.resolve(await file(request!).text())
    expect(await pending).toBe(false)
    expect(api.proposal.value!.text).toBe('Hello again')
    expect(await api.importFile(file(request!))).toBe(true)
    expect(api.reviewed.value).toBe(false)
  })
  it('rejects large files before reading and counts decoded UTF-8 bytes too', async () => {
    const { api } = setup()
    await api.createRequest()
    const text = vi.fn(async () => '{}')
    expect(await api.importFile({ size: 65537, text })).toBe(false)
    expect(text).not.toHaveBeenCalled()
    expect(await api.importFile({ size: 1, text: async () => 'é'.repeat(32769) })).toBe(false)
    expect(api.error.value).toContain('size limit')
  })
  it('fails closed when font verification fails or fresh apply measurement overflows', async () => {
    const { api, measure } = setup(),
      request = await api.createRequest()
    measure.mockRejectedValueOnce(new Error('Pinned font checksum mismatch'))
    expect(await api.importFile(file(request!))).toBe(false)
    expect(api.error.value).toContain('checksum')
    await api.importFile(file(request!))
    api.reviewed.value = true
    measure.mockResolvedValueOnce({ left: 0, top: 0, right: 5000, bottom: 20 })
    expect(await api.apply()).toBe(false)
    expect(api.error.value).toContain('does not fit')
    expect(studio.canUndo.value).toBe(false)
  })
  it('freezes reviewed text and rejects revocation during fresh measurement', async () => {
    const { api, measure } = setup(),
      request = await api.createRequest()
    await api.importFile(file(request!))
    expect(Object.isFrozen(api.proposal.value)).toBe(true)
    expect(() => {
      Object.assign(api.proposal.value!, { text: 'Changed after review' })
    }).toThrow()
    api.reviewed.value = true
    const gate = deferred<typeof bounds>(),
      entered = deferred<boolean>()
    measure.mockImplementationOnce(() => {
      entered.resolve(true)
      return gate.promise
    })
    const pending = api.apply()
    await entered.promise
    api.reviewed.value = false
    gate.resolve(bounds)
    expect(await pending).toBe(false)
    expect(studio.canUndo.value).toBe(false)
  })
})
