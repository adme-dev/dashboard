import { describe, expect, it } from 'vitest'
import {
  buildEngagrFrameRuntimeScript,
  buildVisibleElementManifest,
  clampRenderFps,
  estimateBannerDuration,
  formatFpsForFfmpeg,
  fpsToNumber,
  parseRenderFps,
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
    const layers: any[] = [
      { id: 'a', type: 'text', startTime: 0, endTime: 2 },
      { id: 'b', type: 'text', startTime: 1, keyframes: { opacity: [{ time: 0, value: 0 }, { time: 4, value: 1 }] } },
    ]
    expect(estimateBannerDuration(layers)).toBe(4)
  })

  it('builds a runtime script with contract and visible element manifest', () => {
    const layers: any[] = [{ id: 'a', type: 'text', startTime: 1, endTime: 3 }]
    const script = buildEngagrFrameRuntimeScript({
      durationSec: estimateBannerDuration(layers),
      fps: { num: 30, den: 1 },
      visibleElements: buildVisibleElementManifest(layers),
    })
    expect(script).toContain('window.__engagrFrame')
    expect(script).toContain('totalDuration')
    expect(script).toContain('"id":"a"')
    expect(script).toContain('"num":30')
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
