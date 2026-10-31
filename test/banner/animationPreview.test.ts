// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, reactive } from 'vue'
import gsap from 'gsap'
import { useBannerTimeline } from '~/composables/useBannerTimeline'
import type { Layer } from '~/types/banner-studio'

let root: HTMLElement
let controller: ReturnType<typeof useBannerTimeline>
const visual = (id: number, extra: Partial<Layer> = {}) => ({ id, type: 'image', name: `Artwork ${id}`, x: 0, y: 0, w: 100, h: 100, opacity: 1, zIndex: id, startTime: 0, endTime: 8, keyframes: { x: [{ time: 0, value: 0, easing: 'none' }, { time: 8, value: 800 }] }, ...extra } as Layer)
function setup(layers: Layer[]) {
  const state = reactive({ activeKey: 'square', selectedLayerId: layers[0]!.id, project: { id: 'preview-test' }, sets: { square: { layers, playback: { duration: 8, loopCount: 0 } } }, duration: 8, currentTime: 0, isPlaying: false, isLooping: true })
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: computed(() => state.sets.square.layers) }))
  for (const layer of layers) {
    const element = document.createElement('div')
    element.id = `lyr-${layer.id}`
    if (layer.type === 'video') element.append(document.createElement('video'))
    if (layer.type === 'audio') {
      const audio = document.createElement('audio')
      audio.play = vi.fn(async () => {})
      audio.pause = vi.fn()
      element.append(audio)
    }
    root.append(element)
  }
  controller = useBannerTimeline()
  controller.buildTimeline(root, state.sets.square.layers)
  controller.seekTo(2)
  return state
}
beforeEach(() => {
  root = document.createElement('div')
  document.body.append(root)
  const playing = new WeakSet<HTMLMediaElement>()
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function () {
    return !playing.has(this)
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () {
    playing.delete(this)
  })
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function () {
    playing.add(this)
  })
})
afterEach(() => {
  controller?.destroyTimeline()
  root.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('selected animation preview', () => {
  it('animates only the selected layer and stops at the selected block end despite project looping', () => {
    const selected = visual(1, { keyframes: { x: [{ time: 0, value: 0, easing: 'none' }, { time: 0.8, value: 80 }] } })
    const state = setup([selected, visual(2), { id: 3, type: 'audio', startTime: 0, endTime: 8, volume: 1 } as Layer])
    const original = root.querySelector<HTMLElement>('#lyr-1')!
    const other = root.querySelector<HTMLElement>('#lyr-2')!
    const otherStyle = other.getAttribute('style')
    const originalStyle = original.getAttribute('style')
    const snapshot = JSON.stringify(state.sets)
    const projectTimeline = controller.masterTl!
    expect(projectTimeline.repeat()).toBe(-1)
    expect(controller.previewAnimation(1, { start: 0, end: 0.8 })).toBe(true)
    const preview = controller.animationPreviewTimeline!
    const overlay = root.querySelector<HTMLElement>('[data-banner-animation-preview]')!
    expect(overlay.getAttribute('aria-hidden')).toBe('true')
    expect(preview.repeat()).toBe(0)
    expect(state.isPlaying).toBe(false)
    expect(projectTimeline.paused()).toBe(true)
    const contextStyle = overlay.querySelector('#lyr-2')!.getAttribute('style')
    preview.time(0.4, false)
    expect(Number(gsap.getProperty(overlay.querySelector('#lyr-1')!, 'x'))).toBeCloseTo(40)
    expect(overlay.querySelector('#lyr-2')!.getAttribute('style')).toBe(contextStyle)
    expect(root.querySelector<HTMLAudioElement>('#lyr-3 audio')!.play).not.toHaveBeenCalled()
    expect(state.currentTime).toBe(2)
    preview.time(1.2, false)
    expect(controller.animationPreview.value).toBeNull()
    expect(controller.animationPreviewTimeline).toBeNull()
    expect(preview.time()).toBeCloseTo(0.8)
    expect(root.querySelector('[data-banner-animation-preview]')).toBeNull()
    expect(original.getAttribute('style')).toBe(originalStyle)
    expect(other.getAttribute('style')).toBe(otherStyle)
    expect(projectTimeline.time()).toBe(2)
    expect(JSON.stringify(state.sets)).toBe(snapshot)
  })
  it('previews a native entrance with the same bounded isolated transport', () => {
    setup([visual(1, { keyframes: undefined, animIn: 'fadeIn', animInDur: 0.8, animOut: 'fadeOut', outDur: 0.4, ease: 'none' }), visual(2)])
    controller.previewAnimation(1, { start: 0, end: 0.8 })
    const preview = controller.animationPreviewTimeline!
    const target = root.querySelector('[data-banner-animation-preview] #lyr-1')!
    preview.time(0.4, false)
    expect(Number(gsap.getProperty(target, 'opacity'))).toBeCloseTo(0.5)
    expect(controller.masterTl!.paused()).toBe(true)
    preview.time(0.9, false)
    expect(controller.animationPreview.value).toBeNull()
    expect(controller.masterTl!.time()).toBe(2)
  })
  it('starts a later middle/exit block at its own time instead of replaying the entrance', () => {
    setup([visual(1), visual(2)])
    controller.previewAnimation(1, { start: 5, end: 6 })
    const preview = controller.animationPreviewTimeline!
    const overlay = root.querySelector('[data-banner-animation-preview]')!
    expect(preview.time()).toBe(5)
    expect(Number(gsap.getProperty(overlay.querySelector('#lyr-1')!, 'x'))).toBeCloseTo(500)
    preview.time(5.5, false)
    expect(Number(gsap.getProperty(overlay.querySelector('#lyr-1')!, 'x'))).toBeCloseTo(550)
    preview.time(6.1, false)
    expect(controller.masterTl!.time()).toBe(2)
    expect(controller.animationPreview.value).toBeNull()
  })
  it('cancels safely on scrub, playback, rebuild, selection changes and disposal', async () => {
    const state = setup([visual(1), visual(2)])
    controller.previewAnimation(1, { start: 0, end: 1 })
    controller.seekTo(3)
    expect(controller.animationPreview.value).toBeNull()
    expect(state.currentTime).toBe(3)
    controller.previewAnimation(1, { start: 0, end: 1 })
    controller.togglePlay()
    expect(controller.animationPreview.value).toBeNull()
    expect(state.isPlaying).toBe(false)
    controller.previewAnimation(1, { start: 0, end: 1 })
    controller.playTimeline()
    expect(controller.animationPreview.value).toBeNull()
    expect(state.isPlaying).toBe(true)
    controller.pauseTimeline()
    controller.previewAnimation(1, { start: 0, end: 1 })
    state.selectedLayerId = 2
    await nextTick()
    expect(controller.animationPreview.value).toBeNull()
    controller.previewAnimation(1, { start: 0, end: 1 })
    controller.buildTimeline(root, state.sets.square.layers)
    expect(root.querySelector('[data-banner-animation-preview]')).toBeNull()
    controller.previewAnimation(1, { start: 0, end: 1 })
    controller.destroyTimeline()
    expect(controller.animationPreviewTimeline).toBeNull()
  })
  it('keeps video content on the editing frame while previewing its transition', () => {
    setup([visual(1, { type: 'video' }), visual(2)])
    const video = root.querySelector<HTMLVideoElement>('#lyr-1 video')!
    expect(video.currentTime).toBe(2)
    controller.previewAnimation(1, { start: 0, end: 0.8 })
    const clone = root.querySelector<HTMLVideoElement>('[data-banner-animation-preview] video')!
    expect(clone.currentTime).toBe(2)
    controller.animationPreviewTimeline!.time(0.4, false)
    expect(clone.currentTime).toBe(2)
    expect(video.currentTime).toBe(2)
  })
  it('retains mask clipping on the temporary canvas without changing the original mask or target', () => {
    const mask = visual(3, { type: 'rect', isMask: true, maskTargetIds: [1], maskShape: 'rect', w: 50, keyframes: { x: [{ time: 0, value: 0, easing: 'none' }, { time: 1, value: 50 }] } })
    setup([visual(1, { keyframes: { x: [{ time: 0, value: 0 }, { time: 8, value: 0 }] } }), mask])
    const original = root.querySelector<HTMLElement>('#lyr-1')!
    const before = original.getAttribute('style')
    controller.previewAnimation(3, { start: 0, end: 1 })
    const target = root.querySelector<HTMLElement>('[data-banner-animation-preview] #lyr-1')!
    const start = target.style.clipPath
    controller.animationPreviewTimeline!.time(0.5, false)
    expect(target.style.clipPath).not.toBe(start)
    expect(original.getAttribute('style')).toBe(before)
  })
  it('previews only the selected audio clip and silences it on completion', async () => {
    const audio = (id: number) => ({ id, type: 'audio', startTime: 0, endTime: 8, volume: 1 } as Layer)
    setup([visual(1), audio(2), audio(3)])
    controller.previewAnimation(2, { start: 1, end: 2 })
    await Promise.resolve()
    const playing = root.querySelector<HTMLAudioElement>('[data-banner-animation-preview] #lyr-2 audio')!
    const other = root.querySelector<HTMLAudioElement>('[data-banner-animation-preview] #lyr-3 audio')!
    expect(playing.paused).toBe(false)
    expect(other.paused).toBe(true)
    expect(root.querySelector<HTMLAudioElement>('#lyr-2 audio')!.play).not.toHaveBeenCalled()
    controller.animationPreviewTimeline!.time(2.1, false)
    expect(playing.paused).toBe(true)
    expect(controller.animationPreview.value).toBeNull()
  })
  it('keeps one preview owner and rejects invalid ranges without touching artwork', () => {
    setup([visual(1), visual(2)])
    expect(controller.previewAnimation(1, { start: 2, end: 1 })).toBe(false)
    expect(controller.previewAnimation(99, { start: 0, end: 1 })).toBe(false)
    controller.previewAnimation(1, { start: 0, end: 1 })
    const first = controller.animationPreviewTimeline!
    controller.previewAnimation(2, { start: 3, end: 4 })
    expect(first.paused()).toBe(true)
    expect(root.querySelectorAll('[data-banner-animation-preview]')).toHaveLength(1)
    expect(controller.animationPreview.value).toEqual({ layerId: 2, start: 3, end: 4 })
    controller.stopAnimationPreview()
    expect(root.querySelector('[data-banner-animation-preview]')).toBeNull()
  })
})

it('keeps global slide fades out of a selected-layer animation preview', () => {
  setup([visual(1), visual(2, { slideTransitionFor: 'first' })])
  root.querySelector('#lyr-2')!.setAttribute('data-slide-transition', 'first')
  controller.previewAnimation(1, { start: 0, end: 0.8 })
  expect(root.querySelector('[data-banner-animation-preview] #lyr-2')).toBeNull()
  expect(root.querySelector('#lyr-2')).not.toBeNull()
})
