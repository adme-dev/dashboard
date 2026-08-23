import { describe, expect, it } from 'vitest'
import { applyOverlayPlacement, normalizeOverlayPlacement, overlayOffset } from '~~/shared/utils/overlayPlacement'

const FRAME = { width: 1080, height: 1920 }
const AD = { width: 300, height: 600 }

describe('overlay placement', () => {
  it('defaults to native size at top-left (legacy behaviour)', () => {
    expect(overlayOffset(normalizeOverlayPlacement(null), FRAME, AD)).toEqual({ left: 0, top: 0, scale: 1 })
  })

  it('anchors with scale and inset measured on the shorter side', () => {
    expect(overlayOffset({ anchor: 'bottom-right', scale: 2, margin_pct: 5 }, FRAME, AD)).toEqual({ left: 1080 - 600 - 54, top: 1920 - 1200 - 54, scale: 2 })
    expect(overlayOffset({ anchor: 'center', scale: 1, margin_pct: 0 }, FRAME, AD)).toEqual({ left: 390, top: 660, scale: 1 })
    expect(overlayOffset({ anchor: 'top-center', scale: 0.5, margin_pct: 10 }, FRAME, AD)).toEqual({ left: 465, top: 108, scale: 0.5 })
  })

  it('clamps garbage and injects one style into <head>', () => {
    expect(normalizeOverlayPlacement({ anchor: 'nowhere' as never, scale: 99, margin_pct: -3 })).toEqual({ anchor: 'top-left', scale: 3, margin_pct: 0 })
    const html = applyOverlayPlacement('<html><head><meta charset="utf-8"></head><body><div class="ad"></div></body></html>', { anchor: 'bottom-left', scale: 1, margin_pct: 0 }, FRAME, AD)
    expect(html).toContain('data-overlay-placement')
    expect(html).toContain('left:0px!important;top:1320px!important;transform:scale(1)')
    expect(html.indexOf('</head>')).toBeGreaterThan(html.indexOf('data-overlay-placement'))
  })
})
