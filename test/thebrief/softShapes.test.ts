import { describe, expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import'
import type { Layer } from '../../app/types/banner-studio'
import { source } from './fixture'

// TheBrief ground shadows are blurred, fully rounded shapes (Mahindra eejlpxy).
const shape = (content: string) => source.replace('data-eltype="text"', 'data-eltype="shape"')
  .replace('<div class="row">Hello world</div>', `<div style="transform:rotate(3deg)">${content}</div>`)
const shadow = '<div id="c-1" style="background-color:#141414;border-radius:100%;filter:blur(8px)"></div>'

describe('soft TheBrief shapes', () => {
  it('converts a blurred fully rounded shape into an editable blurred ellipse', async () => {
    const result = await convertTheBriefHtml(shape(shadow))
    const layer = result.canvasData.custom_300x250.layers.find(l => l.type === 'rect')
    expect(layer).toMatchObject({ rectShape: 'ellipse', visualFilter: 'blur(8px)', rotation: 3, fillColor: '#141414' })
    expect(layer.borderRadius).toBeUndefined()
    expect(result.warnings.join(' ')).not.toMatch(/corner radii/)
    const square = await convertTheBriefHtml(shape(shadow.replace('border-radius:100%', 'border-radius:50%')))
    expect(square.canvasData.custom_300x250.layers.find(l => l.type === 'rect').rectShape).toBe('ellipse')
  })

  it('holds corner geometry and shape effects it cannot reproduce instead of flattening them', async () => {
    await expect(convertTheBriefHtml(shape(shadow.replace('border-radius:100%', 'border-radius:30%')))).rejects.toThrow(/corner radii need an adapter/)
    await expect(convertTheBriefHtml(shape(shadow.replace('border-radius:100%', 'border-radius:10px 0 10px 0')))).rejects.toThrow(/corner radii need an adapter/)
    await expect(convertTheBriefHtml(shape(shadow.replace('filter:blur(8px)', 'box-shadow:0 2px 4px #000')))).rejects.toThrow(/box shadow/)
    await expect(convertTheBriefHtml(shape(shadow.replace('filter:blur(8px)', 'border:2px solid #fff')))).rejects.toThrow(/shape border/)
    await expect(convertTheBriefHtml(shape(shadow.replace('blur(8px)', 'url(#warp)')))).rejects.toThrow(/shape filter/)
  })

  it('renders the ellipse and blur identically in client and server exports', () => {
    const layer: Layer = { id: 1, type: 'rect', name: 'Shadow', x: 0, y: 0, w: 271, h: 28, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 2, fillColor: '#141414', rectShape: 'ellipse', visualFilter: 'blur(8px)', borderRadius: 4 }
    const html = client('mrec', [layer])
    expect(html).toContain('border-radius:50%;filter:blur(8px);')
    expect(html).not.toContain('border-radius:4px')
    expect(server('mrec', [layer])).toBe(html)
    expect(client('mrec', [{ ...layer, visualFilter: 'blur(1px);background:url(https://example.com)' }])).not.toContain('example.com')
  })

  it('accepts the ellipse only on rectangle layers in import packages', () => {
    const pkg = (extra: Record<string, unknown>) => ({
      kind: 'xeroflow-thebrief-import', version: 1, name: 'Shadow',
      source: { designHash: 'abc123', sha256: 'a'.repeat(64), folder: 'Mahindra', duration: 2, loopCount: 0 },
      canvasData: { custom_300x250: { layers: [{ id: 1, type: 'rect', name: 'Shadow', x: 0, y: 0, w: 300, h: 30, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 2, fillColor: '#141414', ...extra }] } },
      warnings: [], assets: [], fonts: []
    })
    expect(parseTheBriefPackage(pkg({ rectShape: 'ellipse', visualFilter: 'blur(8px)' })).canvasData.custom_300x250!.layers[0]).toMatchObject({ rectShape: 'ellipse' })
    expect(() => parseTheBriefPackage(pkg({ rectShape: 'ellipse', borderRadius: 4 }))).toThrow(/Ellipse/)
    expect(() => parseTheBriefPackage(pkg({ type: 'text', text: 'x', rectShape: 'ellipse' }))).toThrow(/Ellipse/)
    expect(() => parseTheBriefPackage(pkg({ rectShape: 'circle' }))).toThrow()
  })
})
