import { describe, expect, it } from 'vitest'
import { assertScopedDesignTransition, assertScopedDesignSource, validateDesignScope, type BannerDesignScope } from '../../shared/bannerDesignScope'
import { buildBannerHTML } from '../../app/utils/banner-html-builder'
import type { ArtboardState, Layer } from '../../app/types/banner-studio'

const layer = (id: number, extra: Partial<Layer> = {}): Layer => ({ id, type: 'text', name: 'Heading', text: 'Welcome home', x: 10, y: 10, w: 200, h: 30, zIndex: id, opacity: 1, clipToBounds: true, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5, ...extra })
const source = (): Record<string, ArtboardState> => ({ custom_600x800: { layers: [layer(1), layer(2, { name: 'Map', type: 'image', text: undefined, src: '/api/public/banner-assets/map', x: 350, y: 500 }), layer(3, { name: 'Terms', text: '$500 OFF*', y: 700, copyLocked: true })] } })
const scope = (): BannerDesignScope => ({ formatKey: 'custom_600x800', layerIds: [1], region: { x: 0, y: 0, w: 300, h: 450 }, approvedCopy: ['PIZZA • DRINKS • TEST DRIVES', 'Launch night · Thursday 12 November'] })
const check = (change: (canvas: ReturnType<typeof source>) => void, spec = scope()) => {
  const before = source()
  const after = structuredClone(before)
  change(after)
  return assertScopedDesignTransition(before, after, spec)
}

