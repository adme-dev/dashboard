// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'

function runtimeConfig(apiKey = 'browser-key', mapId = 'market-map-id') {
  return {
    public: {
      googleMapsBrowserApiKey: apiKey,
      googleMapsMapId: mapId
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
  delete (window as Window & { google?: unknown }).google
  document.head.replaceChildren()
})

describe('useGoogleMaps', () => {
  it('shares one official loader promise and imports the maps and marker libraries once', async () => {
    class FakeMap { readonly kind = 'map' }
    class FakeCircle { readonly kind = 'circle' }
    class FakeMarker { readonly kind = 'marker' }
    const importLibrary = vi.fn(async (name: string) => name === 'maps'
      ? { Map: FakeMap, Circle: FakeCircle }
      : { AdvancedMarkerElement: FakeMarker })
    vi.stubGlobal('useRuntimeConfig', () => runtimeConfig())

    const appendChild = vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      const script = node as HTMLScriptElement
      ;(window as Window & { google?: unknown }).google = { maps: { importLibrary } }
      queueMicrotask(() => script.dispatchEvent(new Event('load')))
      return node
    })
    const { useGoogleMaps } = await import('~~/app/composables/useGoogleMaps')
    const maps = useGoogleMaps()

    const first = maps.load()
    const second = maps.load()

    expect(first).toBe(second)
    await expect(first).resolves.toMatchObject({
      Map: expect.any(Function),
      Circle: expect.any(Function),
      AdvancedMarkerElement: expect.any(Function)
    })
    expect(appendChild).toHaveBeenCalledTimes(1)
    const loaderUrl = new URL((appendChild.mock.calls[0]![0] as HTMLScriptElement).src)
    expect(loaderUrl.origin + loaderUrl.pathname).toBe('https://maps.googleapis.com/maps/api/js')
    expect(loaderUrl.searchParams.get('key')).toBe('browser-key')
    expect(importLibrary.mock.calls.map(([library]) => library)).toEqual(['maps', 'marker'])
    expect(maps.status.value).toBe('success')
    expect(maps.error.value).toBeNull()
  })

  it('reports a useful error without injecting a script when the public browser key is missing', async () => {
    vi.stubGlobal('useRuntimeConfig', () => runtimeConfig(''))
    const appendChild = vi.spyOn(document.head, 'appendChild')
    const { useGoogleMaps } = await import('~~/app/composables/useGoogleMaps')
    const maps = useGoogleMaps()

    await expect(maps.load()).rejects.toThrow('browser API key')

    expect(maps.status.value).toBe('error')
    expect(maps.error.value).toContain('browser API key')
    expect(appendChild).not.toHaveBeenCalled()
  })

  it('does not access browser globals when load is called during SSR', async () => {
    vi.stubGlobal('useRuntimeConfig', () => runtimeConfig())
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('document', undefined)
    const { useGoogleMaps } = await import('~~/app/composables/useGoogleMaps')
    const maps = useGoogleMaps()

    await expect(maps.load()).rejects.toThrow('only available in the browser')
    expect(maps.status.value).toBe('error')
  })
})
