// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, createApp, nextTick, ref, watch } from 'vue'
import SocialNewsApprovals from '~~/app/components/portal/SocialNewsApprovals.client.vue'

vi.mock('~/composables/usePortalAuth', () => ({ usePortalAuth: () => ({ hasPermission: () => true }) }))
const fetchMock = vi.fn()
const toast = vi.fn()
Object.assign(globalThis, { computed, ref, watch, $fetch: fetchMock, useToast: () => ({ add: toast }) })
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(fn => fn())
  vi.clearAllMocks()
})
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
it('requires a fresh customer decision after an outdated preview is rejected', async () => {
  const first = { id: 'post', content: 'Original', reviewVersion: 'a'.repeat(64) }
  const refreshed = { ...first, content: 'Updated by agency', reviewVersion: 'b'.repeat(64) }
  fetchMock.mockResolvedValueOnce({ drafts: [first], summary: { pending: 1 } })
    .mockRejectedValueOnce({ statusCode: 409, data: { statusMessage: 'Reload and review again.' } })
    .mockResolvedValueOnce({ drafts: [refreshed], summary: { pending: 1 } })
    .mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ drafts: [], summary: {} })
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(SocialNewsApprovals)
  app.component('PortalSocialNewsApprovalCard', { props: ['draft'], emits: ['decide'], template: '<article>{{ draft.content }}<button @click="$emit(\'decide\', draft, \'approve\')">Review</button></article>' })
  app.component('UModal', { props: ['open'], template: '<div v-if="open" role="dialog"><slot name="content"/></div>' })
  app.component('UButton', { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot/></button>' })
  for (const name of ['UIcon', 'UBadge', 'UFormField', 'UTextarea', 'UAlert']) app.component(name, { template: '<div><slot/></div>' })
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  const click = (text: string) => {
    const button = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === text)
    expect(button).toBeTruthy()
    button!.click()
  }
  await flush()
  click('Review')
  await flush()
  click('Confirm approval')
  await flush()
  expect(fetchMock.mock.calls[1][1].body.reviewVersion).toBe(first.reviewVersion)
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(host.textContent).toContain('Updated by agency')
  expect(fetchMock).toHaveBeenCalledTimes(3) // Reload only; no automatic retry of the decision.
  click('Review')
  await flush()
  click('Confirm approval')
  await flush()
  expect(fetchMock.mock.calls[3][1].body.reviewVersion).toBe(refreshed.reviewVersion)
  expect(host.textContent).toContain('No news or social content in this view')
})
