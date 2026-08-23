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
  it('injects the render runtime contract for animated exports', () => {
    const html = server('fb_story', layers as any)
    expect(html).toContain('window.__engagrTimeline = tl')
    expect(html).toContain('window.__engagrFrame')
    expect(html).toContain('getVisibleElements')
  })
  it('omits the render runtime when animations are disabled', () => {
    expect(server('fb_story', layers as any, { includeAnimations: false })).not.toContain('window.__engagrFrame')
  })
  it('absolutizes a relative src only when baseUrl is given', () => {
    const rel: any[] = [{ id: 'l', type: 'image', src: '/img/x.jpg', x: 0, y: 0, w: 10, h: 10 }]
    expect(server('fb_story', rel as any, { baseUrl: 'https://app.test' })).toContain('https://app.test/img/x.jpg')
  })
  it('exports custom cubic eases on motion path tweens as inline CustomEase (both builders)', () => {
    const mp: any[] = [{
      id: 'b', type: 'text', text: 'Go', x: 10, y: 10, w: 100, h: 30, startTime: 0, endTime: 3,
      motionPath: [{ x: 0, y: 0 }, { x: 50, y: -50 }, { x: 100, y: 0 }],
      motionPathTweens: [
        { startTime: 0, endTime: 1.5, pathStart: 0, pathEnd: 0.5, ease: 'cubic-bezier(0.2,1.6,0.8,-0.4)' },
        { startTime: 1.5, endTime: 3, pathStart: 0.5, pathEnd: 1, ease: 'power2.inOut' },
      ],
    }]
    const html = server('fb_story', mp as any)
    expect(html).toBe(client('fb_story', mp as any))
    expect(html).toContain('CustomEase.min.js')
    expect(html).toContain('gsap.registerPlugin(MotionPathPlugin, CustomEase)')
    expect(html).toContain("ease: CustomEase.create('', 'M0,0 C0.2,1.6 0.8,-0.4 1,1')")
    expect(html).toContain("ease: 'power2.inOut'")
  })
  it('exports custom entrance/exit curves from the easing editor', () => {
    const l: any[] = [{ id: 't', type: 'text', text: 'Hi', x: 0, y: 0, w: 10, h: 10, animIn: 'fadeIn', ease: 'cubic-bezier(0.3,0,0.2,1)', animOut: 'fadeOut', animOutEase: 'cubic-bezier(0.5,0,1,0.5)', startTime: 0, endTime: 3 }]
    const html = server('fb_story', l as any)
    expect(html).toBe(client('fb_story', l as any))
    expect(html).toContain('CustomEase.min.js')
    expect(html).toContain("CustomEase.create('', 'M0,0 C0.3,0 0.2,1 1,1')")
    expect(html).toContain("CustomEase.create('', 'M0,0 C0.5,0 1,0.5 1,1')")
  })
  it('does not load CustomEase when no tween uses a custom curve', () => {
    const mp: any[] = [{ id: 'b', type: 'text', text: 'Go', x: 0, y: 0, w: 10, h: 10, motionPath: [{ x: 0, y: 0 }, { x: 5, y: 5 }] }]
    expect(server('fb_story', mp as any)).not.toContain('CustomEase')
  })
})
