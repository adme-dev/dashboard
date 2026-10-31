// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as Vue from 'vue'
import gsap from 'gsap'
import { useBannerTimeline } from '~/composables/useBannerTimeline'
import { useBannerPhaseDrag } from '~/composables/useBannerPhaseDrag'
import { timelinePhases } from '~/utils/banner-timeline-phases'
import { retimeLayerPresence, retimeAnimationPhase, insertTimelineKeyframe, addMiddleAnimation } from '~/utils/banner-timeline-edit'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { buildBannerHTML as serverHTML } from '~~/server/utils/banner/htmlBuilder'
import type { Layer } from '~/types/banner-studio'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const { useBannerStudio } = await import('~/composables/useBannerStudio')

const base = (extra: Partial<Layer> = {}) => ({ id: 1, type: 'text', name: 'Heading', text: 'Hello', x: 0, y: 0, w: 200, h: 40, opacity: 1, zIndex: 1, startTime: 1, endTime: 6, animIn: 'fadeIn', animInDur: 0.5, animOut: 'fadeOut', outDur: 0.5, ...extra } as Layer)
let app: Vue.App | undefined, root: HTMLElement | undefined
const locked = Vue.ref(false)
beforeEach(() => {
  for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
  vi.stubGlobal('useBannerStudio', useBannerStudio)
  vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => locked.value, sendLayerUpdate() {} }))
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline: vi.fn() }))
  locked.value = false
})
afterEach(() => {
  app?.unmount()
  app = undefined
  root?.remove()
  root = undefined
  vi.unstubAllGlobals()
})

function mountGesture(extra: Partial<Layer> = {}) {
  const studio = useBannerStudio()
  studio.loadProject({ id: 'timeline-test', canvasData: { mrec: { layers: [base(extra)] } } } as Parameters<typeof studio.loadProject>[0])
  studio.state.currentTime = 3.25
  root = document.createElement('div')
  document.body.append(root)
  app = Vue.createApp({ setup() {
    const phases = Vue.computed(() => new Map([[1, timelinePhases(studio.activeLayers.value[0]!)]]))
    const drag = useBannerPhaseDrag(Vue.ref(100), phases)
    return () => Vue.h('div', { 'data-animation-phase': 'entry', 'style': { left: '100px', width: '50px' } }, [Vue.h('button', {
      onMousedown: (e: MouseEvent) => drag.startPhaseDrag(e, studio.activeLayers.value[0]!, phases.value.get(1)![0]!, 'end')
    })])
  } })
  app.mount(root)
  return studio
}
function mouse(type: string, x: number) {
  return new MouseEvent(type, { clientX: x, button: 0, bubbles: true })
}

