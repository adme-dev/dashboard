// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

const layers: Layer[] = [
  { id: 1, type: 'text', name: 'Reviewed invitation', text: 'PIZZA • DRINKS • TEST DRIVES', x: 10, y: 10, w: 200, h: 50, fontSize: 20, fontFamily: 'Arial', clipToBounds: true },
  { id: 2, type: 'rect', name: 'Invitation panel', x: 10, y: 10, w: 200, h: 80, fillColor: '#ffffff', clipToBounds: true },
  { id: 3, type: 'text', name: 'Unchanged legacy heading', text: 'Welcome', x: 10, y: 120, w: 200, h: 50, fontSize: 30, fontFamily: 'Arial' }
].map((layer, index) => ({ opacity: 1, zIndex: index, animIn: 'none', animOut: 'none', animInDur: 0, startTime: 0, endTime: 5, ...layer }) as Layer)

describe('scoped artwork export boundaries', () => {
  it.each([false, true])('preserves clipping in client and server output, animations=%s', (includeAnimations) => {
    const html = server('mrec', layers, { includeAnimations })
    expect(html).toBe(client('mrec', layers, { includeAnimations }))
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const id of [1, 2]) {
      const element = doc.querySelector<HTMLElement>(`[data-id="${id}"]`)!
      expect(element.style.overflow).toBe('hidden')
      expect(element.style.boxSizing).toBe('border-box')
      expect(element.style.width).toBe('200px')
    }
    expect(doc.querySelector<HTMLElement>('[data-id="3"]')!.style.overflow).toBe('')
    expect(doc.querySelector('[data-id="1"]')!.textContent).toContain(layers[0]!.text)
  })
})
