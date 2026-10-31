import { describe, expect, it } from 'vitest'
import { editSlides, layerSlideId, resolveSlides, slideAtTime, slidePoster, slideRanges } from '../../app/utils/banner-slides'
import type { ArtboardState, Layer } from '../../app/types/banner-studio'

let id = 100
const edit = (board: ArtboardState, action: Parameters<typeof editSlides>[1]) => editSlides(board, action, () => ++id, { w: 300, h: 250 })
const layer = (id: number, startTime: number, endTime: number, extra: Partial<Layer> = {}) => ({ id, type: 'image', name: `Artwork ${id}`, x: 10, y: 20, w: 100, h: 100, opacity: 1, zIndex: id, startTime, endTime, clipToPresence: true, keyframes: { opacity: [{ time: startTime, value: 0, easing: 'none' }, { time: startTime + 1, value: 1 }, { time: endTime, value: 1 }] }, ...extra } as Layer)
const source = (): ArtboardState => ({ bgColor: '#ffffff', playback: { duration: 10, loopCount: 0 }, layers: [layer(1, 0, 6), layer(2, 6, 10), layer(3, 0, 10, { type: 'bg', clipToPresence: false }), layer(4, 0, 10, { type: 'audio', clipToPresence: false })] })

describe('slide structure and retiming', () => {
  it('recovers 6s + 4s hard cuts without mutating old projects or confusing layouts with slides', () => {
    const board = source(), before = JSON.stringify(board)
    expect(resolveSlides(board).map(slide => slide.duration)).toEqual([6, 4])
    expect(slideAtTime(board, 6)?.name).toBe('Slide 2')
    expect(layerSlideId(board, board.layers[3]!)).toBeUndefined()
    expect(JSON.stringify(board)).toBe(before)
    expect(resolveSlides({ layers: [layer(1, 0, 6, { clipToPresence: false }), layer(2, 6, 10, { clipToPresence: false })] })).toHaveLength(1)
    expect(resolveSlides({ playback: board.playback, layers: [...board.layers, layer(5, 5, 7)] })).toHaveLength(1)
  })
  it('retimes keyframes, motion-path segments, named animation blocks and later scene audio together', () => {
    const board = source()
    Object.assign(board.layers[0]!, { animInStart: 0.5, animInDur: 1, animOutStart: 5, outDur: 1, wordPop: { duration: 0.5, stagger: 0.1, ease: 'none' }, animationClips: [{ start: 2, end: 3, label: 'Blink' }], motionPathTweens: [{ startTime: 1, endTime: 5, pathStart: 0.2, pathEnd: 0.8, ease: 'none' }] })
    const next = edit(board, { type: 'duration', index: 0, duration: 12 })
    expect(next.playback).toEqual({ duration: 16, loopCount: 0 })
    expect(next.layers[0]).toMatchObject({ startTime: 0, endTime: 12, animInStart: 1, animInDur: 2, animOutStart: 10, outDur: 2, wordPop: { duration: 1, stagger: 0.2 }, animationClips: [{ start: 4, end: 6, label: 'Blink' }], motionPathTweens: [{ startTime: 2, endTime: 10, pathStart: 0.2, pathEnd: 0.8 }] })
    expect(next.layers[0]!.keyframes!.opacity!.map(frame => frame.time)).toEqual([0, 2, 12])
    expect(next.layers[1]).toMatchObject({ startTime: 12, endTime: 16 })
    expect(board.layers[0]!.endTime).toBe(6)
  })
  it('reorders entire scenes while preserving their animation values, duration and shared audio', () => {
    const next = edit(source(), { type: 'move', index: 1, to: 0 })
    expect(next.slides!.map(slide => slide.duration)).toEqual([4, 6])
    expect(next.layers.find(layer => layer.id === 2)).toMatchObject({ startTime: 0, endTime: 4 })
    expect(next.layers.find(layer => layer.id === 1)!.keyframes!.opacity!.map(frame => frame.time)).toEqual([4, 5, 10])
    expect(next.layers.find(layer => layer.id === 4)).toMatchObject({ startTime: 0, endTime: 10 })
  })
  it('duplicates masks and assets with new identities, remapped targets and independent linked content', () => {
    const board = source()
    board.layers[0]!.linkId = 'source:car'
    board.layers.push(layer(5, 0, 6, { isMask: true, maskTargetIds: [1], maskShape: 'rect' }))
    const next = edit(board, { type: 'duplicate', index: 0, id: 'copy' })
    const copies = next.layers.filter(layer => layer.slideId === 'copy')
    expect(copies).toHaveLength(2)
    const car = copies.find(layer => !layer.isMask)!, mask = copies.find(layer => layer.isMask)!
    expect(car.id).not.toBe(1)
    expect(car.linkId).toBe('source:car:copy')
    expect(car.startTime).toBe(6)
    expect(mask.maskTargetIds).toEqual([car.id])
    expect(next.layers.find(layer => layer.id === 2)!.startTime).toBe(12)
    expect(next.playback!.duration).toBe(16)
    car.keyframes!.opacity![1]!.value = 0.2
    expect(next.layers.find(layer => layer.id === 1)!.keyframes!.opacity![1]!.value).toBe(1)
  })
  it('deletes owned artwork and dangling mask links, keeps shared assets and closes the gap', () => {
    const board = source()
    board.layers.push(layer(5, 0, 10, { isMask: true, maskTargetIds: [1, 2], clipToPresence: false }))
    const next = edit(board, { type: 'delete', index: 0 })
    expect(next.layers.some(layer => layer.id === 1)).toBe(false)
    expect(next.layers.find(layer => layer.id === 2)).toMatchObject({ startTime: 0, endTime: 4 })
    expect(next.layers.find(layer => layer.id === 5)!.maskTargetIds).toEqual([2])
    expect(next.layers.find(layer => layer.id === 4)).toMatchObject({ startTime: 0, endTime: 4 })
    expect(() => edit(next, { type: 'delete', index: 0 })).toThrow('at least one')
  })
  it('adds an empty slide, preserves loop count, and makes a poster without other scene artwork or transitions', () => {
    const next = edit(source(), { type: 'add', after: 0, id: 'new' })
    expect(next.slides!.map(slide => slide.duration)).toEqual([6, 3, 4])
    expect(next.layers.find(layer => layer.id === 2)!.startTime).toBe(9)
    const poster = slidePoster(next, 'slide-1')
    expect(poster.layers.map(layer => layer.id)).toEqual([1, 3])
    expect(poster.layers[0]!.keyframes).toBeUndefined()
    expect(poster.layers[0]!.clipToPresence).toBe(false)
  })
  it('builds a fade overlay at the cut, clamps short transitions, and removes it cleanly', () => {
    const next = edit(source(), { type: 'transition', index: 0, duration: 0.8 })
    const overlay = next.layers.find(layer => layer.slideTransitionFor)!
    expect(overlay).toMatchObject({ type: 'rect', locked: true, opacity: 0, fillColor: '#ffffff', w: 300, h: 250, startTime: 5.6, endTime: 6.4 })
    expect(overlay.keyframes!.opacity!.map(frame => [frame.time, frame.value])).toEqual([[5.6, 0], [6, 1], [6.4, 0]])
    expect(next.playback!.duration).toBe(10)
    const shorter = edit(next, { type: 'duration', index: 1, duration: 0.2 })
    expect(shorter.slides![0]!.transition!.duration).toBe(0.2)
    expect(shorter.layers.filter(layer => layer.slideTransitionFor)).toHaveLength(1)
    const removed = edit(next, { type: 'transition', index: 0, duration: 0 })
    expect(removed.layers.some(layer => layer.slideTransitionFor)).toBe(false)
    expect(source().layers.map(layer => layer.keyframes)).toEqual(removed.layers.map(layer => layer.keyframes))
  })
  it.each([NaN, Infinity, -1, 0, 0.05, 301])('rejects invalid or excessive duration %s without touching the source', (duration) => {
    const board = source(), before = JSON.stringify(board)
    expect(() => edit(board, { type: 'duration', index: 0, duration })).toThrow()
    expect(JSON.stringify(board)).toBe(before)
  })
  it('rejects invalid positions, names, loops, missing slides and duplicate identities', () => {
    for (const action of [{ type: 'move', index: 0, to: -1 }, { type: 'rename', index: 0, name: ' ' }, { type: 'loop', loopCount: -1 }, { type: 'loop', loopCount: 1.5 }, { type: 'duration', index: 99, duration: 1 }, { type: 'add', after: 0, id: 'slide-1' }, { type: 'transition', index: 1, duration: 1 }] as Parameters<typeof edit>[1][]) expect(() => edit(source(), action)).toThrow()
    expect(edit(source(), { type: 'loop', loopCount: 3 }).playback!.loopCount).toBe(3)
  })
})

