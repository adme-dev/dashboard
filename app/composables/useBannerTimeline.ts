import gsap from 'gsap'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import type { Layer, Keyframe, KeyframeProperty } from '~/types/banner-studio'
import { ANIM_IN, ANIM_OUT } from '~/utils/banner-constants'
import { computeClipPathPx } from '~/utils/banner-mask'

gsap.registerPlugin(MotionPathPlugin)

let masterTl: gsap.core.Timeline | null = null
let lastArtboardEl: HTMLElement | null = null
let lastLayers: Layer[] = []
let timePoller: ReturnType<typeof setInterval> | null = null

// Keyframe property → GSAP property mapping
const KF_GSAP_MAP: Record<KeyframeProperty, string> = {
  opacity: 'opacity',
  x: 'x',
  y: 'y',
  scaleX: 'scaleX',
  scaleY: 'scaleY',
  rotation: 'rotation',
}

// Default values for each keyframe property (layer's resting state)
function getDefaultValue(prop: KeyframeProperty, layer: Layer): number {
  switch (prop) {
    case 'opacity': return layer.opacity
    case 'x': return 0
    case 'y': return 0
    case 'scaleX': return 1
    case 'scaleY': return 1
    case 'rotation': return layer.rotation || 0
  }
}

/** Check if layer uses keyframe animation (at least one property has 2+ keyframes) */
export function hasKeyframes(layer: Layer): boolean {
  if (!layer.keyframes) return false
  return Object.values(layer.keyframes).some(kfs => kfs && kfs.length >= 2)
}

