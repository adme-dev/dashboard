// @vitest-environment happy-dom
// Exact-review UI: a reviewer must see WHICH account each reviewed destination publishes to and HOW
// (mode, collaborators, delivered copy), not just a platform badge and an internal id.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, watch } from 'vue'
import type { SocialApprovalPost } from '~/types'

const approvals = vi.hoisted(() => ({ rows: [] as unknown[] }))

vi.mock('~/composables/useSocialPublishing', () => ({
  useSocialPublishing: () => ({
    getApprovals: async () => approvals.rows,
    approve: vi.fn(async () => ({})),
    reject: vi.fn(async () => ({}))
  })
}))
vi.mock('~/composables/useSocialPublishingClient', () => ({
  useSocialPublishingClient: () => ({ clientId: ref('0a000000-0000-4000-8000-00000000000a') })
}))

Object.assign(globalThis, { computed, reactive, ref, watch, definePageMeta: vi.fn(), useToast: () => ({ add: vi.fn() }) })

const stubs = {
  SocialPublishingShell: { template: '<main><slot name="actions" /><slot /></main>' },
  UButton: { props: ['disabled', 'loading', 'to'], emits: ['click'], template: '<button v-bind="$attrs" :disabled="disabled" data-ui="UButton" @click="$emit(\'click\', $event)"><slot /></button>' },
  UBadge: { template: '<span class="badge"><slot /></span>' },
  UIcon: { template: '<i />' },
  UAlert: { props: ['title', 'description'], template: '<aside role="alert">{{ title }} {{ description }}</aside>' },
  UModal: { props: ['open'], template: '<section v-if="open"><slot name="content" /></section>' },
  UFormField: { props: ['label'], template: '<label>{{ label }}<slot /></label>' },
  UTextarea: { props: ['modelValue'], template: '<textarea :value="modelValue" />' },
  USelectMenu: { props: ['modelValue', 'items'], template: '<select />' },
  ULink: { template: '<a><slot /></a>' }
}

const IG_A = 'ea000000-0000-4000-8000-00000000000a'
const IG_B = 'ea000000-0000-4000-8000-00000000002a'

function fixture(): SocialApprovalPost {
  return {
    id: 'post-1',
    client_id: '0a000000-0000-4000-8000-00000000000a',
    created_by: 'staff-1',
    content: 'Showroom open day',
    media_urls: [],
    link_url: null,
    hashtags: ['openday'],
    first_comment: null,
    platforms: ['instagram'],
    account_ids: [IG_A, IG_B],
    publish_targets: [{ platform: 'instagram', accountId: IG_A }, { platform: 'instagram', accountId: IG_B }],
    platform_overrides: {},
    tags: null,
    scheduled_at: null,
    timezone: 'Australia/Sydney',
    status: 'draft',
    platform_results: {},
    publish_attempts: 0,
    published_at: null,
    last_attempt_at: null,
    approval_requested_at: '2026-10-27T01:00:00.000Z',
    approval_requested_by: 'staff-1',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
    review_policy: 'delegated_marketing',
    queue_position: null,
    campaign_id: null,
    assigned_to: null,
    due_at: null,
    metadata: {},
    created_at: '2026-10-27T01:00:00.000Z',
    updated_at: '2026-10-27T01:00:00.000Z',
    current_revision: {
      id: 'rev-1', post_id: 'post-1', client_id: '0a000000-0000-4000-8000-00000000000a', revision_number: 1,
      review_policy: 'delegated_marketing', content_hash: 'f'.repeat(64), requested_by: 'staff-1',
      requested_at: '2026-10-27T01:00:00.000Z', review_status: 'pending', reviewed_by: null, reviewed_at: null,
      review_reason: null, expires_at: '2026-10-28T01:00:00.000Z', dispatch_claimed_at: null, dispatch_attempt: 0,
      dispatch_outcome: null,
      targets: [{ platform: 'instagram', accountId: IG_A }, { platform: 'instagram', accountId: IG_B }],
      media: [], schedule: { scheduledAt: null, timezone: 'Australia/Sydney' }
    },
    review: { policy: 'delegated_marketing', independentReviewRequired: true, revisionId: 'rev-1', canDecide: true, blockedReason: null },
    media_previews: [],
    effective_targets: [
      {
        key: `instagram:${IG_A}`, platform: 'instagram', accountId: IG_A, mode: 'carousel',
        account: { name: 'Dealer Main Instagram', platformAccountId: '17841400000000001', connected: true },
        content: 'Showroom open day\n\n#openday', link: null, hashtags: ['openday'], firstComment: null,
        options: { collaborators: ['partner.shop'] }, notes: []
      },
      {
        key: `instagram:${IG_B}`, platform: 'instagram', accountId: IG_B, mode: 'story',
        account: { name: 'Dealer Service Instagram', platformAccountId: '17841400000000002', connected: true },
        content: '', link: null, hashtags: [], firstComment: null, options: { type: 'story' },
        notes: ['Stories publish the media only; caption, hashtags, link and first comment are not delivered.']
      }
    ]
  } as SocialApprovalPost
}

async function flush() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

let mounted: { unmount: () => void, host: HTMLElement } | null = null
afterEach(() => {
  mounted?.unmount()
  mounted?.host.remove()
  mounted = null
})

describe('exact-review approvals page', () => {
  it('shows each destination account, its effective mode/collaborators and the copy it will publish', async () => {
    approvals.rows = [fixture()]
    const { default: Page } = await import('~~/app/pages/agency/social/publishing/approvals.vue')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(Page as never) })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    mounted = { unmount: () => app.unmount(), host }
    await flush()

    const destinations = Array.from(host.querySelectorAll('[data-destination]'))
    expect(destinations.map(node => node.getAttribute('data-destination'))).toEqual([`instagram:${IG_A}`, `instagram:${IG_B}`])
    const [main, service] = destinations.map(node => node.textContent ?? '')
    expect(main).toContain('Dealer Main Instagram')
    expect(main).toContain('17841400000000001')
    expect(main).toContain('Carousel')
    expect(main).toContain('partner.shop')
    expect(main).toContain('#openday')
    expect(service).toContain('Dealer Service Instagram')
    expect(service).toContain('Story')
    expect(service).toContain('No caption')
    expect(service).toContain('Stories publish the media only')

    // The exact-revision panel names the accounts instead of an internal id prefix.
    expect(host.textContent).toContain('Instagram Dealer Main Instagram')
    expect(host.textContent).not.toContain(`account ${IG_A.slice(0, 8)}`)
    // Approval authorizes; it does not itself publish.
    expect(host.textContent).toContain('Approving authorizes this exact revision only')
    expect(host.textContent).not.toContain('Approving publishes')
    // The queue entries are Nuxt UI buttons, not raw <button> markup.
    const queueEntry = Array.from(host.querySelectorAll('button')).find(button => button.getAttribute('aria-pressed') !== null)
    expect(queueEntry?.getAttribute('data-ui')).toBe('UButton')
  })
})
