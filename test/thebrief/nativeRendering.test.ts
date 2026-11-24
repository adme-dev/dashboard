import { describe, expect, it } from 'vitest'
import gsap from 'gsap'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import type { Layer } from '../../app/types/banner-studio'

describe('Imported native artwork rendering', () => {
  const layer: Layer = { id: 1, type: 'rect', name: 'Blend', x: 0, y: 0, w: 20, h: 20, zIndex: 1, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 4, fillColor: '#353535', mixBlendMode: 'color' }

  it('preserves imported blend modes in client and server exports', () => {
    expect(client('mrec', [layer])).toContain('mix-blend-mode:color;')
    expect(server('mrec', [layer])).toBe(client('mrec', [layer]))
  })

  it('rejects CSS injection in the imported blend mode', () => {
    const unsafe = { ...layer, mixBlendMode: 'color;background:url(https://example.com)' } as Layer
    expect(client('mrec', [unsafe])).not.toContain('mix-blend-mode:')
    expect(server('mrec', [unsafe])).not.toContain('mix-blend-mode:')
  })

  it('preserves safe video colour filters in both exporters and rejects remote filters', () => {
    const video: Layer = { ...layer, type: 'video', src: '/clip.mp4', opacity: 0.5, visualFilter: 'brightness(1.12) contrast(1.12)' }
    const html = client('mrec', [video])
    expect(html).toContain('filter:brightness(1.12) contrast(1.12);')
    expect(server('mrec', [video])).toBe(html)
    for (const render of [client, server]) expect(render('mrec', [{ ...video, visualFilter: 'url(https://example.com/filter.svg)' }])).not.toContain('filter:url(')
  })

  it.each([true, false])('mirrors the cropped video viewport in exports with animations=%s', (includeAnimations) => {
    const video: Layer = { ...layer, type: 'video', src: '/clip.mp4', fit: 'cover', flipX: true, focalY: 72.86 }
    const html = client('mrec', [video], { includeAnimations })
    expect(server('mrec', [video], { includeAnimations })).toBe(html)
    expect(html).toContain('transform:scale(-1, 1);"><video src="/clip.mp4" muted playsinline preload="auto" style="width:100%;height:100%;object-fit:cover;object-position:50% 72.86%;"')
  })

  it('clips the zoomed source before flipping the viewport in both exporters', () => {
    const video: Layer = { ...layer, type: 'video', src: '/clip.mp4', flipY: true, videoCrop: { x: 0.125, y: 0.125, w: 0.5, h: 0.25 } }
    const html = client('mrec', [video])
    expect(server('mrec', [video])).toBe(html)
    expect(html).toContain('overflow:hidden;transform:scale(1, -1);"><video')
    expect(html).toContain('width:200%;height:400%;left:-25%;top:-50%;object-fit:cover;')
  })

  it('preserves finite local pixel origins in both exports and drops unsafe origins', () => {
    const pivot = { ...layer, transformOrigin: { x: 100, y: -28.8 } }
    expect(client('mrec', [pivot])).toContain('transform-origin:100px -28.8px;')
    expect(server('mrec', [pivot])).toBe(client('mrec', [pivot]))
    for (const transformOrigin of [{ x: Infinity, y: 0 }, { x: '0;opacity:0', y: 0 }]) {
      const unsafe = { ...layer, transformOrigin } as Layer
      expect(client('mrec', [unsafe])).not.toContain('transform-origin:')
      expect(server('mrec', [unsafe])).not.toContain('transform-origin:')
    }
  })

  it('projects an original image and its in-plane rotation through an editable GSAP flip', () => {
    const image: Layer = {
      ...layer, type: 'image', src: '/source.png', imageFlipPerspective: 56.35, rotation: 346,
      transformOrigin: { x: 10, y: 10 },
      keyframes: { rotationX: [{ time: 0.6, value: -80, easing: 'linear' }, { time: 1.6, value: 0 }] }
    }
    const html = client('mrec', [image])
    expect(server('mrec', [image])).toBe(html)
    expect(html).toContain('backface-visibility:hidden;')
    expect(html).toContain('transform:rotate(346deg);"><img')
    expect(html).toContain('transformPerspective: 56.35')
    expect(html).toContain('rotationX: -80')
    expect(html).toContain('rotationX: 0, duration: 1.000')
  })

  it('retains gradient backgrounds in both exports', () => {
    const background: Layer = { ...layer, type: 'bg', mixBlendMode: 'normal', bgColor: 'linear-gradient(180deg,#0084ff 0,#0d55b9 100%)' }
    expect(client('mrec', [background])).toContain('background:linear-gradient(180deg,#0084ff 0,#0d55b9 100%)')
    expect(server('mrec', [background])).toBe(client('mrec', [background]))
  })

  it('preserves text smoothing and mixed-size whitespace baselines', () => {
    const text: Layer = { ...layer, type: 'text', text: 'Trading Hours', fontSize: 76.6, lineBoxFontSize: 87.99, textAntialias: true }
    const html = client('mrec', [text])
    expect(html).toContain('-webkit-font-smoothing:antialiased;')
    expect(html).toContain('Trading Hours<span aria-hidden="true" style="font-size:87.99px">&#160;</span>')
    expect(server('mrec', [text])).toBe(html)
  })
})

// Execute only our generated animation script, with plain objects as GSAP targets.
it('restores an imported hold at time zero after scrubbing backwards', () => {
  const layers = [{ id: 1, type: 'rect', opacity: 1, x: 0, y: 0, w: 10, h: 10, startTime: 0, endTime: 4, keyframes: { opacity: [{ time: 0, value: 1 }, { time: 4, value: 1 }] } }] as Layer[]
  const html = client('mrec', layers)
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match => match[1]!.includes('const tl ='))![1]!
  const target = { opacity: 1 }
  const tl = gsap.timeline({ paused: true })
  const wrapped = {
    set: (_selector: string, vars: object, at: number) => tl.set(target, vars, at),
    to: (_selector: string, vars: object, at: number) => tl.to(target, vars, at),
    eventCallback: tl.eventCallback.bind(tl)
  }
  try {
    new Function('gsap', 'window', script)({ timeline: () => wrapped }, {})
    tl.seek(3.9)
    expect(target.opacity).toBe(1)
    tl.seek(0)
    expect(target.opacity).toBe(1)
  } finally { tl.kill() }
})
