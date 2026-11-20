import { expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import pngjs from 'pngjs'
import { captureCompositeOverlays } from '../../workers/audio-jobs/container/overlayCapture.mjs'

vi.mock('../../workers/audio-jobs/container/frameRuntime.mjs', () => ({
  resolveFrameRuntime: vi.fn()
    .mockResolvedValueOnce({ mode: 'runtime', duration: 1 })
    .mockResolvedValueOnce({ mode: 'runtime', duration: 1.5 }),
  seekFrameRuntime: vi.fn(),
  waitForBannerAssets: vi.fn()
}))

it('counts actual captured PNGs across overlays with runtime-defined lengths, despite a telemetry failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'capture-counter-'))
  try {
    const png = pngjs.PNG.sync.write({ width: 2, height: 2, data: Buffer.alloc(16) } as any)
    const page = { setViewport: vi.fn(), setContent: vi.fn(), screenshot: async () => png, close: async () => {} }
    const browser = { newPage: async () => page }
    const inputs = [{ clipId: 'a', framesPattern: '' }, { clipId: 'b', framesPattern: '' }]
    const overlays = inputs.map(input => ({ ...input, html: '<body></body>', fps: 2, width: 2, height: 2, durationSec: 0.25 }))
    const observed: any[] = []
    await captureCompositeOverlays(browser, overlays, inputs, dir, new AbortController().signal, next => {
      observed.push(next)
      if (next.framesDone === 1) throw new Error('observer unavailable')
    })
    expect(observed.map(p => [p.framesDone, p.framesTotal])).toEqual([
      [0, undefined], [1, undefined], [2, undefined], [2, 5], [3, 5], [4, 5], [5, 5]
    ])
    expect(await readdir(join(dir, 'overlay-0'))).toHaveLength(2)
    expect(await readdir(join(dir, 'overlay-1'))).toHaveLength(3)
    expect(inputs[1].framesPattern).toBe(join(dir, 'overlay-1', 'ovl_%05d.png'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
