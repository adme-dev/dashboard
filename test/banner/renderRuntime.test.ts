import { describe, expect, it } from 'vitest'
import gsap from 'gsap'
import type { Layer } from '~/types/banner-studio'
import type { EngagrFrameRuntime } from '~~/app/utils/banner-render-runtime'
import {
  buildEngagrFrameRuntimeScript,
  buildVisibleElementManifest,
  clampRenderFps,
  estimateBannerDuration,
  formatFpsForFfmpeg,
  fpsToNumber,
  parseRenderFps
} from '~~/app/utils/banner-render-runtime'

describe('render FPS helpers', () => {
  it('parses integer and exact rational FPS values', () => {
    expect(parseRenderFps(30)).toEqual({ num: 30, den: 1 })
    expect(parseRenderFps('30000/1001')).toEqual({ num: 30000, den: 1001 })
    expect(formatFpsForFfmpeg({ num: 30000, den: 1001 })).toBe('30000/1001')
    expect(fpsToNumber({ num: 30000, den: 1001 })).toBeCloseTo(29.97, 2)
  })

  it('rejects decimal FPS and clamps legacy numeric values', () => {
    expect(() => parseRenderFps(29.97)).toThrow('Decimal FPS')
    expect(() => parseRenderFps('0')).toThrow('positive integers')
    expect(clampRenderFps(999)).toEqual({ num: 60, den: 1 })
    expect(clampRenderFps(1)).toEqual({ num: 12, den: 1 })
  })
})

describe('banner runtime script helpers', () => {
  it('estimates duration from layer timing and keyframes', () => {
    const layers = [
      { id: 'a', type: 'text', startTime: 0, endTime: 2 },
      { id: 'b', type: 'text', startTime: 1, keyframes: { opacity: [{ time: 0, value: 0 }, { time: 4, value: 1 }] } }
    ] as Layer[]
    expect(estimateBannerDuration(layers)).toBe(4)
  })

  it('builds a runtime script with contract and visible element manifest', () => {
    const layers = [{ id: 'a', type: 'text', startTime: 1, endTime: 3 }] as Layer[]
    const script = buildEngagrFrameRuntimeScript({
      durationSec: estimateBannerDuration(layers),
      fps: { num: 30, den: 1 },
      visibleElements: buildVisibleElementManifest(layers)
    })
    expect(script).toContain('window.__engagrFrame')
    expect(script).toContain('totalDuration')
    expect(script).toContain('"id":"a"')
    expect(script).toContain('"num":30')
  })

  it('seeks to the new cycle at repeating boundaries, including decimal cycle lengths', () => {
    for (const duration of [9, 3.1]) {
      const target = { x: 0 }
      const tl = gsap.timeline({ paused: true, repeat: -1 }).to(target, { x: 100, duration, ease: 'none' })
      const window = { __engagrTimeline: tl, __engagrFrame: undefined as EngagrFrameRuntime | undefined }
      const script = buildEngagrFrameRuntimeScript({ durationSec: duration, fixedCycleDuration: true }).replace(/^<script>|<\/script>$/g, '')
      new Function('window', 'document', script)(window, { querySelectorAll: () => [] })
      window.__engagrFrame!.seek(duration)
      expect(target.x).toBeLessThan(0.001)
      window.__engagrFrame!.seek(duration * 3)
      expect(target.x).toBeLessThan(0.001)
      window.__engagrFrame!.seek(duration + duration / 2)
      expect(target.x).toBeCloseTo(50, 4)
      tl.kill()
    }
  })

  it('retains the final frame when finite repeats are exhausted', () => {
    const target = { x: 0 }
    const tl = gsap.timeline({ paused: true, repeat: 1 }).to(target, { x: 100, duration: 9, ease: 'none' })
    const window = { __engagrTimeline: tl, __engagrFrame: undefined as EngagrFrameRuntime | undefined }
    const script = buildEngagrFrameRuntimeScript({ durationSec: 9, fixedCycleDuration: true }).replace(/^<script>|<\/script>$/g, '')
    new Function('window', 'document', script)(window, { querySelectorAll: () => [] })
    window.__engagrFrame!.seek(9)
    expect(target.x).toBeLessThan(0.001)
    window.__engagrFrame!.seek(18)
    expect(target.x).toBe(100)
    tl.kill()
  })

  it('escapes visible element JSON for script context', () => {
    const script = buildEngagrFrameRuntimeScript({
      durationSec: 5,
      visibleElements: [{ id: '</script><img src=x onerror=alert(1)>', type: 'text' }]
    })

    expect(script).not.toContain('</script><img')
    expect(script).toContain('\\u003C/script>')
  })
})
