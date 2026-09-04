// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

const testGlobal = globalThis as typeof globalThis & {
  definePageMeta: (meta: unknown) => void
  useRequestFetch: () => (request: string) => Promise<unknown>
}
testGlobal.definePageMeta = vi.fn()

const stubs = {
  UDashboardPanel: { template: '<main><slot name="header" /><slot name="body" /></main>' },
  UDashboardNavbar: {
    props: ['title'],
    template: '<header><h1>{{ title }}</h1><slot name="right" /></header>'
  },
  UBadge: {
    props: ['color', 'variant'],
    template: '<span data-badge><slot /></span>'
  },
  UButton: {
    props: ['label', 'loading'],
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')">{{ label }}<slot /></button>'
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />'
  }
}

async function flushUi() {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

describe('portal Measurement page', () => {
  it('renders redacted delivery and outcome health in plain client language', async () => {
    const fetchMock = vi.fn(async () => ({
      status: 'degraded',
      statusMessage: 'Measurement needs agency attention; your lead intake and CRM remain available.',
      deliveryState: 'dormant',
      authority: {
        source: 'Zero CRM',
        lastSyncAt: '2026-07-17T01:10:00.000Z',
        acceptedOutcomeCount: 8,
        rejectedOutcomeCount: 2
      },
      signals: {
        browser: { status: 'detected', owners: ['gtm'], lastEvidenceAt: '2026-07-17T02:00:00.000Z' },
        server: { status: 'configured', owners: ['external'], lastEvidenceAt: null },
        crm: { status: 'ready', owners: ['zero'], lastEvidenceAt: '2026-07-17T02:00:00.000Z' }
      },
      eventIdentity: [{
        canonicalEventName: 'lead_qualified',
        mode: 'server_only',
        label: 'Server-only lifecycle event'
      }],
      destinations: [
        { platform: 'meta', label: 'Meta', status: 'ready', deliveryState: 'dormant', lastSuccessAt: '2026-07-17T01:30:00.000Z' },
        { platform: 'google_data_manager', label: 'Google Data Manager', status: 'configured', deliveryState: 'dormant', lastSuccessAt: null },
        { platform: 'tiktok', label: 'TikTok', status: 'ready', deliveryState: 'dormant', lastSuccessAt: '2026-09-04T01:30:00.000Z' }
      ],
      delivery: {
        acceptedCount: 5,
        deliveredCount: 4,
        rejectedCount: 1,
        pendingCount: 0,
        lastAcceptedAt: '2026-07-17T01:15:00.000Z',
        lastDeliveredAt: '2026-07-17T01:20:00.000Z',
        lastRejectedAt: '2026-07-17T01:25:00.000Z'
      },
      funnel: { visits: 120, confirmedLeads: 9 },
      freshness: {
        lastCollectionAt: '2026-09-04T01:25:00.000Z',
        lastDeliveryAt: '2026-09-04T01:30:00.000Z'
      },
      lastValidatedAt: '2026-07-17T02:00:00.000Z',
      nextSteps: ['One or more provider destinations still needs validation.', 'Live-delivery approval is still pending.']
    }))
    testGlobal.useRequestFetch = () => fetchMock
    const PortalMeasurementPage = (await import('~~/app/pages/portal/measurement.vue')).default

    const host = document.createElement('div')
    const app = createApp({ render: () => h(PortalMeasurementPage) })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    await flushUi()

    try {
      expect(fetchMock).toHaveBeenCalledWith('/api/portal/measurement')
      expect(host.textContent).toContain('Measurement health')
      expect(host.textContent).toContain('Needs attention')
      expect(host.textContent).toContain('your lead intake and CRM remain available')
      expect(host.textContent).toContain('Browser tracking')
      expect(host.textContent).toContain('Found')
      expect(host.textContent).toContain('Google Tag Manager')
      expect(host.textContent).toContain('Server-side tracking')
      expect(host.textContent).toContain('Website visits')
      expect(host.textContent).toContain('120')
      expect(host.textContent).toContain('Confirmed leads')
      expect(host.textContent).toContain('9')
      expect(host.textContent).toContain('Last signal collected')
      expect(host.textContent).toContain('Last provider delivery')
      expect(host.textContent).toContain('Set up')
      expect(host.textContent).toContain('Externally managed')
      expect(host.textContent).toContain('CRM outcomes')
      expect(host.textContent).toContain('Healthy')
      expect(host.textContent).toContain('Managed by Zero')
      expect(host.textContent).toContain('Event delivery identity')
      expect(host.textContent).toContain('Qualified Lead')
      expect(host.textContent).toContain('Server-only lifecycle event')
      expect(host.textContent).toContain('Zero CRM')
      expect(host.textContent).toContain('8 accepted')
      expect(host.textContent).toContain('2 rejected')
      expect(host.textContent).toContain('Meta')
      expect(host.textContent).toContain('Google Data Manager')
      expect(host.textContent).toContain('TikTok')
      expect(host.textContent).toContain('Dormant')
      expect(host.textContent).toContain('One or more provider destinations still needs validation.')
      expect(host.textContent).not.toContain('Configure destination')
      expect(host.textContent).not.toContain('Activate')
      expect(host.textContent).not.toContain('573284833843027')
      expect(host.textContent).not.toContain('credential')
      expect(host.textContent).not.toContain('capabilities')
      expect(host.textContent).not.toContain('active mappings')
      expect(host.textContent).not.toContain('backend_only')
      expect(host.innerHTML).not.toMatch(/ttclid|ttp|credentialRef|accessToken/i)
    } finally {
      app.unmount()
    }
  })

  it('keeps Measurement discoverable in the portal navigation', () => {
    const layout = readFileSync('app/layouts/portal.vue', 'utf8')
    expect(layout).toContain('{ label: \'Measurement\', icon: \'i-lucide-activity\', to: \'/portal/measurement\', onSelect: close }')
  })
})