/** Convert existing preset animation to keyframe format */
export function presetToKeyframes(layer: Layer): Partial<Record<KeyframeProperty, Keyframe[]>> {
  const preset = ANIM_IN.find(a => a.id === layer.animIn)
  const outPreset = ANIM_OUT.find(a => a.id === layer.animOut) || ANIM_OUT.find(a => a.id === 'fadeOut')!
  const startTime = layer.startTime || 0
  const endTime = layer.endTime || (startTime + 3)
  const animDur = layer.animInDur || 0.6
  const ease = layer.ease || 'power2.out'
  const outDur = layer.outDur || 0.25
  const outEase = layer.animOutEase || 'power1.in'

  const result: Partial<Record<KeyframeProperty, Keyframe[]>> = {}

  // Ken Burns is a special case — just generate opacity keyframes
  if (preset?.special === 'kenBurns') {
    result.opacity = [
      { time: startTime, value: 0, easing: 'power1.out' },
      { time: startTime + 0.4, value: layer.opacity },
      { time: endTime - 0.05, value: layer.opacity, easing: 'none' },
      { time: endTime, value: 0 },
    ]
    result.scaleX = [
      { time: startTime, value: 1, easing: 'none' },
      { time: endTime, value: 1.08 },
    ]
    result.scaleY = [
      { time: startTime, value: 1, easing: 'none' },
      { time: endTime, value: 1.08 },
    ]
    return result
  }

  // Build entrance keyframes from preset.from values
  const fromProps = preset && Object.keys(preset.from).length > 0 ? preset.from : {}

  // Map preset props to keyframe properties
  const propMapping: Record<string, KeyframeProperty> = {
    opacity: 'opacity',
    x: 'x',
    y: 'y',
    scale: 'scaleX', // scale maps to both scaleX and scaleY
    rotation: 'rotation',
  }

  // Always include opacity track
  const opFrom = fromProps.opacity !== undefined ? fromProps.opacity : (Object.keys(fromProps).length > 0 ? 0 : layer.opacity)
  const inTime = startTime + animDur

  // Exit values
  const outStart = Math.max(inTime, endTime - outDur)
  const outProps = outPreset && outPreset.id !== 'none' ? outPreset.to : {}

  // Opacity track
  const opacityKfs: Keyframe[] = []
  if (Object.keys(fromProps).length > 0 || opFrom !== layer.opacity) {
    opacityKfs.push({ time: startTime, value: opFrom, easing: ease })
  } else {
    opacityKfs.push({ time: startTime, value: 0, easing: ease })
  }
  opacityKfs.push({ time: inTime, value: layer.opacity })
  // Hold visible
  if (outStart > inTime) {
    opacityKfs.push({ time: outStart, value: layer.opacity, easing: outEase })
  }
  // Exit
  const outOpacity = outProps.opacity !== undefined ? outProps.opacity : 0
  opacityKfs.push({ time: endTime, value: outOpacity })
  result.opacity = opacityKfs

  // X track
  if (fromProps.x !== undefined || outProps.x !== undefined) {
    const xKfs: Keyframe[] = [
      { time: startTime, value: fromProps.x || 0, easing: ease },
      { time: inTime, value: 0 },
    ]
    if (outProps.x !== undefined) {
      xKfs.push({ time: outStart, value: 0, easing: outEase })
      xKfs.push({ time: endTime, value: outProps.x })
    }
    result.x = xKfs
  }

  // Y track
  if (fromProps.y !== undefined || outProps.y !== undefined) {
    const yKfs: Keyframe[] = [
      { time: startTime, value: fromProps.y || 0, easing: ease },
      { time: inTime, value: 0 },
    ]
    if (outProps.y !== undefined) {
      yKfs.push({ time: outStart, value: 0, easing: outEase })
      yKfs.push({ time: endTime, value: outProps.y })
    }
    result.y = yKfs
  }

  // Scale tracks (presets use unified `scale`, keyframes use scaleX/scaleY)
  if (fromProps.scale !== undefined || outProps.scale !== undefined) {
    const sKfs: Keyframe[] = [
      { time: startTime, value: fromProps.scale || 1, easing: ease },
      { time: inTime, value: 1 },
    ]
    if (outProps.scale !== undefined) {
      sKfs.push({ time: outStart, value: 1, easing: outEase })
      sKfs.push({ time: endTime, value: outProps.scale })
    }
    result.scaleX = sKfs
    result.scaleY = sKfs.map(kf => ({ ...kf })) // clone for independence
  }

  // Rotation track
  if (fromProps.rotation !== undefined || outProps.rotation !== undefined) {
    const rKfs: Keyframe[] = [
      { time: startTime, value: fromProps.rotation || 0, easing: ease },
      { time: inTime, value: layer.rotation || 0 },
    ]
    if (outProps.rotation !== undefined) {
      rKfs.push({ time: outStart, value: layer.rotation || 0, easing: outEase })
      rKfs.push({ time: endTime, value: outProps.rotation })
    }
    result.rotation = rKfs
  }

  return result
}

/** Add keyframe-based animation for a single property track to a GSAP timeline */
function addKeyframeTrack(
  tl: gsap.core.Timeline,
  el: HTMLElement,
  prop: KeyframeProperty,
  keyframes: Keyframe[],
  isBg: boolean,
) {
  if (keyframes.length < 2) return

  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)

  // Determine GSAP property name — bg layers use autoAlpha instead of opacity
  const gsapProp = (prop === 'opacity' && isBg) ? 'autoAlpha' : KF_GSAP_MAP[prop]

  // Set initial value at the first keyframe's time
  tl.set(el, { [gsapProp]: sorted[0].value, immediateRender: false }, sorted[0].time)

  // Create tweens between consecutive keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]
    const to = sorted[i + 1]
    const duration = to.time - from.time
    if (duration <= 0) continue

    tl.to(el, {
      [gsapProp]: to.value,
      duration,
      ease: from.easing || 'power2.out',
      immediateRender: false,
    }, from.time)
  }
}

