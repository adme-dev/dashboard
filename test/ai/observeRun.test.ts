import { describe, it, expect, vi } from 'vitest'
import { observeUser, runObservePass, type ObserveDeps } from '~~/server/utils/ai/observe/run'
import type { ObservedEvent } from '~~/server/utils/ai/observe/sessionize'
import type { UpsertMemoryInput } from '~~/server/utils/ai/memory/types'

// A recurring Monday-09:00 routine across 4 distinct weeks → detectRoutines should fire.
const weeklyEvents = (userId: string): ObservedEvent[] => {
  const mondays = ['2026-05-25', '2026-06-01', '2026-06-08', '2026-06-15']
  return mondays.flatMap(d => [
    { userId, kind: 'ai.spend_summary', at: `${d}T09:00:00Z` },
    { userId, kind: 'task.status_change', at: `${d}T09:05:00Z` }
  ])
}

const baseDeps = (over: Partial<ObserveDeps> = {}): ObserveDeps => ({
  source: { recentEvents: async () => [] },
  listActiveUserIds: async () => ['u1'],
  windowStart: () => '2026-05-01T00:00:00Z',
  getWatermark: async () => null,
  setWatermark: async () => {},
  recentContents: async () => [],
  save: async () => 'mem-1',
  complete: async () => '[{"memType":"procedural","content":"runs a Monday spend check","salience":0.8}]',
  ...over
})

describe('observeUser', () => {
  it('distils routines into observed, user-scoped memories and records the watermark', async () => {
    const save = vi.fn(async () => 'mem-1')
    const setWatermark = vi.fn(async () => {})
    const deps = baseDeps({
      source: { recentEvents: async u => weeklyEvents(u) },
      save: save as ObserveDeps['save'],
      setWatermark: setWatermark as ObserveDeps['setWatermark']
    })

    const r = await observeUser('u1', deps)

    expect(r.events).toBe(8)
    expect(r.routines).toBeGreaterThanOrEqual(1)
    expect(r.memories).toBe(1)
    const saved = save.mock.calls[0]![0] as UpsertMemoryInput
    expect(saved).toMatchObject({ userId: 'u1', source: 'observed', scope: 'user' })
    // watermark records the newest event processed
    expect(setWatermark).toHaveBeenCalledWith('u1', '2026-06-15T09:05:00Z', expect.objectContaining({ memories: 1 }))
  })

  it('reads a FIXED window (windowStart), not the watermark — so weekly routines accumulate', async () => {
    const recentEvents = vi.fn(async (u: string) => weeklyEvents(u))
    await observeUser('u1', baseDeps({
      windowStart: () => '2026-04-01T00:00:00Z',
      getWatermark: async () => '2026-06-14T00:00:00Z', // older than newest → still processes
      source: { recentEvents: recentEvents as unknown as ObserveDeps['source']['recentEvents'] }
    }))
    // the read uses windowStart, not the watermark
    expect(recentEvents).toHaveBeenCalledWith('u1', '2026-04-01T00:00:00Z', expect.any(Number))
  })

  it('skips the model when nothing is newer than the watermark (no new activity)', async () => {
    const complete = vi.fn()
    const save = vi.fn()
    const setWatermark = vi.fn()
    const r = await observeUser('u1', baseDeps({
      source: { recentEvents: async u => weeklyEvents(u) },
      getWatermark: async () => '2026-06-15T09:05:00Z', // == newest event → nothing new
      complete, save: save as unknown as ObserveDeps['save'], setWatermark: setWatermark as unknown as ObserveDeps['setWatermark']
    }))
    expect(r.skipped).toBe(true)
    expect(complete).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(setWatermark).not.toHaveBeenCalled()
  })

  it('no events → no watermark read, no model call, no save, no watermark move', async () => {
    const complete = vi.fn()
    const save = vi.fn()
    const setWatermark = vi.fn()
    const getWatermark = vi.fn(async () => null)
    const r = await observeUser('u1', baseDeps({
      source: { recentEvents: async () => [] },
      getWatermark, complete, save: save as unknown as ObserveDeps['save'], setWatermark: setWatermark as unknown as ObserveDeps['setWatermark']
    }))
    expect(r.events).toBe(0)
    expect(getWatermark).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    expect(save).not.toHaveBeenCalled()
    expect(setWatermark).not.toHaveBeenCalled()
  })

  it('events but no recurring routine → watermark advances, nothing distilled', async () => {
    const complete = vi.fn()
    const setWatermark = vi.fn(async () => {})
    const oneOff: ObservedEvent[] = [{ userId: 'u1', kind: 'task.status_change', at: '2026-06-15T09:00:00Z' }]
    const r = await observeUser('u1', baseDeps({
      source: { recentEvents: async () => oneOff },
      complete, setWatermark: setWatermark as unknown as ObserveDeps['setWatermark']
    }))
    expect(r.routines).toBe(0)
    expect(complete).not.toHaveBeenCalled()
    expect(setWatermark).toHaveBeenCalledWith('u1', '2026-06-15T09:00:00Z', expect.anything())
  })

  it('never throws — a source failure yields a zero result', async () => {
    const r = await observeUser('u1', baseDeps({
      source: { recentEvents: async () => { throw new Error('db down') } }
    }))
    expect(r).toEqual({ userId: 'u1', events: 0, routines: 0, memories: 0 })
  })

  it('reads and checks the watermark for the SAME user — never another user', async () => {
    const recentEvents = vi.fn(async (u: string) => weeklyEvents(u))
    const getWatermark = vi.fn(async () => null)
    await observeUser('u-9', baseDeps({
      getWatermark,
      source: { recentEvents: recentEvents as unknown as ObserveDeps['source']['recentEvents'] }
    }))
    expect(recentEvents.mock.calls[0]![0]).toBe('u-9')
    expect(getWatermark).toHaveBeenCalledWith('u-9')
  })
})

describe('runObservePass', () => {
  it('aggregates across users and isolates per-user failure', async () => {
    const deps = baseDeps({
      listActiveUserIds: async () => ['ok', 'boom'],
      source: {
        recentEvents: async u => (u === 'boom' ? (() => { throw new Error('x') })() : weeklyEvents(u))
      }
    })
    const res = await runObservePass(deps)
    expect(res.users).toBe(2)
    expect(res.memories).toBe(1) // only 'ok' produced a memory; 'boom' isolated to zero
    expect(res.perUser.find(p => p.userId === 'boom')).toEqual({ userId: 'boom', events: 0, routines: 0, memories: 0 })
  })
})
