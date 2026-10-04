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