/** Add keyframe-based animation for a layer to a GSAP timeline */
function buildLayerKeyframes(tl: gsap.core.Timeline, el: HTMLElement, layer: Layer) {
  const isBg = layer.type === 'bg'
  const kfs = layer.keyframes!

  // Set initial hidden state
  if (isBg) {
    tl.set(el, { autoAlpha: 0, immediateRender: false }, 0)
  } else {
    tl.set(el, { opacity: 0, immediateRender: false }, 0)
  }

  // Build each property track (skip x/y when motion path is active)
  const skipXY = (layer.motionPath?.length ?? 0) >= 2
  for (const [prop, keyframes] of Object.entries(kfs)) {
    if (!keyframes || keyframes.length < 2) continue
    if (skipXY && (prop === 'x' || prop === 'y')) continue
    addKeyframeTrack(tl, el, prop as KeyframeProperty, keyframes, isBg)
  }

  // For properties without keyframes, set the default value at startTime
  const startTime = layer.startTime || 0
  const props: KeyframeProperty[] = ['opacity', 'x', 'y', 'scaleX', 'scaleY', 'rotation']
  for (const prop of props) {
    if (kfs[prop] && kfs[prop]!.length >= 2) continue
    const gsapProp = (prop === 'opacity' && isBg) ? 'autoAlpha' : KF_GSAP_MAP[prop]
    const val = getDefaultValue(prop, layer)
    tl.set(el, { [gsapProp]: val, immediateRender: false }, startTime)
  }
}

/** Add preset-based animation for a layer to a GSAP timeline (existing logic) */
function buildPresetLayer(tl: gsap.core.Timeline, el: HTMLElement, layer: Layer) {
  const isBg = layer.type === 'bg'
  const preset = ANIM_IN.find(a => a.id === layer.animIn)
  const startTime = layer.startTime || 0
  const endTime = layer.endTime || (startTime + 3)
  const animDur = layer.animInDur || 0.6
  const ease = layer.ease || 'power2.out'
  const outDur = layer.outDur || (isBg ? 0.5 : 0.25)

  // Initial hidden state
  if (isBg) {
    tl.set(el, { autoAlpha: 0, x: 0, y: 0, scale: 1, rotation: 0, immediateRender: false }, 0)
  } else {
    tl.set(el, { opacity: 0, x: 0, y: 0, scale: 1, rotation: 0, immediateRender: false }, 0)
  }

  if (preset?.special === 'kenBurns') {
    const presenceDur = endTime - startTime
    const inProp = isBg ? 'autoAlpha' : 'opacity'
    tl.fromTo(el,
      { [inProp]: 0, scale: 1, x: 0, y: 0 },
      { [inProp]: layer.opacity, duration: 0.4, ease: 'power1.out', immediateRender: false },
      startTime,
    )
    tl.to(el,
      { scale: 1.08, x: '-2%', y: '-1%', duration: presenceDur, ease: 'none' },
      startTime,
    )
  } else if (preset && Object.keys(preset.from).length > 0) {
    const toProp = isBg
      ? { autoAlpha: layer.opacity, x: 0, y: 0, scale: 1, rotation: 0, duration: animDur, ease, immediateRender: false }
      : { opacity: layer.opacity, x: 0, y: 0, scale: 1, rotation: 0, duration: animDur, ease, immediateRender: false }
    tl.fromTo(el, { ...preset.from }, toProp, startTime)
  } else {
    tl.to(el,
      isBg ? { autoAlpha: layer.opacity, duration: 0.1 } : { opacity: layer.opacity, duration: 0.1 },
      startTime,
    )
  }

  // Exit animation
  const outStart = Math.max(startTime + animDur, endTime - outDur)
  if (outStart < endTime) {
    const outPreset = ANIM_OUT.find(a => a.id === layer.animOut) || ANIM_OUT.find(a => a.id === 'fadeOut')!
    const outEase = layer.animOutEase || 'power1.in'
    const opKey = isBg ? 'autoAlpha' : 'opacity'

    if (outPreset.id === 'none' || !Object.keys(outPreset.to).length) {
      tl.to(el, { [opKey]: 0, duration: 0.05 }, endTime - 0.05)
    } else {
      const toProps: Record<string, any> = { ...outPreset.to, duration: outDur, ease: outEase }
      if (isBg && 'opacity' in toProps) {
        toProps.autoAlpha = toProps.opacity
        delete toProps.opacity
      }
      tl.to(el, toProps, outStart)
    }
  }
}

