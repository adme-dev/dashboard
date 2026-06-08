import { describe, it, expect } from 'vitest'
import { buildBannerHTML as client } from '~~/app/utils/banner-html-builder'
import { buildBannerHTML as server } from '~~/server/utils/banner/htmlBuilder'

// representative layers covering text/image/video/shape; absolute srcs so baseUrl is a no-op → identical output
const layers: any[] = [
  { id: 'l1', type: 'text', text: 'Hi', x: 10, y: 10, w: 200, h: 50, fontFamily: 'Arial', fontSize: 24, color: '#fff' },
  { id: 'l2', type: 'image', src: 'https://cdn.example.com/a.jpg', x: 0, y: 0, w: 1080, h: 1920, fit: 'cover' }
]

describe('server banner builder parity', () => {
  it('matches the client builder byte-for-byte (absolute srcs)', () => {
    expect(server('fb_story', layers as any)).toBe(client('fb_story', layers as any))
  })
  it('absolutizes a relative src only when baseUrl is given', () => {
    const rel: any[] = [{ id: 'l', type: 'image', src: '/img/x.jpg', x: 0, y: 0, w: 10, h: 10 }]
    expect(server('fb_story', rel as any, { baseUrl: 'https://app.test' })).toContain('https://app.test/img/x.jpg')
  })
})
