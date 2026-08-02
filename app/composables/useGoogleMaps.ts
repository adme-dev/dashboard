import { readonly, ref } from 'vue'

export interface GoogleMapInstance {
  panTo(position: GoogleMapsPosition): void
}

export interface GoogleMapsLatLng {
  latitude: number
  longitude: number
}

export interface GoogleMapsPosition {
  lat: number
  lng: number
}

export interface GoogleMapsLibraries {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance
  Circle: new (options: Record<string, unknown>) => {
    map: GoogleMapInstance | null
    setCenter?(center: GoogleMapsPosition): void
    setRadius?(radius: number): void
  }
  AdvancedMarkerElement: new (options: Record<string, unknown>) => {
    map: GoogleMapInstance | null
    addListener(name: string, listener: () => void): { remove(): void }
  }
}

export type GoogleMapsStatus = 'idle' | 'pending' | 'success' | 'error'

interface GoogleMapsNamespace {
  importLibrary(name: 'maps' | 'marker'): Promise<Record<string, unknown>>
}

const status = ref<GoogleMapsStatus>('idle')
const error = ref<string | null>(null)
let loadPromise: Promise<GoogleMapsLibraries> | null = null

function mapsNamespace(): GoogleMapsNamespace | null {
  const candidate = (window as Window & {
    google?: { maps?: GoogleMapsNamespace }
  }).google?.maps
  return candidate?.importLibrary ? candidate : null
}

function injectOfficialScript(apiKey: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>('script[data-xeroflow-google-maps]')
  const script = existing ?? document.createElement('script')

  if (!existing) {
    const url = new URL('https://maps.googleapis.com/maps/api/js')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('loading', 'async')
    url.searchParams.set('v', 'weekly')
    script.src = url.toString()
    script.async = true
    script.dataset.xeroflowGoogleMaps = 'true'
  }

  return new Promise((resolve, reject) => {
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Google Maps could not be loaded.')), { once: true })
    if (!existing) document.head.appendChild(script)
  })
}

async function loadLibraries(): Promise<GoogleMapsLibraries> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Google Maps is only available in the browser.')
  }

  const config = useRuntimeConfig() as {
    public?: { googleMapsBrowserApiKey?: unknown }
  }
  const apiKey = typeof config.public?.googleMapsBrowserApiKey === 'string'
    ? config.public.googleMapsBrowserApiKey.trim()
    : ''
  if (!apiKey) throw new Error('Google Maps browser API key is not configured.')

  if (!mapsNamespace()) await injectOfficialScript(apiKey)
  const maps = mapsNamespace()
  if (!maps) throw new Error('Google Maps loaded without its library importer.')

  const [mapsLibrary, markerLibrary] = await Promise.all([
    maps.importLibrary('maps'),
    maps.importLibrary('marker')
  ])
  const Map = mapsLibrary.Map
  const Circle = mapsLibrary.Circle
  const AdvancedMarkerElement = markerLibrary.AdvancedMarkerElement
  if (typeof Map !== 'function' || typeof Circle !== 'function'
    || typeof AdvancedMarkerElement !== 'function') {
    throw new Error('Google Maps required libraries are unavailable.')
  }

  return { Map, Circle, AdvancedMarkerElement } as GoogleMapsLibraries
}

export function useGoogleMaps() {
  function load(): Promise<GoogleMapsLibraries> {
    if (loadPromise) return loadPromise
    status.value = 'pending'
    error.value = null
    loadPromise = loadLibraries().then((libraries) => {
      status.value = 'success'
      return libraries
    }).catch((cause: unknown) => {
      const message = cause instanceof Error ? cause.message : 'Google Maps could not be loaded.'
      status.value = 'error'
      error.value = message
      throw cause
    })
    return loadPromise
  }

  return {
    load,
    status: readonly(status),
    error: readonly(error)
  }
}