it('holds the slide count and sequence duration limits without mutating rejected edits', () => {
  const board: ArtboardState = { layers: [], slides: Array.from({ length: 50 }, (_, index) => ({ id: `s${index}`, name: `Slide ${index}`, duration: 1 })) }
  expect(() => edit(board, { type: 'add', after: 0, id: 'too-many' })).toThrow('50 slides')
  expect(() => edit(board, { type: 'duplicate', index: 0, id: 'too-many' })).toThrow('50 slides')
  expect(board.slides).toHaveLength(50)
  expect(() => edit({ layers: [], slides: [{ id: 'x', name: 'Invalid', duration: NaN }] }, { type: 'loop', loopCount: 1 })).toThrow('invalid slide settings')
})

it('keeps scene ownership and frame values consistent through a long sequence of reversible designer edits', () => {
  let board = source()
  for (let step = 0; step < 100; step++) {
    const index = step % resolveSlides(board).length
    const type = step % 5
    board = edit(board, type === 0
      ? { type: 'duplicate', index, id: `copy-${step}` }
      : type === 1
        ? { type: 'move', index, to: resolveSlides(board).length - 1 }
        : type === 2
          ? { type: 'duration', index, duration: 0.5 + step % 4 }
          : type === 3 && resolveSlides(board).length > 1
            ? { type: 'delete', index }
            : { type: 'loop', loopCount: step % 3 })
    const ranges = slideRanges(resolveSlides(board))
    expect(new Set(board.layers.map(layer => layer.id)).size).toBe(board.layers.length)
    for (const layer of board.layers.filter(layer => layer.slideId)) {
      const range = ranges.find(slide => slide.id === layer.slideId)!
      expect(layer.startTime).toBeGreaterThanOrEqual(range.start - 0.0001)
      expect(layer.endTime).toBeLessThanOrEqual(range.end + 0.0001)
      expect(layer.endTime).toBeGreaterThan(layer.startTime)
      for (const frames of Object.values(layer.keyframes || {})) for (const frame of frames || []) expect(frame.time).toBeGreaterThanOrEqual(range.start - 0.0001)
    }
  }
})
