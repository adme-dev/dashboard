// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, watch } from 'vue'
import SubscriberDetailDrawer from '~~/app/components/email/SubscriberDetailDrawer.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()

Object.assign(globalThis, {
  ref,
  watch,
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAddMock })
})

const stubs: Record<string, unknown> = {
  UBadge: { name: 'UBadge', props: ['label'], template: '<span><slot />{{ label }}</span>' },
  UButton: { name: 'UButton', props: ['label', 'icon'], template: '<button :data-icon="icon"><slot />{{ label }}</button>' },
  USkeleton: { name: 'USkeleton', template: '<div class="skeleton" />' },
  USlideover: {
    name: 'USlideover',
    props: ['open'],
    template: '<div v-if="open"><slot name="content" /></div>'
  }
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountDrawer() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const props: Record<string, unknown> = {
    subscriberId: 'sub-1',
    open: true
  }
  props['onUpdate:open'] = () => {}
  const app = createApp({
    render: () => h(SubscriberDetailDrawer, props)
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  return { app, host }
}

describe('EmailSubscriberDetailDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({
      subscriber: {
        id: 'sub-1',
        email: 'person@example.com',
        name: 'Person',
        status: 'enabled',
        soft_bounce_count: 2,
        last_soft_bounce_at: '2026-06-05T00:00:00.000Z',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-05T00:00:00.000Z'
      },
      current_suppression: {
        email: 'person@example.com',
        reason: 'manual',
        updated_at: '2026-06-05T01:00:00.000Z'
      },
      lists: [
        { list_id: 'list-1', list_name: 'Retail Offers', status: 'confirmed', source: 'import' }
      ],
      consent_events: [
        { id: 'consent-1', event_type: 'imported', source: 'csv', occurred_at: '2026-06-01T00:00:00.000Z' }
      ],
      suppression_events: [
        {
          id: 'supp-1',
          action: 'removed',
          reason: 'manual',
          source: 'manual',
          occurred_at: '2026-06-05T02:00:00.000Z',
          metadata: { note: 'Support confirmed the address was re-enabled' }
        }
      ],
      campaign_events: [
        { id: 'event-1', event_type: 'clicked', campaign_name: 'June Offers', occurred_at: '2026-06-05T03:00:00.000Z' }
      ]
    })
  })

  it('renders subscriber bounce, consent, suppression, and campaign history details', async () => {
    const { app, host } = mountDrawer()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/api/email/subscribers/sub-1/history')
    expect(host.textContent).toContain('person@example.com')
    expect(host.textContent).toContain('2')
    expect(host.textContent).toContain('Retail Offers')
    expect(host.textContent).toContain('imported')
    expect(host.textContent).toContain('removed manual')
    expect(host.textContent).toContain('Support confirmed the address was re-enabled')
    expect(host.textContent).toContain('June Offers')

    app.unmount()
  })
})