/** Add video sync proxy to timeline */
function addVideoSync(tl: gsap.core.Timeline, el: HTMLElement, layer: Layer) {
  if ((layer.type === 'bg' && layer.srcType === 'video') || layer.type === 'video') {
    const videoEl = el.querySelector('video') as HTMLVideoElement
    if (videoEl) {
      videoEl.pause()
      const startTime = layer.startTime || 0
      const endTime = layer.endTime || (startTime + 3)
      const presenceDur = endTime - startTime
      const proxy = { t: 0 }
      tl.to(proxy, {
        t: Math.min(presenceDur, videoEl.duration || presenceDur),
        duration: presenceDur,
        ease: 'none',
        onUpdate() { videoEl.currentTime = proxy.t },
      }, startTime)
    }
  }
}

/** Add audio sync proxy to timeline */
function addAudioSync(tl: gsap.core.Timeline, el: HTMLElement, layer: Layer) {
  if (layer.type !== 'audio') return
  const audioEl = el.querySelector('audio') as HTMLAudioElement
  if (!audioEl) return
  audioEl.pause()
  const startTime = layer.startTime || 0
  const endTime = layer.endTime || (startTime + 3)
  const presenceDur = endTime - startTime
  const volume = layer.muted ? 0 : (layer.volume ?? 1)
  const proxy = { t: 0 }
  tl.to(proxy, {
    t: Math.min(presenceDur, audioEl.duration || presenceDur),
    duration: presenceDur,
    ease: 'none',
    onUpdate() {
      audioEl.currentTime = proxy.t
      audioEl.volume = volume
      if (audioEl.paused && proxy.t > 0) audioEl.play().catch(() => {})
    },
    onStart() { audioEl.play().catch(() => {}) },
    onComplete() { audioEl.pause() },
  }, startTime)
}

/** Add animated mask clip-path proxy to timeline */
function addMaskAnimation(tl: gsap.core.Timeline, el: HTMLElement, layer: Layer) {
  if (!layer.isMask || !layer.maskTargetIds?.length) return

  // Hide mask layer visually during playback
  tl.set(el, { autoAlpha: 0 }, 0)

  const artboard = el.parentElement
  if (!artboard) return

  const targets = layer.maskTargetIds
    .map(id => ({
      el: artboard.querySelector(`#lyr-${id}`) as HTMLElement,
      layer: lastLayers.find(l => l.id === id)!,
    }))
    .filter(t => t.el && t.layer)

  if (!targets.length) return

  const shape = layer.maskShape || 'rect'
  const invert = layer.maskInvert || false
  const start = layer.startTime || 0
  const end = layer.endTime || (start + 3)

  // Proxy tween that updates clip-path on targets every frame
  tl.to({ t: 0 }, {
    t: 1,
    duration: end - start,
    ease: 'none',
    onUpdate() {
      // Read GSAP-animated transform values from mask element
      const gx = (gsap.getProperty(el, 'x') as number) || 0
      const gy = (gsap.getProperty(el, 'y') as number) || 0
      const sx = (gsap.getProperty(el, 'scaleX') as number) || 1
      const sy = (gsap.getProperty(el, 'scaleY') as number) || 1
      const mx = layer.x + gx
      const my = layer.y + gy
      const mw = layer.w * sx
      const mh = layer.h * sy

      for (const t of targets) {
        const tgx = (gsap.getProperty(t.el, 'x') as number) || 0
        const tgy = (gsap.getProperty(t.el, 'y') as number) || 0
        const tsx = (gsap.getProperty(t.el, 'scaleX') as number) || 1
        const tsy = (gsap.getProperty(t.el, 'scaleY') as number) || 1
        const tx = t.layer.x + tgx
        const ty = t.layer.y + tgy
        const tw = t.layer.w * tsx
        const th = t.layer.h * tsy
        t.el.style.clipPath = computeClipPathPx(
          { x: mx, y: my, w: mw, h: mh },
          { x: tx, y: ty, w: tw, h: th },
          shape,
          invert,
        )
      }
    },
  }, start)
}

