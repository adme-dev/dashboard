import { describe, it, expect, vi } from 'vitest'
import { makeEngineReloader, type ReloaderEngine, type ReloaderSink } from '~~/app/composables/useMediaProjectEditor'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

const state = { schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0, tracks: [], ducking: [] } as unknown as TimelineState

function makeSink(playhead = 0): ReloaderSink & { committedDuration: number | null; committedTime: number | null; pausedCalled: number; committedMissing: string[] | null } {
  return {
    committedDuration: null,
    committedTime: null,
    pausedCalled: 0,
    committedMissing: null,
    getPlayhead: () => playhead,
    onPaused() { this.pausedCalled++ },
    commitPlan() { /* noop for these tests */ },
    commitMissing(ids: string[]) { this.committedMissing = ids },
    commitTransport(duration: number, currentTime: number) { this.committedDuration = duration; this.committedTime = currentTime }
  }
}

describe('makeEngineReloader', () => {
  it('pauses the transport BEFORE loading when the engine is playing', async () => {
    const order: string[] = []
    const engine: ReloaderEngine = {
      isPlaying: () => true,
      pause: () => { order.push('pause') },
      load: async () => { order.push('load') },
      duration: () => 10,
      seek: () => {},
      currentTime: () => 0
    }
    const sink = makeSink(3)
    const reload = makeEngineReloader(engine, sink, () => {})
    await reload(state)
    expect(order).toEqual(['pause', 'load'])
    expect(sink.pausedCalled).toBe(1)
  })

  it('does NOT pause when the engine is already stopped', async () => {
    const pause = vi.fn()
    const engine: ReloaderEngine = {
      isPlaying: () => false,
      pause,
      load: async () => {},
      duration: () => 10,
      seek: () => {},
      currentTime: () => 0
    }
    const sink = makeSink()
    await makeEngineReloader(engine, sink, () => {})(state)
    expect(pause).not.toHaveBeenCalled()
    expect(sink.pausedCalled).toBe(0)
  })

  it('clamps the restored playhead to the new (shorter) duration', async () => {
    const seek = vi.fn()
    const engine: ReloaderEngine = {
      isPlaying: () => false,
      pause: () => {},
      load: async () => {},
      duration: () => 4,            // timeline shortened to 4s
      seek,
      currentTime: () => 4
    }
    const sink = makeSink(9)         // playhead was at 9s
    await makeEngineReloader(engine, sink, () => {})(state)
    expect(seek).toHaveBeenCalledWith(4) // clamped, not 9
    expect(sink.committedDuration).toBe(4)
  })

  it('forwards the load result missing-clip ids to the sink (winner only)', async () => {
    const engine: ReloaderEngine = {
      isPlaying: () => false,
      pause: () => {},
      load: async () => ({ missingClipIds: ['dead'] }),
      duration: () => 10,
      seek: () => {},
      currentTime: () => 0
    }
    const sink = makeSink()
    await makeEngineReloader(engine, sink, () => {})(state)
    expect(sink.committedMissing).toEqual(['dead'])
  })

  it('latest-wins: a stale (superseded) reload does not commit transport state', async () => {
    // Engine.load resolves on a deferred we control, so we can interleave two reloads.
    let resolveFirst!: () => void
    let loadCall = 0
    const engine: ReloaderEngine = {
      isPlaying: () => false,
      pause: () => {},
      load: () => {
        loadCall++
        if (loadCall === 1) return new Promise<void>((r) => { resolveFirst = r })
        return Promise.resolve()    // second load resolves immediately
      },
      duration: () => loadCall === 1 ? 111 : 222,
      seek: () => {},
      currentTime: () => 0
    }
    const sink = makeSink()
    const reload = makeEngineReloader(engine, sink, () => {})

    const first = reload(state)   // begins, awaits resolveFirst
    const second = reload(state)  // bumps seq, loads + commits immediately
    await second
    expect(sink.committedDuration).toBe(222) // second won

    resolveFirst()                // first's late resolution
    await first
    expect(sink.committedDuration).toBe(222) // STILL 222 — stale reload did not overwrite
  })
})
