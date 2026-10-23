import { describe, expect, it } from 'vitest'
import gsap from 'gsap'
import { buildBannerHTML as client } from '../../app/utils/banner-html-builder'
import { buildBannerHTML as server } from '../../server/utils/banner/htmlBuilder'
import { applyBannerPlayback } from '../../app/utils/banner-playback'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'
import type { Layer } from '../../app/types/banner-studio'

const layers = [{ id: 1, type: 'rect', opacity: 1, x: 0, y: 0, w: 10, h: 10, startTime: 0, endTime: 1, keyframes: { opacity: [{ time: 0, value: 1 }, { time: 1, value: 0.4 }] } }] as Layer[]

describe('imported playback contract', () => {
  it.each([0, 1, 3])('persists %i total source plays and one-cycle duration', async (loopCount) => {
    const candidate = await convertTheBriefHtml(source.replace('loopCount:0', `loopCount:${loopCount}`))
    expect(candidate.canvasData.custom_300x250.playback).toEqual({ duration: 4, loopCount })
    expect(candidate.warnings.join(' ')).not.toMatch(/loop.*integration|loop settings/i)
  })

  it.each([[0, -1], [1, 0], [3, 2]])('repeats %i source plays without changing a cycle or final value', (loopCount, repeats) => {
    const target = { opacity: 1 }
    const tl = gsap.timeline({ paused: true }).to(target, { opacity: 0.4, duration: 1 })
    applyBannerPlayback(tl, { duration: 4, loopCount })
    expect(tl.repeat()).toBe(repeats)
    expect(tl.duration()).toBe(4)
    tl.totalTime(loopCount ? loopCount * 4 : 11.9, false)
    expect(target.opacity).toBeCloseTo(0.4)
    if (loopCount) expect(tl.totalDuration()).toBe(loopCount * 4)
    tl.kill()
  })

  it('keeps existing timelines unchanged without imported playback', () => {
    const tl = gsap.timeline({ paused: true }).to({}, { duration: 2 })
    applyBannerPlayback(tl)
    expect(tl.duration()).toBe(2)
    expect(tl.repeat()).toBe(0)
    tl.kill()
  })

  it.each([0, 1, 3])('exports %i plays equally in client and server while capture stays one cycle', (loopCount) => {
    const html = client('mrec', layers, { playback: { duration: 4, loopCount } })
    expect(server('mrec', layers, { playback: { duration: 4, loopCount } })).toBe(html)
    expect(html).toContain(`const tl = gsap.timeline({ repeat: ${loopCount === 0 ? -1 : loopCount - 1} });`)
    expect(html).toContain('tl.to({}, { duration: 4 }, 0);')
    expect(html).toContain('var fixedCycleDuration = true;')
  })
})

it('exposes a bounded capture cycle for continuous HTML playback and seeks the final artwork', () => {
  const html = client('mrec', layers, { playback: { duration: 4, loopCount: 0 } })
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]!)
  const target = { opacity: 1 }
  const tl = gsap.timeline({ paused: true })
  const wrapped = {
    set: (_selector: string, vars: object, at: number) => tl.set(target, vars, at),
    to: (selector: object | string, vars: object, at: number) => tl.to(typeof selector === 'string' ? target : selector, vars, at),
    eventCallback: tl.eventCallback.bind(tl),
    pause: tl.pause.bind(tl), seek: tl.seek.bind(tl), duration: tl.duration.bind(tl), totalDuration: tl.totalDuration.bind(tl)
  }
  const nativeWindow = {} as { __engagrFrame: { duration: number, seek: (time: number) => void } }
  try {
    new Function('gsap', 'window', scripts.find(script => script.includes('const tl ='))!)({ timeline: (options: { repeat: number }) => {
      tl.repeat(options.repeat)
      return wrapped
    } }, nativeWindow)
    new Function('window', 'document', scripts.find(script => script.includes('var fixedCycleDuration'))!)(nativeWindow, { querySelectorAll: () => [] })
    expect(nativeWindow.__engagrFrame.duration).toBe(4)
    expect(tl.repeat()).toBe(-1)
    nativeWindow.__engagrFrame.seek(4)
    expect(target.opacity).toBeCloseTo(0.4)
    nativeWindow.__engagrFrame.seek(0)
    expect(target.opacity).toBe(1)
    expect(nativeWindow.__engagrFrame.duration).toBe(4)
  } finally { tl.kill() }
})
