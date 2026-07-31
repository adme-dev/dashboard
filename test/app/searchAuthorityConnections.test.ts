// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SiteReadinessCard from '~~/app/components/search-authority/SiteReadinessCard.vue'
import SearchConsoleConnectCard from '~~/app/components/search-authority/SearchConsoleConnectCard.vue'
import { searchAuthorityNavItems } from '~~/app/utils/searchAuthorityNavigation'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const SITE_ID = '22222222-2222-4222-8222-222222222222'
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333'

const toastAdd = vi.fn()

Object.assign(globalThis, {
  useToast: () => ({ add: toastAdd })
})

const stubs = {
  UCard: {
    template: '<section><header><slot name="header" /></header><slot /></section>'
  },
  UFormField: {
    props: ['label', 'help'],
    template: '<label><span>{{ label }}</span><slot /><small v-if="help">{{ help }}</small></label>'
  },
  UInput: {
    inheritAttrs: false,
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  USelectMenu: {
    inheritAttrs: false,
    props: ['modelValue', 'items', 'valueKey'],
    emits: ['update:modelValue'],
    template: `
      <select
        v-bind="$attrs"
        :value="modelValue ?? ''"
        @change="$emit('update:modelValue', $event.target.value || null)"
      >
        <option value="">Choose…</option>
        <option
          v-for="item in items"
          :key="item[valueKey || 'value']"
          :value="item[valueKey || 'value']"
        >
          {{ item.label }}
        </option>
      </select>
    `
  },
  UButton: {
    inheritAttrs: false,
    props: ['disabled', 'loading', 'label', 'type'],
    emits: ['click'],
    template: `
      <button
        v-bind="$attrs"
        :type="type || 'button'"
        :disabled="disabled || loading"
        @click="$emit('click')"
      >
        {{ label }}<slot />
      </button>
    `
  },
  UAlert: {
    props: ['title', 'description'],
    template: '<aside><strong>{{ title }}</strong><p>{{ description }}</p><slot /></aside>'
  },
  UBadge: {
    props: ['label'],
    template: '<span>{{ label }}<slot /></span>'
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />'
  },
  USkeleton: {
    template: '<span data-skeleton />'
  }
}

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function mount(component: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(component as never, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub as never))
  app.mount(host)
  return { app, host }
}

function updateControl(element: HTMLInputElement | HTMLSelectElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', {
    bubbles: true
  }))
}

