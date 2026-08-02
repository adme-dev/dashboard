// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import type { NearbyMarketCandidate } from '~~/app/types/site-intelligence'

const candidates: NearbyMarketCandidate[] = [{
  placeId: 'saved-place',
  displayName: 'Saved Toyota',
  formattedAddress: '2 Dealer Road, Melbourne VIC',
  location: { latitude: -37.82, longitude: 144.97 },
  distanceKm: 4.2,
  category: 'franchise_new',
  state: 'saved',
  source: 'agency',
  approvedDomainId: null,
  portalState: 'suggested'
}, {
  placeId: 'monitored-place',
  displayName: 'Monitored Mazda',
  formattedAddress: '3 Dealer Road, Melbourne VIC',
  location: { latitude: -37.83, longitude: 144.98 },
  distanceKm: 5.3,
  category: 'franchise_new',
  state: 'approved',
  source: 'agency',
  approvedDomainId: 'domain-1',
  portalState: 'monitored'
}]

const mapInstances: FakeMap[] = []
const circleInstances: FakeCircle[] = []
const markerInstances: FakeMarker[] = []

class FakeMap {
  panTo = vi.fn()

  constructor(public element: Element, public options: Record<string, unknown>) {
    mapInstances.push(this)
  }
}

class FakeCircle {
  map: unknown

  constructor(public options: Record<string, unknown>) {
    this.map = options.map
    circleInstances.push(this)
  }

  setCenter = vi.fn()
  setRadius = vi.fn()
}

class FakeMarker {
  map: unknown
  position: unknown
  listeners = new Map<string, () => void>()

  constructor(public options: {
    map?: unknown
    title: string
    content: HTMLElement
    gmpClickable?: boolean
    [key: string]: unknown
  }) {
    this.map = options.map
    this.position = options.position
    markerInstances.push(this)
  }

  addListener(name: string, listener: () => void) {
    this.listeners.set(name, listener)
    return { remove: () => this.listeners.delete(name) }
  }

  trigger(name: string) {
    this.listeners.get(name)?.()
  }
}

const UAlert = {
  inheritAttrs: false,
  props: ['title', 'description'],
  template: '<aside v-bind="$attrs"><strong>{{ title }}</strong><span>{{ description }}</span><slot name="actions" /></aside>'
}

const UButton = {
  inheritAttrs: false,
  props: ['label'],
  emits: ['click'],
  template: '<button v-bind="$attrs" type="button" @click="$emit(\'click\')">{{ label }}<slot /></button>'
}

async function flushUi() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

async function mountMap(options: { importFailures?: number, items?: NearbyMarketCandidate[] } = {}) {
  vi.stubGlobal('useRuntimeConfig', () => ({
    public: {
      googleMapsBrowserApiKey: 'browser-key',
      googleMapsMapId: 'market-map-id'
    }
  }))
  let importFailures = options.importFailures ?? 0
  const importLibrary = vi.fn(async (library: string) => {
    if (importFailures > 0) {
      importFailures -= 1
      throw new Error('Maps unavailable')
    }
    return library === 'maps'
      ? { Map: FakeMap, Circle: FakeCircle }
      : { AdvancedMarkerElement: FakeMarker }
  })
  ;(window as Window & { google?: unknown }).google = { maps: { importLibrary } }
  const NearbyMarketMap = (await import('~~/app/components/site-intelligence/NearbyMarketMap.client.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const center = ref({ latitude: -37.81, longitude: 144.96 })
  const selected = ref<string | null>('saved-place')
  const onSelect = vi.fn((placeId: string) => {
    selected.value = placeId
  })
  const app = createApp({
    render: () => h(NearbyMarketMap, {
      center: center.value,
      radiusKm: 25,
      candidates: options.items ?? candidates,
      selectedPlaceId: selected.value,
      onSelect
    })
  })
  app.component('UAlert', UAlert)
  app.component('UButton', UButton)
  app.mount(host)
  await flushUi()
  return { app, host, center, selected, onSelect, importLibrary }
}

afterEach(() => {
  document.body.replaceChildren()
  document.head.replaceChildren()
  mapInstances.length = 0
  circleInstances.length = 0
  markerInstances.length = 0
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
  delete (window as Window & { google?: unknown }).google
})

describe('NearbyMarketMap', () => {
  it('uses the configured map ID, radius circle, labelled advanced markers, and controlled selection', async () => {
    const { app, selected, onSelect } = await mountMap()
    try {
      expect(mapInstances[0]?.options).toMatchObject({ mapId: 'market-map-id' })
      expect(circleInstances[0]?.options).toMatchObject({ radius: 25_000 })
      expect(markerInstances).toHaveLength(3)
      const saved = markerInstances.find(marker => marker.options.title.includes('Saved Toyota'))!
      const monitored = markerInstances.find(marker => marker.options.title.includes('Monitored Mazda'))!
      expect(saved.options.gmpClickable).toBe(true)
      expect(saved.options.title).toMatch(/Saved Toyota.*Saved/i)
      expect(monitored.options.title).toMatch(/Monitored Mazda.*Monitored/i)

      monitored.trigger('click')
      await flushUi()

      expect(onSelect).toHaveBeenCalledWith('monitored-place')
      expect(selected.value).toBe('monitored-place')
      expect((monitored.options.content as HTMLElement).dataset.selected).toBe('true')
      expect(mapInstances[0]?.panTo).toHaveBeenCalledWith({ lat: -37.83, lng: 144.98 })
    } finally {
      app.unmount()
    }
  })

  it('announces provider failure, preserves the ranked list, and retries the map in place', async () => {
    const { app, host } = await mountMap({ importFailures: 1 })
    try {
      expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/map unavailable/i)
      expect(host.textContent).toMatch(/ranked list remains available/i)
      expect(host.querySelector('[data-nearby-market-ranked-list-required="true"]')).not.toBeNull()
      host.querySelector<HTMLButtonElement>('[data-testid="nearby-market-map-retry"]')!.click()
      await flushUi()
      expect(host.querySelector('[role="alert"]')).toBeNull()
      expect(mapInstances).toHaveLength(1)
    } finally {
      app.unmount()
    }
  })

  it('moves the client marker when the reactive center changes', async () => {
    const { app, center } = await mountMap()
    try {
      const client = markerInstances.find(marker => marker.options.title === 'Confirmed client trading location')!
      center.value = { latitude: -37.9, longitude: 145.1 }
      await flushUi()
      expect(client.position).toEqual({ lat: -37.9, lng: 145.1 })
    } finally {
      app.unmount()
    }
  })

  it('provides meaningful loading and empty states in a height-bounded map region', async () => {
    const { app, host } = await mountMap({ items: [] })
    try {
      expect(host.querySelector('[role="status"]')?.textContent).toMatch(/no discovery candidates/i)
      const region = host.querySelector<HTMLElement>('[aria-label="Nearby automotive market map"]')
      expect(region).not.toBeNull()
      expect(region?.className).toMatch(/h-\d+/)
      expect(region?.getAttribute('aria-describedby')).toBe('nearby-market-map-list-alternative')
      expect(host.querySelector('#nearby-market-map-list-alternative')?.textContent).toMatch(/ranked list/i)
    } finally {
      app.unmount()
    }
  })
})
