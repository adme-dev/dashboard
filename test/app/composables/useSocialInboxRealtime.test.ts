import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref, watch } from 'vue'

describe('useSocialInboxRealtime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('watch', watch)
    vi.stubGlobal('onMounted', (callback: () => void) => callback())
    vi.stubGlobal('onUnmounted', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('polls an aggregate inbox that has no single-client SSE endpoint', async () => {
    const onRefresh = vi.fn()
    const { useSocialInboxRealtime } = await import('~~/app/composables/useSocialInboxRealtime')

    const realtime = useSocialInboxRealtime(ref(null), {
      onRefresh,
      pollInterval: 1_000,
      pollWithoutEndpoint: true
    })

    expect(realtime.connected.value).toBe(true)
    expect(realtime.connectionType.value).toBe('polling')

    await vi.advanceTimersByTimeAsync(1_000)
    expect(onRefresh).toHaveBeenCalledTimes(1)

    realtime.disconnect()
  })
})
