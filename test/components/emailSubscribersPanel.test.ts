import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SubscribersPanel from '~~/app/components/email/SubscribersPanel.vue'

const refreshMock = vi.fn()

const subscriberRows = [
  {
    id: 'sub-1',
    email: 'soft@example.com',
    name: 'Soft Bounce',
    status: 'enabled',
    created_at: '2026-06-01T00:00:00.000Z',
    soft_bounce_count: 2,
    last_soft_bounce_at: '2026-06-05T00:00:00.000Z',
    suppression_reason: null,
    suppressed_at: null
  },
  {
    id: 'sub-2',
    email: 'blocked@example.com',
    name: 'Suppressed',
    status: 'enabled',
    created_at: '2026-06-01T00:00:00.000Z',
    soft_bounce_count: 0,
    last_soft_bounce_at: null,
    suppression_reason: 'hard_bounce',
    suppressed_at: '2026-06-05T00:00:00.000Z'
  }
]

Object.assign(globalThis, {
  ref,
  computed,
  useFetch: async (url: string) => ({
    data: ref(url === '/api/email/lists'
      ? { items: [] }
      : { items: subscriberRows, total: subscriberRows.length }),
    refresh: refreshMock,
    pending: ref(false)
  })
})

const passthrough = (name: string) => ({ name, template: '<div><slot /></div>' })
const stubs: Record<string, unknown> = {
  UInput: { name: 'UInput', props: ['modelValue', 'placeholder'], template: '<input :placeholder="placeholder">' },
  USelectMenu: { name: 'USelectMenu', template: '<select />' },
  UButton: { name: 'UButton', props: ['label', 'icon'], template: '<button :data-icon="icon"><slot />{{ label }}</button>' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span><slot />{{ label }}</span>' },
  EmailSubscriberFormModal: passthrough('EmailSubscriberFormModal'),
  EmailImportModal: passthrough('EmailImportModal'),
  EmailSubscriberDetailDrawer: passthrough('EmailSubscriberDetailDrawer')
}

async function renderPanel() {
  const app = createSSRApp({ render: () => h(SubscribersPanel) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp as never))
  return renderToString(app)
}

describe('EmailSubscribersPanel', () => {
  beforeEach(() => {
    refreshMock.mockReset()
  })

  it('surfaces bounce counts and suppression reasons in subscriber rows', async () => {
    const html = await renderPanel()

    expect(html).toContain('soft@example.com')
    expect(html).toContain('2 soft bounces')
    expect(html).toContain('blocked@example.com')
    expect(html).toContain('hard bounce')
  })
})
