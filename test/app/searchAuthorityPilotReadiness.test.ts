// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import PilotReadinessCard from '~~/app/components/search-authority/PilotReadinessCard.vue'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

const stubs = {
  UCard: {
    template: '<section><header><slot name="header" /></header><slot /></section>'
  },
  UBadge: {
    props: ['label'],
    template: '<span>{{ label }}<slot /></span>'
  },
  UAlert: {
    props: ['title', 'description'],
    template: '<aside><strong>{{ title }}</strong><p>{{ description }}</p><slot /></aside>'
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

function mount(props: Record<string, unknown>) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(PilotReadinessCard, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host }
}

describe('Search Authority pilot readiness card', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows truthful core blockers and keeps provider details safe', async () => {
    const fetchMock = vi.fn(async () => ({
      clientId: CLIENT_ID,
      coreReady: false,
      gates: {
        site: { state: 'ready', reasonCode: null, action: null, evidenceAt: null },
        searchConsole: {
          state: 'not_started',
          reasonCode: 'search_console_not_connected',
          action: 'Connect an authorised read-only Search Console identity.',
          evidenceAt: null
        },
        ownedCollection: {
          state: 'blocked',
          reasonCode: 'browser_rendering_failed',
          action: 'Restore Browser Rendering readiness before retrying the crawl.',
          evidenceAt: '2026-08-02T08:07:30.000Z'
        },
        competitorCollection: {
          state: 'not_started',
          reasonCode: 'competitor_crawl_not_run',
          action: 'Run the approved competitor domain manually.',
          evidenceAt: null
        },
        contentPublisher: {
          state: 'not_started',
          reasonCode: 'content_hostname_not_configured',
          action: 'Configure the approved XeroFlow content hostname.',
          evidenceAt: null
        },
        googleBusiness: {
          state: 'unavailable',
          reasonCode: 'google_business_not_connected',
          action: 'Confirm Google production access before connecting the Knox location.',
          evidenceAt: null
        }
      }
    }))
    Object.assign(globalThis, { $fetch: fetchMock })
    const { app, host } = mount({ clientId: CLIENT_ID })

    try {
      await flushUi()
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/agency/search-authority/pilot-readiness',
        { query: { clientId: CLIENT_ID } }
      )
      expect(host.textContent).toContain('Pilot completion')
      expect(host.textContent).toContain('Core pilot blocked')
      expect(host.textContent).toContain('Search Console')
      expect(host.textContent).toContain('Owned-site collection')
      expect(host.textContent).toContain('Restore Browser Rendering readiness')
      expect(host.textContent).toContain('GBP (optional)')
      expect(host.textContent).toContain('Unavailable')
      expect(host.textContent).not.toMatch(/token|credential|access_token|raw error/i)
    } finally {
      app.unmount()
    }
  })

  it('does not request readiness until a client is selected', async () => {
    const fetchMock = vi.fn()
    Object.assign(globalThis, { $fetch: fetchMock })
    const { app, host } = mount({ clientId: null })

    try {
      await flushUi()
      expect(fetchMock).not.toHaveBeenCalled()
      expect(host.textContent).toContain('Choose a client to view pilot readiness')
    } finally {
      app.unmount()
    }
  })
})