describe('Search Authority onboarding workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('configures a client site through labelled, full-width Nuxt UI fields', async () => {
    const fetchMock = vi.fn(async () => ({
      site: {
        id: SITE_ID,
        clientId: CLIENT_ID,
        canonicalHostname: 'www.knoxgwmhaval.com.au',
        contentHostname: 'content.knoxgwmhaval.com.au',
        status: 'active'
      }
    }))
    Object.assign(globalThis, { $fetch: fetchMock })
    const configured: unknown[] = []
    const { app, host } = mount(SiteReadinessCard, {
      clients: [{ id: CLIENT_ID, name: 'Knox GWM Haval' }],
      sites: [],
      loading: false,
      onConfigured: (site: unknown) => configured.push(site)
    })

    try {
      expect(host.textContent).toContain('Client')
      expect(host.textContent).toContain('Canonical website hostname')
      expect(host.textContent).toContain('XeroFlow content hostname')
      expect(host.querySelectorAll('select.w-full, input.w-full')).toHaveLength(3)

      const select = host.querySelector<HTMLSelectElement>('[data-testid="search-authority-client"]')!
      const optionValues = [...select.options].slice(1).map(option => option.value)
      expect(optionValues).toEqual([CLIENT_ID])
      expect(optionValues.every(Boolean)).toBe(true)

      updateControl(select, CLIENT_ID)
      await nextTick()
      updateControl(
        host.querySelector<HTMLInputElement>('[data-testid="search-authority-canonical-hostname"]')!,
        'https://www.knoxgwmhaval.com.au/'
      )
      updateControl(
        host.querySelector<HTMLInputElement>('[data-testid="search-authority-content-hostname"]')!,
        'content.knoxgwmhaval.com.au'
      )
      await nextTick()
      expect(host.querySelector<HTMLButtonElement>(
        '[data-testid="configure-search-authority-site"]'
      )!.disabled).toBe(false)
      host.querySelector('form')!.dispatchEvent(new Event('submit', {
        bubbles: true,
        cancelable: true
      }))
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/agency/search-authority/sites', {
        method: 'POST',
        body: {
          clientId: CLIENT_ID,
          canonicalHostname: 'https://www.knoxgwmhaval.com.au/',
          contentHostname: 'content.knoxgwmhaval.com.au'
        }
      })
      expect(configured).toHaveLength(1)
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Site ready',
        color: 'success'
      }))
    } finally {
      app.unmount()
    }
  })

  it('shows provider health and maps one verified property without exposing credentials', async () => {
    const fetchMock = vi.fn(async (request: string, options?: { method?: string }) => {
      if (request.startsWith('/api/agency/search-authority/google/properties')) {
        return {
          connections: [{
            connectionId: CONNECTION_ID,
            email: 'search@adme.net.au',
            status: 'active',
            lastCheckedAt: '2026-07-31T01:00:00.000Z',
            lastSuccessAt: '2026-07-31T01:00:00.000Z',
            lastErrorCode: null,
            lastErrorMessage: null,
            properties: [
              {
                propertyUri: 'sc-domain:knoxgwmhaval.com.au',
                permissionLevel: 'siteOwner',
                propertyType: 'domain'
              },
              {
                propertyUri: 'https://www.knoxgwmhaval.com.au/',
                permissionLevel: 'siteUnverifiedUser',
                propertyType: 'url_prefix'
              }
            ]
          }],
          maps: []
        }
      }
      if (options?.method === 'POST') return { ok: true }
      throw new Error(`Unexpected request: ${request}`)
    })
    Object.assign(globalThis, { $fetch: fetchMock })
    const { app, host } = mount(SearchConsoleConnectCard, {
      sites: [{
        id: SITE_ID,
        clientId: CLIENT_ID,
        clientName: 'Knox GWM Haval',
        canonicalHostname: 'www.knoxgwmhaval.com.au',
        contentHostname: null,
        status: 'active'
      }]
    })

    try {
      await flushUi()
      expect(host.textContent).toContain('Connected')
      expect(host.textContent).toContain('search@adme.net.au')
      expect(host.textContent).toContain('Owner')
      expect(host.textContent).toContain('Unverified')
      expect(host.textContent).toContain('provisional')
      expect(host.textContent).toContain('Google Search Console')
      expect(host.textContent).not.toMatch(/access.?token|refresh.?token|credential profile/i)

      const propertySelect = host.querySelector<HTMLSelectElement>('[data-testid="search-console-property"]')!
      const mappableOptions = [...propertySelect.options].slice(1)
      expect(mappableOptions).toHaveLength(1)
      expect(mappableOptions[0]?.textContent).toContain('sc-domain:knoxgwmhaval.com.au')
      expect(mappableOptions[0]?.value).toBeTruthy()

      updateControl(propertySelect, mappableOptions[0]!.value)
      await nextTick()
      host.querySelector<HTMLButtonElement>('[data-testid="map-search-console-property"]')!.click()
      await flushUi()

      expect(fetchMock).toHaveBeenCalledWith('/api/agency/search-authority/google/map', {
        method: 'POST',
        body: {
          clientId: CLIENT_ID,
          connectionId: CONNECTION_ID,
          propertyUri: 'sc-domain:knoxgwmhaval.com.au',
          permissionLevel: 'siteOwner'
        }
      })
    } finally {
      app.unmount()
    }
  })

  it('refreshes discovered properties after the OAuth popup closes', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(async (request: string) => {
      if (request.startsWith('/api/agency/search-authority/google/properties')) {
        return { connections: [], maps: [] }
      }
      if (request.startsWith('/api/agency/search-authority/google/connect')) {
        return { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=signed' }
      }
      throw new Error(`Unexpected request: ${request}`)
    })
    Object.assign(globalThis, { $fetch: fetchMock })
    const openMock = vi.spyOn(window, 'open').mockReturnValue({ closed: true } as Window)
    const { app, host } = mount(SearchConsoleConnectCard, {
      sites: [{
        id: SITE_ID,
        clientId: CLIENT_ID,
        clientName: 'Knox GWM Haval',
        canonicalHostname: 'www.knoxgwmhaval.com.au',
        contentHostname: null,
        status: 'active'
      }]
    })

    try {
      await flushUi()
      host.querySelector<HTMLButtonElement>('[data-testid="connect-search-console"]')!.click()
      await flushUi()
      expect(openMock).toHaveBeenCalledWith(
        expect.stringContaining('accounts.google.com'),
        'search_console_oauth',
        expect.stringContaining('width=560')
      )

      await vi.advanceTimersByTimeAsync(900)
      await flushUi()
      expect(fetchMock.mock.calls.filter(([request]) => (
        String(request).startsWith('/api/agency/search-authority/google/properties')
      ))).toHaveLength(2)
    } finally {
      app.unmount()
      openMock.mockRestore()
      vi.useRealTimers()
    }
  })

  it('only contributes agency navigation when presentation gating is enabled', () => {
    const close = vi.fn()
    expect(searchAuthorityNavItems(false, close)).toEqual([])
    expect(searchAuthorityNavItems(true, close)).toEqual([expect.objectContaining({
      label: 'Search Authority',
      to: '/agency/search-authority'
    })])
  })
})