describe('scoped design proposal preservation', () => {
  it('clips scoped text in exported previews to keep large glyphs inside the checked box', () => {
    const html = buildBannerHTML('mrec', [layer(1, { fontSize: 500 })], { includeAnimations: false })
    expect(html).toContain('overflow:hidden;box-sizing:border-box;')
  })
  it('rejects changed text without a renderer clipping boundary', () => {
    expect(() => check((c) => {
      c.custom_600x800.layers[0]!.clipToBounds = false
      c.custom_600x800.layers[0]!.y = 20
    })).toThrow(/clip/i)
  })
  it('accepts bounded native layout and exact human-approved invitation text', () => {
    expect(check((c) => {
      c.custom_600x800.layers[0]!.text = 'PIZZA • DRINKS • TEST DRIVES'
      c.custom_600x800.layers[0]!.y = 120
    })).toMatchObject({ affectedLayerIds: [1], protectedLayerIds: [2, 3] })
  })
  it.each(['text', 'x', 'src', 'copyLocked'])('rejects any unselected layer mutation: %s', (property) => {
    expect(() => check((c) => {
      (c.custom_600x800.layers[1] as unknown as Record<string, unknown>)[property] = property === 'x' ? 12 : 'altered'
    })).toThrow(/protected/i)
  })
  it('rejects protected selection even with exact replacement copy', () => {
    expect(() => validateDesignScope(source(), { ...scope(), layerIds: [3]
    })).toThrow(/protected/i)
  })
  it('rejects copy invented outside the explicit review inventory', () => {
    expect(() => check((c) => {
      c.custom_600x800.layers[0]!.text = 'Free pizza at 6pm'
    })).toThrow(/approved/i)
  })
  it('rejects invented time and free claims even if entered in the proposal inventory', () => {
    expect(() => validateDesignScope(source(), { ...scope(), approvedCopy: ['Free drinks at 6pm']
    })).toThrow(/time|free/i)
  })
  it('rejects a layer leaving the approved region', () => {
    expect(() => check((c) => {
      c.custom_600x800.layers[0]!.x = 200
    })).toThrow(/region/i)
  })
  it('rejects additions over protected geometry and cross-format mutations', () => {
    expect(() => check((c) => {
      c.custom_600x800.layers.push(layer(4, { x: 350, y: 500, text: 'PIZZA • DRINKS • TEST DRIVES'
      }))
    }, { ...scope(), region: { x: 0, y: 0, w: 600, h: 800 }
    })).toThrow(/overlap/i)
    expect(() => check((c) => {
      c.fb_sq = { layers: [] }
    })).toThrow(/format/i)
  })
  it('rejects board metadata changes and layer reordering', () => {
    expect(() => check((c) => {
      c.custom_600x800.bgColor = '#000000'
    })).toThrow(/metadata/i)
    expect(() => check((c) => {
      c.custom_600x800.layers.reverse()
    })).toThrow(/order/i)
  })
  it.each([{ rotation: 40 }, { opacity: 0.2 }, { isMask: true, maskTargetIds: [2] }, { animIn: 'slideD' }, { textShadow: '0 900px black' }, { motionPath: [{ x: 400, y: 500 }] }])('rejects visual effects that escape the checked region: %j', (extra) => {
    expect(() => check((c) => {
      Object.assign(c.custom_600x800.layers[0]!, extra)
    })).toThrow(/static|effect/i)
  })
  it('accepts editor migration defaults but rejects tampering with saved protected content before the request', () => {
    const saved = source(), request = structuredClone(saved)
    for (const layer of request.custom_600x800.layers) Object.assign(layer, { delay: 0, dur: 0, animOut: 'fadeOut', animOutEase: 'power1.in' })
    expect(() => assertScopedDesignSource(saved, request, scope())).not.toThrow()
    request.custom_600x800.layers[2]!.copyLocked = false
    expect(() => assertScopedDesignSource(saved, request, scope())).toThrow(/saved|protected/i)
  })
  it('accepts a static source with the editor default fade-out, without accepting newly animated proposals', () => {
    const c = source()
    c.custom_600x800.layers[0]!.animOut = 'fadeOut'
    expect(() => validateDesignScope(c, scope())).not.toThrow()
    const after = structuredClone(c)
    after.custom_600x800.layers[0]!.y = 40
    expect(() => assertScopedDesignTransition(c, after, scope())).toThrow(/static/i)
  })
  it.each(['image', 'bg'] as const)('blocks a standard-format flattened %s even with a text overlay', (type) => {
    const c = { fb_sq: { layers: [layer(1), layer(4, { type, src: '/api/public/banner-assets/flat', x: 0, y: 0, w: 1080, h: 1080 })] } }
    expect(() => validateDesignScope(c, { ...scope(), formatKey: 'fb_sq'
    })).toThrow(/flat|background/i)
  })
  it('blocks a fully flattened original without reviewed background reconstruction', () => {
    const c = source()
    c.custom_600x800.layers = [layer(1, { type: 'image', text: undefined, src: '/api/public/banner-assets/flat', x: 0, y: 0, w: 600, h: 800 })]
    expect(() => validateDesignScope(c, scope())).toThrow(/flat|background/i)
  })
  it('retains a reviewed reconstruction clean plate while allowing native additions above it', () => {
    const c = source()
    c.custom_600x800.reconstruction = { schemaVersion: 1, source: { sha256: 'a'.repeat(64), width: 600, height: 800 }, background: { status: 'clean', reviewed: true, sha256: 'b'.repeat(64), method: 'repaired' }, physical: { width: 210, height: 297, unit: 'mm' }, warnings: [], elements: [{ layerId: 4, role: 'background', provenance: 'repair' }] }
    c.custom_600x800.layers.unshift(layer(4, { type: 'image', name: 'background', text: undefined, src: '/api/public/banner-assets/clean', x: 0, y: 0, w: 600, h: 800, zIndex: 0
    }))
    const after = structuredClone(c)
    after.custom_600x800.layers.push(layer(5, { text: 'PIZZA • DRINKS • TEST DRIVES', y: 160
    }))
    expect(assertScopedDesignTransition(c, after, scope())).toMatchObject({ affectedLayerIds: [5] })
    after.custom_600x800.layers[0]!.src = '/api/public/banner-assets/flat'
    expect(() => assertScopedDesignTransition(c, after, scope())).toThrow(/protected/i)
  })
})