/** Add a layer's animation to a GSAP timeline (keyframes or preset) */
function addLayerToTimeline(tl: gsap.core.Timeline, el: HTMLElement, layer: Layer) {
  if (layer.type === 'audio') {
    // Audio layers skip visual animation — only sync playback
    addAudioSync(tl, el, layer)
    return
  }
  if (hasKeyframes(layer)) {
    buildLayerKeyframes(tl, el, layer)
  } else {
    buildPresetLayer(tl, el, layer)
  }

  // Motion path animation — drives position along a curved trajectory
  if (layer.motionPath && layer.motionPath.length >= 2) {
    const startTime = layer.startTime || 0
    const endTime = layer.endTime || (startTime + 3)
    tl.to(el, {
      motionPath: {
        path: layer.motionPath.map(p => ({ x: p.x, y: p.y })),
        curviness: layer.motionPathCurviness ?? 1,
        autoRotate: layer.motionPathAutoRotate || false,
      },
      duration: endTime - startTime,
      ease: layer.ease || 'none',
      immediateRender: false,
    }, startTime)
  }

  addVideoSync(tl, el, layer)
  // Mask layers: hide visually, animate clip-path on targets
  addMaskAnimation(tl, el, layer)
}

/** Get the latest end time from a layer's keyframes */
function getKeyframeEndTime(layer: Layer): number {
  if (!layer.keyframes) return layer.endTime || (layer.startTime || 0) + 3
  let maxTime = 0
  for (const kfs of Object.values(layer.keyframes)) {
    if (!kfs) continue
    for (const kf of kfs) {
      maxTime = Math.max(maxTime, kf.time)
    }
  }
  return maxTime || layer.endTime || (layer.startTime || 0) + 3
}

