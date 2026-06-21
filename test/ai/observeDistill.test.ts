import { describe, it, expect, vi } from 'vitest'
import {
  buildObserveDistillPrompt,
  parseObserveDistillResponse,
  describeRoutine,
  distillObserved,
  prioritizeRoutines,
  MAX_OBSERVED,
  MAX_ROUTINES_FED
} from '~~/server/utils/ai/observe/distill'
import type { RoutineCandidate } from '~~/server/utils/ai/observe/sessionize'

const routine = (over: Partial<RoutineCandidate> = {}): RoutineCandidate => ({
  signature: '1|9|spend.sync>budget.check',
  weekday: 1,
  hour: 9,
  sequence: ['spend.sync', 'budget.check'],
  occurrences: 4,
  lastSeen: '2026-06-15T09:00:00Z',
  ...over
})

describe('describeRoutine', () => {
  it('renders weekday + hour + sequence', () => {
    expect(describeRoutine(routine())).toBe('Monday around 09:00 UTC: spend.sync → budget.check (seen on 4 days)')
  })
  it('handles a day-agnostic routine', () => {
    expect(describeRoutine(routine({ weekday: null, hour: null }))).toContain('recurring:')
  })
})

describe('buildObserveDistillPrompt', () => {
  it('includes each routine line and forbids invention', () => {
    const p = buildObserveDistillPrompt([routine()])
    expect(p).toContain('Monday around 09:00 UTC: spend.sync → budget.check')
    expect(p.toLowerCase()).toContain('invent nothing')
  })
  it('instructs the model to ignore trivial patterns and drop clock times', () => {
    const p = buildObserveDistillPrompt([routine()]).toLowerCase()
    expect(p).toContain('ignore trivial')
    expect(p).toContain('do not copy precise clock times')
  })
})

describe('prioritizeRoutines', () => {
  const r = (over: Partial<RoutineCandidate>): RoutineCandidate => routine({ sequence: ['a'], occurrences: 3, ...over })

  it('puts multi-step sequences ahead of single-action ones, regardless of occurrences', () => {
    const single = r({ sequence: ['task.comment'], occurrences: 9 })
    const multi = r({ sequence: ['spend.sync', 'budget.check'], occurrences: 3 })
    const out = prioritizeRoutines([single, multi])
    expect(out[0]).toBe(multi)
    expect(out[1]).toBe(single)
  })

  it('orders by occurrences within the same tier', () => {
    const a = r({ sequence: ['x', 'y'], occurrences: 4 })
    const b = r({ sequence: ['x', 'y'], occurrences: 7 })
    expect(prioritizeRoutines([a, b])[0]).toBe(b)
  })

  it('caps the number of routines fed to the model', () => {
    const many = Array.from({ length: 30 }, (_, i) => r({ signature: `s${i}`, occurrences: 3 }))
    expect(prioritizeRoutines(many)).toHaveLength(MAX_ROUTINES_FED)
  })
})

describe('parseObserveDistillResponse', () => {
  it('parses a clean array', () => {
    const out = parseObserveDistillResponse('[{"memType":"procedural","content":"reviews spend Monday mornings","salience":0.8}]')
    expect(out).toEqual([{ memType: 'procedural', content: 'reviews spend Monday mornings', salience: 0.8 }])
  })
  it('extracts JSON embedded in prose and defaults a bad memType to procedural', () => {
    const out = parseObserveDistillResponse('Sure! [{"memType":"nonsense","content":"works on Acme"}] hope that helps')
    expect(out).toEqual([{ memType: 'procedural', content: 'works on Acme', salience: 0.5 }])
  })
  it('clamps salience and drops empty content', () => {
    const out = parseObserveDistillResponse('[{"content":"x","salience":5},{"content":"  "}]')
    expect(out).toEqual([{ memType: 'procedural', content: 'x', salience: 1 }])
  })
  it('returns [] on garbage', () => {
    expect(parseObserveDistillResponse('not json')).toEqual([])
    expect(parseObserveDistillResponse('')).toEqual([])
  })
  it('salvages complete objects from a truncated array (no closing bracket)', () => {
    // A reasoning model cut off mid-array — the first object is complete, the second is partial.
    const truncated = '[\n  {"memType":"procedural","content":"reviews spend every Monday","salience":0.9},\n  {"memType":"proc'
    const out = parseObserveDistillResponse(truncated)
    expect(out).toEqual([{ memType: 'procedural', content: 'reviews spend every Monday', salience: 0.9 }])
  })
})

describe('distillObserved', () => {
  it('returns parsed candidates from the injected completion', async () => {
    const complete = vi.fn().mockResolvedValue('[{"memType":"procedural","content":"reviews ad spend every Monday","salience":0.7}]')
    const out = await distillObserved([routine()], [], { complete })
    expect(out).toEqual([{ memType: 'procedural', content: 'reviews ad spend every Monday', salience: 0.7 }])
  })

  it('does not call the model when there are no routines', async () => {
    const complete = vi.fn()
    const out = await distillObserved([], [], { complete })
    expect(out).toEqual([])
    expect(complete).not.toHaveBeenCalled()
  })

  it('is fail-safe: a throwing completion → []', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('model down'))
    expect(await distillObserved([routine()], [], { complete })).toEqual([])
  })

  it('dedups against existing memory contents (case/space-insensitive)', async () => {
    const complete = vi.fn().mockResolvedValue('[{"content":"Reviews Ad Spend Every Monday"},{"content":"works on creative proofs"}]')
    const out = await distillObserved([routine()], ['  reviews ad spend every monday '], { complete })
    expect(out.map(c => c.content)).toEqual(['works on creative proofs'])
  })

  it('caps at MAX_OBSERVED after dedup', async () => {
    const complete = vi.fn().mockResolvedValue(
      JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ content: `fact ${i}` })))
    )
    const out = await distillObserved([routine()], [], { complete })
    expect(out).toHaveLength(MAX_OBSERVED)
  })
})
