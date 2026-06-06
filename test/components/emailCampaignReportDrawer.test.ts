// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import CampaignReportDrawer from '~~/app/components/email/CampaignReportDrawer.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()

Object.assign(globalThis, {
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
    campaignId: 'camp-1',
    campaignName: 'June Offers',
    open: true
  }
  props['onUpdate:open'] = () => {}
  const app = createApp({
    render: () => h(CampaignReportDrawer, props)
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  return { app, host }
}

describe('EmailCampaignReportDrawer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/events')) {
        return Promise.resolve({
          summary: {
            sent: 12,
            delivered: 10,
            opened: 7,
            opened_label: 'directional',
            clicked: 5,
            human_clicked: 3,
            delivery_delayed: 2,
            bounced: 1,
            complained: 0,
            unsubscribed: 1
          },
          events: [
            {
              id: 'event-1',
              event_type: 'opened',
              subscriber_email: 'person@example.com',
              metric_note: 'Open metrics are directional',
              occurred_at: '2026-06-05T00:00:00.000Z'
            },
            {
              id: 'event-2',
              event_type: 'clicked',
              subscriber_email: 'scanner@example.com',
              suspected_scanner: true,
              url: 'https://dealer.example.com/offers',
              occurred_at: '2026-06-05T01:00:00.000Z'
            }
          ]
        })
      }
      return Promise.resolve({
        summary: {
          website_events: 6,
          sessions: 2,
          page_views: 4,
          conversions: 1,
          click_attributed_events: 3,
          leads: 1
        },
        sessions: [
          {
            session_id: 'session-1',
            anon_id: 'anon-1',
            events: 3,
            conversions: 1,
            email_click_ids: ['click-1'],
            last_seen_at: '2026-06-05T02:00:00.000Z'
          }
        ]
      })
    })
  })

  it('renders directional open notes, scanner labels, and email-attributed sessions', async () => {
    const { app, host } = mountDrawer()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/api/email/campaigns/camp-1/events')
    expect(fetchMock).toHaveBeenCalledWith('/api/email/campaigns/camp-1/attribution')
    expect(host.textContent).toContain('June Offers')
    expect(host.textContent).toContain('Human-clicked')
    expect(host.textContent).toContain('Delayed')
    expect(host.textContent).toContain('Open metrics are directional')
    expect(host.textContent).toContain('scanner')
    expect(host.textContent).toContain('Email-linked')
    expect(host.textContent).toContain('click-1')

    app.unmount()
  })
})
