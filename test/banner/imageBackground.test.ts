import { describe, expect, it } from 'vitest'
import { isBannerImageBackground, bannerImageBackgroundCss } from '../../shared/bannerImageBackground.mjs'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'

describe('editable source image background framing', () => {
  it.each(['repeat', 'no-repeat'])('retains off-centre fixed-pixel %s framing identically in both renderers', repeat => {
    const imageBackground = { size: '172.79999999999998px', position: '89% 0px', repeat }
    const layers: any[] = [{ id: 1, type: 'image', name: 'Logo', src: 'https://example.com/logo.png', x: 1, y: 2, w: 177.4422, h: 177.4422, borderRadius: 88.7211, imageBackground }]
    const html = client('custom_1200x1200', layers)
    expect(server('custom_1200x1200', layers)).toBe(html)
    expect(html).toContain(bannerImageBackgroundCss(imageBackground))
    expect(html).toContain('border-radius:88.7211px')
    expect(html).toContain('https://example.com/logo.png')
  })
  it.each([
    { size: '0px', position: '50% 50%', repeat: 'repeat' },
    { size: '1px;background:url(x)', position: '50% 50%', repeat: 'repeat' },
    { size: '20px', position: '101% 50%', repeat: 'repeat' },
    { size: '20px', position: '50% 50%', repeat: 'round' },
    { size: '20px', position: '50% 50%', repeat: 'repeat', url: 'https://example.com' },
  ])('rejects unbounded or injected framing %j', value => {
    expect(isBannerImageBackground(value)).toBe(false)
    expect(bannerImageBackgroundCss(value)).toBe('')
  })
})