export function useBannerTimeline() {
  const { state, activeLayers } = useBannerStudio()

  /** Clear all GSAP influence from layer elements so they return to natural Vue-rendered state */
  function clearGsap(artboardEl: HTMLElement, layers: Layer[]) {
    layers.forEach(layer => {
      const el = artboardEl.querySelector(`#lyr-${layer.id}`) as HTMLElement
      if (el) {
        gsap.killTweensOf(el)
        el.style.removeProperty('opacity')
        el.style.removeProperty('visibility')
        el.style.removeProperty('transform')
        el.style.removeProperty('clip-path')
        // Pause and reset audio elements
        const audioEl = el.querySelector('audio') as HTMLAudioElement
        if (audioEl) { audioEl.pause(); audioEl.currentTime = 0 }
      }
    })
  }

  function startTimePoller() {
    stopTimePoller()
    timePoller = setInterval(() => {
      if (masterTl && state.isPlaying) {
        state.currentTime = masterTl.time()
        // Loop range: if playhead exceeds loopOut, jump back to loopIn
        if (state.loopIn != null && state.loopOut != null && state.isLooping) {
          if (state.currentTime >= state.loopOut) {
            masterTl.seek(state.loopIn)
            state.currentTime = state.loopIn
          }
        }
      }
    }, 50) // 20fps for UI updates — enough for playhead smoothness
  }

  function stopTimePoller() {
    if (timePoller) { clearInterval(timePoller); timePoller = null }
  }

  function buildTimeline(artboardEl: HTMLElement, layers: Layer[]) {
    // Kill previous timeline and clear its influence
    if (masterTl) {
      masterTl.kill()
      masterTl = null
    }
    clearGsap(artboardEl, layers)

    lastArtboardEl = artboardEl
    lastLayers = layers

    masterTl = gsap.timeline({
      paused: true,
      onComplete() {
        stopTimePoller()
        state.currentTime = state.duration
        if (state.isLooping) {
          const loopStart = state.loopIn != null ? state.loopIn : 0
          masterTl?.seek(loopStart)
          masterTl?.play()
          startTimePoller()
        } else {
          state.isPlaying = false
          if (lastArtboardEl) clearGsap(lastArtboardEl, lastLayers)
        }
      },
    })

    let naturalEnd = 0

    layers.forEach(layer => {
      const el = artboardEl.querySelector(`#lyr-${layer.id}`) as HTMLElement
      if (!el) return

      const endTime = hasKeyframes(layer)
        ? getKeyframeEndTime(layer)
        : (layer.endTime || (layer.startTime || 0) + 3)
      naturalEnd = Math.max(naturalEnd, endTime)

      addLayerToTimeline(masterTl!, el, layer)
    })

    state.duration = naturalEnd || 5
    return masterTl
  }

  function playTimeline() {
    if (!masterTl) return
    state.isPlaying = true
    masterTl.play()
    startTimePoller()
  }

  function pauseTimeline() {
    if (!masterTl) return
    stopTimePoller()
    state.isPlaying = false
    state.currentTime = masterTl.time()
    masterTl.pause()
  }

  function togglePlay() {
    if (state.isPlaying) {
      pauseTimeline()
    } else {
      if (masterTl) {
        masterTl.seek(0)
        state.isPlaying = true
        masterTl.play()
        startTimePoller()
      }
    }
  }

  function seekTo(time: number) {
    if (!masterTl) return
    pauseTimeline()
    masterTl.seek(time)
    state.currentTime = time
    // Manually sync video and audio elements to the seeked time
    if (lastArtboardEl) {
      lastLayers.forEach(layer => {
        if ((layer.type === 'bg' && layer.srcType === 'video') || layer.type === 'video') {
          const el = lastArtboardEl!.querySelector(`#lyr-${layer.id} video`) as HTMLVideoElement
          if (el) {
            const startTime = layer.startTime || 0
            const videoTime = Math.max(0, time - startTime)
            el.currentTime = Math.min(videoTime, el.duration || videoTime)
          }
        }
        if (layer.type === 'audio') {
          const el = lastArtboardEl!.querySelector(`#lyr-${layer.id} audio`) as HTMLAudioElement
          if (el) {
            const startTime = layer.startTime || 0
            const endTime = layer.endTime || (startTime + 3)
            if (time >= startTime && time <= endTime) {
              el.currentTime = Math.min(time - startTime, el.duration || (time - startTime))
            } else {
              el.pause()
              el.currentTime = 0
            }
          }
        }
      })
    }
  }

  function scrubTo(fraction: number) {
    if (!masterTl) return
    const time = fraction * state.duration
    seekTo(time)
  }

  function restartTimeline() {
    if (!masterTl) return
    masterTl.restart()
    state.isPlaying = true
    startTimePoller()
  }

  // Build a standalone timeline for a specific artboard key (for PlayAll)
  function buildTimelineForKey(artboardEl: HTMLElement, layers: Layer[]): gsap.core.Timeline {
    const tl = gsap.timeline({
      paused: true,
      onComplete() {
        if (state.isLooping) {
          tl.restart()
        }
      },
    })

    layers.forEach(layer => {
      const el = artboardEl.querySelector(`#lyr-${layer.id}`) as HTMLElement
      if (!el) return
      addLayerToTimeline(tl, el, layer)
    })

    return tl
  }

  return {
    buildTimeline,
    playTimeline,
    pauseTimeline,
    togglePlay,
    seekTo,
    scrubTo,
    restartTimeline,
    buildTimelineForKey,
    get masterTl() { return masterTl },
  }
}
