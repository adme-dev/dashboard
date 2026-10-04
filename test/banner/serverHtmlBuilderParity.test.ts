import { describe, it, expect } from 'vitest'
import gsap from 'gsap'
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

describe('imported sizes and animated mask export', () => {
  it('calculates export masks after delayed tweens and reverse seeks', () => {
    const masked: any[] = [
      { id: 1, type: 'text', text: 'Reveal', x: 0, y: 0, w: 200, h: 40, opacity: 1, startTime: 0, endTime: 3,
        keyframes: { x: [{ time: 1, value: 0 }, { time: 2, value: 100, easing: 'none' }] } },
      { id: 2, type: 'rect', isMask: true, maskTargetIds: [1], x: 0, y: 0, w: 200, h: 40, opacity: 1, startTime: 0, endTime: 3,
        keyframes: { opacity: [{ time: 0, value: 1 }, { time: 3, value: 1 }] } }
    ]
    const html = client('mrec', masked)
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match => match[1]!.includes('const tl ='))![1]!
    const nodes: Record<string, any> = Object.fromEntries([1, 2].map(id => [`[data-id="${id}"]`, { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, style: {} }]))
    const tl = gsap.timeline({ paused: true })
    const wrapped: any = { eventCallback: tl.eventCallback.bind(tl) }
    for (const method of ['set', 'to', 'fromTo'] as const) {
      wrapped[method] = (selector: string, ...args: any[]) => (tl[method] as any).call(tl, nodes[selector], ...args)
    }
    const window: any = {}
    new Function('gsap', 'document', 'window', script)(
      { timeline: () => wrapped, getProperty: (node: any, key: string) => node[key] },
      { querySelector: (selector: string) => nodes[selector] }, window,
    )
    tl.seek(1.5, false)
    const target = nodes['[data-id="1"]']
    expect(target.style.clipPath).toBe(`inset(0px ${target.x}px 0px 0px)`)
    expect(target.x).toBeGreaterThan(0)
    tl.seek(1.25, false)
    expect(target.style.clipPath).toBe(`inset(0px ${target.x}px 0px 0px)`)
    tl.seek(0)
    window.__engagrUpdateMasks()
    expect(target.style.clipPath).toBe('inset(0px 0px 0px 0px)')
    tl.kill()
  })
  it('preserves custom image canvas dimensions on both render paths', () => {
    const html = client('custom_1092x1440', layers as any)
    expect(html).toBe(server('custom_1092x1440', layers as any))
    expect(html).toContain('width: 1092px')
    expect(html).toContain('height: 1440px')
  })
  it('keeps mask keyframes, motion paths and animated target positions in the exported timeline', () => {
    const masked: any[] = [
      { id: 1, type: 'text', text: 'Reveal', x: 0, y: 0, w: 200, h: 40, opacity: 1, startTime: 0, endTime: 5 },
      { id: 2, type: 'rect', isMask: true, maskTargetIds: [1], x: 0, y: 0, w: 200, h: 40, startTime: 0, endTime: 5,
        keyframes: { scaleX: [{ time: 0, value: 0 }, { time: 2, value: 1 }] } }
    ]
    const html = client('mrec', masked)
    expect(html).toBe(server('mrec', masked))
    expect(html).toContain('visibility:hidden!important')
    expect(html).toContain("tl.set('[data-id=\"2\"]', { scaleX: 0 }, 0)")
    expect(html).toContain("tl.to('[data-id=\"2\"]', { scaleX: 1, duration: 2.000")
    expect(html).toContain('x1=(mask.x-t.x)/t.sx')
  })
})