describe('direct timeline timing edits', () => {
  it('retimes imported values, easing, repeat resets and path timing together', () => {
    const original = base({ startTime: 2, endTime: 6, keyframes: { opacity: [{ time: 0, value: 0 }, { time: 2, value: 0 }, { time: 3, value: 1, easing: 'none' }, { time: 3, value: 0 }, { time: 6, value: 1 }] }, motionPathTweens: [{ startTime: 2, endTime: 4, pathStart: 0, pathEnd: 0.4, ease: 'power2.out' }] })
    const change = retimeLayerPresence(original, 4, 12)
    expect(change.keyframes?.opacity?.map(frame => frame.time)).toEqual([0, 4, 6, 6, 12])
    expect(change.keyframes?.opacity?.map(frame => frame.value)).toEqual([0, 0, 1, 0, 1])
    expect(change.keyframes?.opacity?.[2]?.easing).toBe('none')
    expect(change.motionPathTweens?.[0]).toEqual({ startTime: 4, endTime: 8, pathStart: 0, pathEnd: 0.4, ease: 'power2.out' })
    expect(original.keyframes?.opacity?.[2]?.time).toBe(3)
  })
  it('stretches one imported animation while leaving the later exit untouched', () => {
    const layer = base({ keyframes: { opacity: [{ time: 1, value: 0 }, { time: 2, value: 1 }, { time: 5, value: 1 }, { time: 6, value: 0 }], x: [{ time: 1, value: -100, easing: 'none' }, { time: 2, value: 0 }, { time: 6, value: 0 }] } })
    const phase = timelinePhases(layer)[0]!
    const change = retimeAnimationPhase(layer, phase, 2, 4)
    expect(change.keyframes?.opacity?.map(frame => frame.time)).toEqual([2, 4, 5, 6])
    expect(change.keyframes?.x?.[0]).toEqual({ time: 2, value: -100, easing: 'none' })
  })
  it('commits one drag operation and undo restores timing without resetting the playhead', async () => {
    const studio = mountGesture()
    root!.querySelector('button')!.dispatchEvent(mouse('mousedown', 100))
    window.dispatchEvent(mouse('mousemove', 150))
    expect(studio.canUndo.value).toBe(false)
    expect(root!.querySelector<HTMLElement>('[data-animation-phase]')!.style.width).toBe('100px')
    window.dispatchEvent(mouse('mouseup', 150))
    expect(studio.activeLayers.value[0]).toMatchObject({ animInStart: 1, animInDur: 1 })
    expect(studio.state.currentTime).toBe(3.25)
    studio.undo()
    await Vue.nextTick()
    expect(studio.activeLayers.value[0]?.animInDur).toBe(0.5)
    expect(studio.activeLayers.value[0]?.animInStart).toBeUndefined()
    expect(studio.canUndo.value).toBe(false)
  })
  it('cancels on blur or lock changes and never edits a locked layer', () => {
    const studio = mountGesture()
    root!.querySelector('button')!.dispatchEvent(mouse('mousedown', 100))
    window.dispatchEvent(mouse('mousemove', 170))
    window.dispatchEvent(new Event('blur'))
    expect(studio.canUndo.value).toBe(false)
    expect(root!.querySelector<HTMLElement>('[data-animation-phase]')!.style.width).toBe('50px')
    locked.value = true
    root!.querySelector('button')!.dispatchEvent(mouse('mousedown', 100))
    window.dispatchEvent(mouse('mouseup', 170))
    expect(studio.activeLayers.value[0]?.animInDur).toBe(0.5)
  })
  it('inserts middle/start keyframes with playable anchors and no duplicate time', () => {
    const layer = base()
    const middle = insertTimelineKeyframe(layer, 'x', 3, 75)
    expect(middle.keyframes.x).toEqual([{ time: 1, value: 0, easing: 'none' }, { time: 3, value: 75, easing: 'power2.out' }, { time: 6, value: 0, easing: 'none' }])
    const start = insertTimelineKeyframe(layer, 'x', 1, 20)
    expect(start.keyframes.x).toHaveLength(2)
    expect(insertTimelineKeyframe(layer, 'x', 1, 20, start.keyframes).changed).toBe(false)
  })
  it('retains authored middle labels when moving and stretching their keyframes', () => {
    const layer = base({ keyframes: { opacity: [{ time: 1, value: 0 }, { time: 2, value: 1 }, { time: 5.5, value: 1 }, { time: 6, value: 0 }] } })
    const middle = { kind: 'hold', start: 2, end: 5.5, label: 'Hold', direction: 'in' } as const
    const authored = { ...layer, ...addMiddleAnimation(layer, middle, 'pulse', 3, layer.keyframes!, () => 1) }
    expect(timelinePhases(authored).some(phase => phase.label === 'Pulse')).toBe(true)
    const phase = timelinePhases(authored).find(phase => phase.label === 'Pulse')!
    const changed = retimeAnimationPhase(authored, phase, 3, 5)
    expect(changed.animationClips).toEqual([{ start: 3, end: 5, label: 'Pulse' }])
    expect(changed.keyframes?.scaleX?.at(-1)?.time).toBe(5)
    expect(retimeLayerPresence(authored, 2, 12).animationClips?.[0]).toEqual({ start: 6, end: 8.4, label: 'Pulse' })
  })
  it('keeps shared entrance/exit anchors when moving a middle block', () => {
    const layer = base({ keyframes: {
      opacity: [{ time: 1, value: 0 }, { time: 2, value: 1 }, { time: 2.6, value: 0.15 }, { time: 3.2, value: 1 }, { time: 5.5, value: 1 }, { time: 6, value: 0 }],
      y: [{ time: 1, value: -100 }, { time: 2, value: 0 }]
    }, animationClips: [{ start: 2, end: 3.2, label: 'Blink' }] })
    const phase = timelinePhases(layer).find(phase => phase.label === 'Blink')!
    const result = retimeAnimationPhase(layer, phase, 3, 4.2)
    expect(result.keyframes?.y).toEqual(layer.keyframes!.y)
    expect(result.keyframes?.opacity).toContainEqual({ time: 2, value: 1 })
    expect(result.keyframes?.opacity).toContainEqual({ time: 3, value: 1 })
    expect(result.keyframes?.opacity).toContainEqual({ time: 5.5, value: 1 })
    expect(result.keyframes?.opacity?.at(-1)).toEqual({ time: 6, value: 0 })
  })
  it('uses explicitly moved preset timing in native preview and both export builders', () => {
    const layer = base({ startTime: 0, endTime: 6, animInStart: 2, animInDur: 1, animOutStart: 4, outDur: 0.5, ease: 'none', animOutEase: 'none' })
    const studio = useBannerStudio()
    studio.loadProject({ id: 'timing', canvasData: { mrec: { layers: [layer], playback: { duration: 6, loopCount: 1 } } } } as Parameters<typeof studio.loadProject>[0])
    const controller = useBannerTimeline()
    root = document.createElement('div')
    const visual = document.createElement('div')
    visual.id = 'lyr-1'
    root.append(visual)
    document.body.append(root)
    controller.buildTimeline(root, [layer])
    controller.seekTo(1)
    expect(Number(gsap.getProperty(visual, 'opacity'))).toBe(0)
    controller.seekTo(2.5)
    expect(controller.currentLayerValue(layer, 'opacity')).toBeCloseTo(0.5)
    controller.seekTo(4.5)
    expect(Number(gsap.getProperty(visual, 'opacity'))).toBe(0)
    const html = buildBannerHTML('mrec', [layer])
    expect(serverHTML('mrec', [layer])).toBe(html)
    expect(html).toContain('duration: 1, ease: \'none\' }, 2)')
    expect(html).toContain('duration: 0.5, ease: \'none\' }, 4)')
    controller.destroyTimeline()
  })
})
