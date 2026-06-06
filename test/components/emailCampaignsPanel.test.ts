import { describe, expect, it } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CampaignsPanel from '~~/app/components/email/CampaignsPanel.vue'

const campaignRows = [
  {
    id: 'camp-1',
    name: 'Blocked launch',
    subject: 'June offer',
    status: 'draft',
    scheduled_at: null,
    to_send: 25,
    sent: 0,
    updated_at: '2026-06-05T00:00:00.000Z',
    preflight_result: {
      ok: false,
      blocked: true,
      checkedAt: '2026-06-05T00:00:00.000Z',
      checks: [
        { code: 'sender', label: 'Sender', status: 'blocked', message: 'Missing sender email' }
      ]
    },
    recipient_snapshot: {
      toSend: 25,
      generatedAt: '2026-06-05T00:00:00.000Z'
    }
  },
  {
    id: 'camp-2',
    name: 'Booked launch',
    subject: 'Booked offer',
    status: 'scheduled',
    scheduled_at: '2026-06-06T02:30:00.000Z',
    to_send: 40,
    sent: 0,
    updated_at: '2026-06-05T00:00:00.000Z',
    preflight_result: {
      ok: true,
      blocked: false,
      checkedAt: '2026-06-05T00:00:00.000Z',
      checks: []
    },
    recipient_snapshot: {
      toSend: 40,
      generatedAt: '2026-06-05T00:00:00.000Z'
    }
  }
]

Object.assign(globalThis, {
  ref,
  computed,
  useToast: () => ({ add: () => {} }),
  useFetch: async (url: string) => ({
    data: ref(url === '/api/email/campaigns'
      ? { campaigns: campaignRows }
      : url === '/api/email/campaigns/config'
        ? { sending_enabled: true }
        : { items: [] }),
    refresh: () => {},
    pending: ref(false)
  })
})

const passthrough = (name: string) => ({ name, template: '<div><slot /></div>' })
const stubs: Record<string, unknown> = {
  UAlert: { name: 'UAlert', props: ['title', 'description'], template: '<div>{{ title }} {{ description }}<slot /></div>' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span><slot />{{ label }}</span>' },
  UButton: {
    name: 'UButton',
    props: ['label', 'icon', 'disabled'],
    template: '<button :data-icon="icon" :disabled="disabled"><slot />{{ label }}</button>'
  },
  UFormField: { name: 'UFormField', props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UInput: { name: 'UInput', props: ['modelValue'], template: '<input />' },
  UModal: passthrough('UModal'),
  USelectMenu: { name: 'USelectMenu', template: '<select />' },
  UTooltip: { name: 'UTooltip', props: ['text'], template: '<div>{{ text }}<slot /></div>' },
  EmailCampaignPreflightPanel: passthrough('EmailCampaignPreflightPanel'),
  EmailCampaignReportDrawer: passthrough('EmailCampaignReportDrawer'),
  EmailSegmentBuilder: passthrough('EmailSegmentBuilder')
}

async function renderPanel() {
  const app = createSSRApp({ render: () => h(CampaignsPanel) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp as never))
  return renderToString(app)
}

describe('EmailCampaignsPanel', () => {
  it('disables the send action when the stored preflight is blocked', async () => {
    const html = await renderPanel()

    expect(html).toContain('Blocked launch')
    expect(html).toContain('Resolve blocked preflight checks')
    expect(html).toMatch(/<button[^>]*data-icon="i-lucide-send"[^>]*disabled/)
  })

  it('shows the booked send time for scheduled campaigns', async () => {
    const html = await renderPanel()

    expect(html).toContain('Booked launch')
    expect(html).toContain('Scheduled')
    expect(html).toContain('Jun')
  })
})
