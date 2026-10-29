// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import gsap from 'gsap'
import { useBannerTimeline } from '~/composables/useBannerTimeline'
import { registerTimelineAudio, syncTimelineAudio, pauseTimelineAudio, disposeTimelineAudio } from '~/utils/bannerTimelineAudio'
import type { Layer } from '~/types/banner-studio'

function media(duration = 8) {
  const audio = document.createElement('audio')
  let paused = true
  Object.defineProperties(audio, { duration: { value: duration }, paused: { get: () => paused } })
  audio.play = vi.fn(async () => { paused = false })
  audio.pause = vi.fn(() => { paused = true })
  return audio
}
function board(id = 1) {
  const root = document.createElement('div')
  const layer = document.createElement('div')
  layer.id = `lyr-${id}`
  const audio = media()
  layer.append(audio)
  root.append(layer)
  return { root, audio }
}
const layer = { id: 1, type: 'audio', startTime: 0, endTime: 8, volume: 1 } as Layer
function studio() {
  const state = { activeKey: 'square', sets: { square: { playback: { duration: 8, loopCount: 0 } } }, duration: 8, currentTime: 0, isPlaying: false, isLooping: false }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: { value: [layer] } }))
  return { state, controller: useBannerTimeline() }
}
let cleanup: (() => void) | undefined

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.unstubAllGlobals()
})

describe('editor audio transport', () => {
  it('pauses all tracks immediately and resumes from the paused position', async () => {
    const { controller, state } = studio()
    cleanup = controller.destroyTimeline
    const { root, audio } = board()
    const second = board(2)
    root.append(second.root.firstElementChild!)
    const tl = controller.buildTimeline(root, [layer, { ...layer, id: 2, startTime: 3.6, endTime: 6.1 }])
    controller.playTimeline()
    tl.time(4.2, false)
    await Promise.resolve()
    expect(audio.paused).toBe(false)
    expect(second.audio.paused).toBe(false)
    controller.togglePlay()
    expect(state.isPlaying).toBe(false)
    expect(audio.paused).toBe(true)
    expect(second.audio.paused).toBe(true)
    expect(audio.currentTime).toBeCloseTo(4.2)
    controller.togglePlay()
    expect(tl.time()).toBeCloseTo(4.2)
    expect(state.isPlaying).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(audio.paused).toBe(false)
  })

  it('scrubs silently, stops old artboards on rebuild, and stops detached audio on unmount', () => {
    const { controller } = studio()
    cleanup = controller.destroyTimeline
    const first = board()
    controller.buildTimeline(first.root, [layer])
    controller.playTimeline()
    controller.seekTo(5)
    expect(first.audio.paused).toBe(true)
    expect(first.audio.currentTime).toBe(5)
    controller.playTimeline()
    const second = board()
    controller.buildTimeline(second.root, [layer])
    expect(first.audio.paused).toBe(true)
    controller.playTimeline()
    expect(second.audio.paused).toBe(false)
    controller.destroyTimeline()
    expect(second.audio.paused).toBe(true)
    expect(controller.masterTl).toBe(null)
  })

  it('rewinds on Stop and replays after finite completion', () => {
    const { controller, state } = studio()
    state.sets.square.playback.loopCount = 1
    cleanup = controller.destroyTimeline
    const { root, audio } = board()
    const tl = controller.buildTimeline(root, [layer])
    controller.playTimeline()
    tl.time(3, false)
    controller.stopTimeline()
    expect(audio.paused).toBe(true)
    expect(audio.currentTime).toBe(0)
    controller.playTimeline()
    tl.totalProgress(1, false)
    expect(state.isPlaying).toBe(false)
    expect(audio.paused).toBe(true)
    controller.togglePlay()
    expect(tl.time()).toBe(0)
    expect(state.isPlaying).toBe(true)
  })

  it('plays shared audio only in the chosen all-formats preview', () => {
    const { controller } = studio()
    const first = board(), second = board()
    const a = controller.buildTimelineForKey(first.root, [layer], undefined, true)
    const b = controller.buildTimelineForKey(second.root, [layer], undefined, false)
    cleanup = () => { for (const t of [a, b]) { disposeTimelineAudio(t); t.kill() }; controller.destroyTimeline() }
    a.play(); b.play()
    syncTimelineAudio(a, true); syncTimelineAudio(b, true)
    expect(first.audio.paused).toBe(false)
    expect(second.audio.paused).toBe(true)
    a.pause(); pauseTimelineAudio(a)
    expect(first.audio.paused).toBe(true)
  })
})

