import { afterEach, expect, it, vi } from 'vitest'
import { waitForPreviewAssets } from '../../scripts/thebrief/preview-readiness.mjs'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function setup(decode: () => Promise<void>, fontsReady = Promise.resolve()) {
  const urls: string[] = []
  vi.stubGlobal('document', { fonts: Object.assign([], { ready: fontsReady }) })
  vi.stubGlobal('Image', class {
    naturalWidth = 1200
    naturalHeight = 800
    set src(value: string) { urls.push(value) }
    decode = decode
  })
  return urls
}

it('waits for decoded hidden-slide artwork and fonts, deduplicating artwork requests', async () => {
  let decoded!: () => void, loaded!: () => void
  const urls = setup(() => new Promise<void>((resolve) => {
    decoded = resolve
  }), new Promise<void>((resolve) => {
    loaded = resolve
  }))
  let ready = false
  const result = waitForPreviewAssets(['./later-slide.png', './later-slide.png']).then(() => {
    ready = true
  })
  expect(urls).toEqual(['./later-slide.png'])
  decoded()
  await Promise.resolve()
  expect(ready).toBe(false)
  loaded()
  await result
  expect(ready).toBe(true)
})

it('fails visibly instead of marking a broken artwork or font ready', async () => {
  setup(async () => {
    throw new Error('broken image')
  })
  await expect(waitForPreviewAssets(['./missing.png'])).rejects.toThrow('Artwork failed to decode: ./missing.png')
  setup(async () => {})
  vi.stubGlobal('document', { fonts: Object.assign([{ status: 'error', load: async () => {} }], { ready: Promise.resolve() }) })
  await expect(waitForPreviewAssets(['./valid.png'])).rejects.toThrow('font failed to load')
})

it('loads unused later-slide font faces before reporting readiness', async () => {
  setup(async () => {})
  let loaded!: () => void
  const face = { status: 'unloaded', load: vi.fn(() => new Promise<void>((resolve) => {
    loaded = resolve
  })) }
  vi.stubGlobal('document', { fonts: Object.assign([face], { ready: Promise.resolve() }) })
  let ready = false
  const result = waitForPreviewAssets([]).then(() => {
    ready = true
  })
  expect(face.load).toHaveBeenCalledOnce()
  await Promise.resolve()
  expect(ready).toBe(false)
  face.status = 'loaded'
  loaded()
  await result
  expect(ready).toBe(true)
})

it('bounds a stalled decode and clears the readiness timer', async () => {
  vi.useFakeTimers()
  setup(() => new Promise<void>(() => {}))
  const result = expect(waitForPreviewAssets(['./stalled.png'])).rejects.toThrow('did not become ready within 20 seconds')
  await vi.advanceTimersByTimeAsync(20000)
  await result
  expect(vi.getTimerCount()).toBe(0)
})
