import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, reactive, ref } from 'vue'
import { useAudienceAnalytics } from '../../app/composables/useAudienceAnalytics'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function installAudienceGlobals(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('useRoute', () => ({
    query: { from: '2026-07-03', to: '2026-08-01' }
  }))
  vi.stubGlobal('useRouter', () => ({ replace: vi.fn() }))
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('onBeforeUnmount', vi.fn())
  vi.stubGlobal('watch', (
    source: { value: unknown },
    callback: (value: unknown) => void,
    options?: { immediate?: boolean }
  ) => {
    if (options?.immediate) callback(source.value)
    return vi.fn()
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAudienceAnalytics request orchestration', () => {
  it('fetches only the three breakdown dimensions rendered by the dashboard', async () => {
    const fetchMock = vi.fn(async (
      request: string,
      options?: { query?: Record<string, string> }
    ) => {
      if (request.endsWith('/overview')) return { availableClients: [] }
      if (request.endsWith('/timeseries')) return { current: [], previous: [] }
      return { dimension: options?.query?.dimension, rows: [] }
    })
    installAudienceGlobals(fetchMock)

    const audience = useAudienceAnalytics()
    await vi.waitFor(() => expect(audience.status.breakdowns).toBe('success'))

    const breakdownDimensions = fetchMock.mock.calls
      .filter(([request]) => String(request).endsWith('/breakdowns'))
      .map(([, options]) => options?.query?.dimension)

    expect(breakdownDimensions).toEqual(['source', 'campaign', 'page'])
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('publishes a fast resource as soon as it resolves without waiting for slower panels', async () => {
    const overview = deferred<Record<string, unknown>>()
    const timeseries = deferred<Record<string, unknown>>()
    const breakdown = deferred<Record<string, unknown>>()
    const fetchMock = vi.fn((request: string) => {
      if (request.endsWith('/overview')) return overview.promise
      if (request.endsWith('/timeseries')) return timeseries.promise
      return breakdown.promise
    })
    installAudienceGlobals(fetchMock)

    const audience = useAudienceAnalytics()

    try {
      timeseries.resolve({ current: [], previous: [] })
      await nextTick()
      await vi.waitFor(() => expect(audience.status.timeseries).toBe('success'))

      expect(audience.status.overview).toBe('pending')
      expect(audience.status.breakdowns).toBe('pending')
    } finally {
      overview.resolve({ availableClients: [] })
      breakdown.resolve({ rows: [] })
    }
  })
})
