// @vitest-environment happy-dom
// The client portal sends the revision it displayed with every decision and reloads when the agency
// has resubmitted in the meantime (409), so a decision is never recorded against an unseen revision.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'

vi.mock('~/composables/usePortalAuth', () => ({ usePortalAuth: () => ({ hasPermission: () => true }) }))

const toasts: Array<Record<string, unknown>> = []
Object.assign(globalThis, { computed, ref, watch, useToast: () => ({ add: (toast: Record<string, unknown>) => toasts.push(toast) }) })

const REVISION_N = '11111111-1111-4111-8111-111111111111'
const REVISION_N1 = '22222222-2222-4222-8222-222222222222'
const draft = (revisionId: string) => ({
  id: 'post-1',
  content: 'News copy',
  approval: { status: 'pending', revisionId, revisionNumber: revisionId === REVISION_N ? 1 : 2 }
})

const stubs = {
  PortalSocialNewsApprovalCard: {
    props: ['draft'],
    emits: ['decide'],
    template: '<article :data-revision="draft.approval.revisionId"><button data-approve @click="$emit(\'decide\', draft, \'approve\')">Approve</button></article>'
  },
  UButton: { props: ['disabled', 'loading'], emits: ['click'], template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>' },
  UBadge: { template: '<span><slot /></span>' },
  UIcon: { template: '<i />' },
  UAlert: { template: '<aside><slot name="actions" /></aside>' },
  UModal: { props: ['open'], template: '<section v-if="open" data-modal><slot name="content" /></section>' },
  UFormField: { template: '<label><slot /></label>' },
  UTextarea: { props: ['modelValue'], template: '<textarea :value="modelValue" />' }
}

async function flush() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

let cleanup: (() => void) | null = null
afterEach(() => {
  cleanup?.()
  cleanup = null
  toasts.length = 0
})

describe('portal social news decision request', () => {
  it('posts the displayed revision id and reloads instead of recording a stale decision', async () => {
    let current = REVISION_N
    const requests: Array<{ url: string, options?: { method?: string, body?: Record<string, unknown> } }> = []
    ;(globalThis as any).$fetch = vi.fn(async (url: string, options?: { method?: string, body?: Record<string, unknown> }) => {
      requests.push({ url, options })
      if (url === '/api/portal/social/news-drafts') return { drafts: [draft(current)], summary: { pending: 1 } }
      // The agency resubmitted N+1 after the client opened N.
      if (options?.body?.revisionId !== current) {
        throw Object.assign(new Error('Conflict'), { statusCode: 409, data: { statusCode: 409, statusMessage: 'This content changed after you opened it. Reload to review the latest version.' } })
      }
      return { ok: true, status: 'approved' }
    })
    const { default: Approvals } = await import('~~/app/components/portal/SocialNewsApprovals.vue')
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(Approvals as never) })
    Object.entries(stubs).forEach(([name, component]) => app.component(name, component))
    app.mount(host)
    cleanup = () => {
      app.unmount()
      host.remove()
    }
    await flush()

    const decide = async () => {
      ;(host.querySelector('[data-approve]') as HTMLButtonElement).click()
      await flush()
      const confirm = Array.from(host.querySelectorAll('[data-modal] button')).find(button => button.textContent?.includes('Confirm approval')) as HTMLButtonElement
      confirm.click()
      await flush()
    }

    current = REVISION_N1
    await decide()
    const stale = requests.find(request => request.url.endsWith('/respond'))!
    expect(stale.options).toMatchObject({ method: 'POST', body: { action: 'approve', revisionId: REVISION_N } })
    expect(toasts.at(-1)).toMatchObject({ title: 'Content updated', color: 'warning' })
    expect(host.querySelector('[data-modal]')).toBeNull()
    expect(host.querySelector('article')?.getAttribute('data-revision')).toBe(REVISION_N1)

    await decide()
    const responses = requests.filter(request => request.url.endsWith('/respond'))
    expect(responses).toHaveLength(2)
    expect(responses[1]!.options?.body).toMatchObject({ action: 'approve', revisionId: REVISION_N1 })
    expect(toasts.at(-1)).toMatchObject({ title: 'Content approved', color: 'success' })
  })
})
