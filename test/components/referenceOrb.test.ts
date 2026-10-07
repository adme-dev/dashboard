// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ReferenceOrb from '../../app/components/ai/ReferenceOrb.vue'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function mountOrb() {
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp(ReferenceOrb)
  app.mount(host)
  return host
}

describe('reference orb reduced motion frame', () => {
  it('captures an already cached image during mounting', () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true)
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400)
    const host = mountOrb()
    expect(drawImage).toHaveBeenCalledWith(host.querySelector('img'), 0, 0, 400, 300)
  })

  it('waits for a valid loaded frame before drawing', async () => {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    const complete = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false)
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0)
    const host = mountOrb()
    expect(drawImage).not.toHaveBeenCalled()
    complete.mockReturnValue(true)
    width.mockReturnValue(400)
    host.querySelector('img')!.dispatchEvent(new Event('load'))
    await nextTick()
    expect(drawImage).toHaveBeenCalledOnce()
  })
})
