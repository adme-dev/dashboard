import { describe, it, expect } from 'vitest'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

describe('text padding export parity', () => {
  it.each([[0, 0], [32, 18], [undefined, undefined]])('keeps horizontal %s and vertical %s padding in both exports', (paddingH, paddingV) => {
    const layer = { id: 1, type: 'text', text: 'Padding', bgColor: '#fff', x: 0, y: 0, w: 200, h: 80, opacity: 1, paddingH, paddingV } as Layer
    const html = client('mrec', [layer], { includeAnimations: false })
    expect(html).toContain(`padding:${paddingV ?? 4}px ${paddingH ?? 10}px;`)
    expect(server('mrec', [layer], { includeAnimations: false })).toBe(html)
  })
})
