// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, ref, watch } from 'vue'

vi.mock('~~/app/components/site-intelligence/NearbyMarketMap.client.vue', () => ({
  default: {
    emits: ['select'],
    template: '<button data-testid="map-marker" type="button" @click="$emit(\'select\', \'dealer/place ?#\')">Map candidate</button>'
  }
}))

const candidate = {
  placeId: 'dealer/place ?#',
  displayName: 'Reserved Place Motors',
  formattedAddress: '2 Dealer Road, Melbourne VIC',
  location: { latitude: -37.82, longitude: 144.97 },
  distanceKm: 4.2,
  category: 'franchise_new' as const,
  portalState: 'suggested' as const
}

const market = {
  marketLocation: {
    id: '22222222-2222-4222-8222-222222222222',
    label: 'Primary showroom',
    addressText: '1 Motor Way, Melbourne VIC',
    location: { latitude: -37.81, longitude: 144.96 }
  },
  radiusKm: 25 as const,
  candidates: [candidate],
  limited: false,
  notice: 'Up to 20 results'
}

const UButton = {
  inheritAttrs: false,
  props: ['label', 'disabled'],
  emits: ['click'],
  template: '<button v-bind="$attrs" type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>'
}
const USelectMenu = {
  props: ['modelValue', 'items'],
  emits: ['update:modelValue'],
  template: '<select data-testid="monitoring-status" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
}
const passthrough = { template: '<div><slot /></div>' }
const modalPassthrough = { template: '<div><slot /><slot name="content" /></div>' }

async function flushUi() {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function stubVueAutoImports() {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
  vi.stubGlobal('onMounted', onMounted)
  vi.stubGlobal('nextTick', nextTick)
}

async function mountPanel(fetchMock: ReturnType<typeof vi.fn>) {
  stubVueAutoImports()
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('useRuntimeConfig', () => ({ public: {} }))
  HTMLElement.prototype.scrollIntoView = vi.fn()
  const Panel = (await import('~~/app/components/portal/NearbyMarketPanel.vue')).default
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(Panel, { canNominateCompetitors: true }) })
  for (const name of ['UCard', 'UFormField']) app.component(name, passthrough)
  app.component('UButton', UButton)
  app.component('USelectMenu', USelectMenu)
  app.component('UCheckbox', { template: '<span><slot /></span>' })
  app.component('UBadge', { props: ['label'], template: '<span>{{ label }}</span>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<aside><strong>{{ title }}</strong><span>{{ description }}</span><slot name="actions" /></aside>' })
  app.component('USkeleton', { template: '<span />' })
  app.component('PortalCompetitorNominationModal', { template: '<span />' })
  app.mount(host)
  await flushUi()
  return { app, host }
}

afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('portal nearby market behavior', () => {
  it('sends explicit not-selected filtering to the client-scoped discovery API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(market)
    const { app, host } = await mountPanel(fetchMock)
    try {
      const select = host.querySelector<HTMLSelectElement>('[data-testid="monitoring-status"]')!
      select.value = 'not_selected'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await flushUi()

      expect(fetchMock).toHaveBeenLastCalledWith(
        '/api/client-portal/site-intelligence/nearby-market',
        expect.objectContaining({ query: expect.objectContaining({ monitoringStatus: 'not_selected' }) })
      )
    } finally {
      app.unmount()
    }
  })

  it('clears stale candidates when a changed radius fails and cannot nominate with the old radius', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(market)
      .mockRejectedValueOnce(Object.assign(new Error('failed'), { statusCode: 503 }))
    const { app, host } = await mountPanel(fetchMock)
    try {
      expect(host.textContent).toContain('Reserved Place Motors')
      Array.from(host.querySelectorAll('button')).find(button => button.textContent === '50 km')!.click()
      await flushUi()

      expect(host.textContent).not.toContain('Reserved Place Motors')
      expect(host.textContent).not.toContain('Nominate competitor')
      expect(host.textContent).toContain('Nearby market unavailable')
    } finally {
      app.unmount()
    }
  })

  it('focuses the equivalent ranked row after marker-driven selection', async () => {
    const { app, host } = await mountPanel(vi.fn().mockResolvedValue(market))
    try {
      host.querySelector<HTMLButtonElement>('[data-testid="map-marker"]')!.click()
      await flushUi()
      expect(document.activeElement).toBe(host.querySelector('[data-select-candidate]'))
    } finally {
      app.unmount()
    }
  })

  it('preserves filter focus when results resolve after an earlier marker selection', async () => {
    let resolveReload!: (value: typeof market) => void
    const reload = new Promise<typeof market>((resolve) => {
      resolveReload = resolve
    })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(market)
      .mockReturnValueOnce(reload)
    const { app, host } = await mountPanel(fetchMock)
    try {
      host.querySelector<HTMLButtonElement>('[data-testid="map-marker"]')!.click()
      await flushUi()
      host.querySelector<HTMLButtonElement>('[data-testid="map-marker"]')!.click()
      await flushUi()

      const filter = host.querySelector<HTMLSelectElement>('[data-testid="monitoring-status"]')!
      filter.focus()
      filter.value = 'not_selected'
      filter.dispatchEvent(new Event('change', { bubbles: true }))
      await flushUi()
      expect(document.activeElement).toBe(filter)

      resolveReload({ ...market, candidates: [{ ...candidate, portalState: 'not_selected' }] })
      await flushUi()

      expect(document.activeElement).toBe(filter)
    } finally {
      app.unmount()
    }
  })
})

describe('portal competitor nomination behavior', () => {
  it('encodes reserved Place ID characters and submits the displayed radius', async () => {
    stubVueAutoImports()
    const fetchMock = vi.fn().mockResolvedValue({ candidate: { placeId: candidate.placeId, portalState: 'under_review' } })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    const Modal = (await import('~~/app/components/portal/CompetitorNominationModal.vue')).default
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(Modal, {
        open: true,
        candidate,
        marketLocationId: market.marketLocation.id,
        radiusKm: market.radiusKm
      })
    })
    app.component('UModal', modalPassthrough)
    app.component('UAlert', passthrough)
    app.component('UFormField', passthrough)
    app.component('UTextarea', {
      props: ['modelValue'],
      emits: ['update:modelValue'],
      template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
    })
    app.component('UButton', UButton)
    app.mount(host)
    try {
      const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
      textarea.value = 'Same local buyers'
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      await flushUi()
      Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Send nomination')!.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/client-portal/site-intelligence/candidates/${encodeURIComponent(candidate.placeId)}/nominate`,
        expect.objectContaining({ body: expect.objectContaining({ radiusKm: 25 }) })
      )
    } finally {
      app.unmount()
    }
  })
})