describe('audio clock', () => {
  it('keeps delayed, short, looped and speed-adjusted tracks aligned to seconds', () => {
    const tl = gsap.timeline({ paused: true }).to({}, { duration: 10 })
    const audio = media(2)
    registerTimelineAudio(tl, audio, { start: 2, end: 10, volume: 0.6, loop: true })
    cleanup = () => { disposeTimelineAudio(tl); tl.kill() }
    tl.seek(5); tl.timeScale(2); tl.play(); syncTimelineAudio(tl, true)
    expect(audio.currentTime).toBe(1)
    expect(audio.playbackRate).toBe(2)
    expect(audio.volume).toBe(0.6)
    tl.seek(1); syncTimelineAudio(tl, true)
    expect(audio.paused).toBe(true)
    expect(audio.currentTime).toBe(0)
    tl.seek(10); syncTimelineAudio(tl, true)
    expect(audio.paused).toBe(true)
  })

  it('does not repeatedly request play while it is pending, and cancels it after disposal', async () => {
    const tl = gsap.timeline({ paused: true }).to({}, { duration: 8 })
    const audio = media()
    let resolve!: () => void
    audio.play = vi.fn(() => new Promise<void>(r => { resolve = r }))
    registerTimelineAudio(tl, audio, { start: 0, end: 8, volume: 1, loop: false })
    cleanup = () => { disposeTimelineAudio(tl); tl.kill() }
    tl.play(); syncTimelineAudio(tl); syncTimelineAudio(tl)
    expect(audio.play).toHaveBeenCalledTimes(1)
    disposeTimelineAudio(tl)
    const count = vi.mocked(audio.pause).mock.calls.length
    resolve(); await Promise.resolve()
    expect(audio.pause).toHaveBeenCalledTimes(count + 1)
  })

  it('does not let a stale play promise stop a rebuilt timeline using the same audio element', async () => {
    const a = gsap.timeline({ paused: true }).to({}, { duration: 8 })
    const b = gsap.timeline({ paused: true }).to({}, { duration: 8 })
    const audio = media()
    let resolve!: () => void
    audio.play = vi.fn(() => new Promise<void>(r => { resolve = r }))
    const options = { start: 0, end: 8, volume: 1, loop: false }
    registerTimelineAudio(a, audio, options)
    cleanup = () => { for (const t of [a, b]) { disposeTimelineAudio(t); t.kill() } }
    a.play(); syncTimelineAudio(a)
    const oldRequest = resolve
    disposeTimelineAudio(a)
    registerTimelineAudio(b, audio, options)
    b.play(); syncTimelineAudio(b)
    const pauses = vi.mocked(audio.pause).mock.calls.length
    oldRequest(); await Promise.resolve()
    expect(audio.pause).toHaveBeenCalledTimes(pauses)
  })

  it('does not stretch a short non-looping clip to the length of its layer', () => {
    const tl = gsap.timeline({ paused: true }).to({}, { duration: 8 })
    const audio = media(2)
    registerTimelineAudio(tl, audio, { start: 0, end: 8, volume: 1, loop: false })
    cleanup = () => { disposeTimelineAudio(tl); tl.kill() }
    tl.seek(1); tl.play(); syncTimelineAudio(tl, true)
    expect(audio.currentTime).toBe(1)
    tl.seek(3); syncTimelineAudio(tl, true)
    expect(audio.paused).toBe(true)
    expect(audio.currentTime).toBe(2)
  })
})
