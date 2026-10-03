// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, watch } from 'vue'
import PortalReviews from '~~/app/components/portal/SocialLiveReviews.client.vue'
import LiveManager from '~~/app/components/social-publishing/LivePostManager.client.vue'

vi.mock('~/composables/usePortalAuth', () => ({ usePortalAuth: () => ({ hasPermission: () => true }) }))
const fetchMock = vi.fn()
Object.assign(globalThis, { computed, ref, watch, $fetch: fetchMock, useToast: () => ({ add: vi.fn() }) })
const stubs = {
  UModal: { props: ['open'], template: '<div v-if="open" role="dialog"><slot name="content"/></div>' },
  USlideover: { props: ['open'], template: '<div v-if="open"><slot name="body"/></div>' },
  UButton: { props: ['loading', 'disabled'], emits: ['click'], template: '<button :disabled="loading || disabled" @click="$emit(\'click\')"><slot/></button>' },
  UTextarea: { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<textarea :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"/>' },
  UCheckbox: { props: ['modelValue', 'label', 'disabled'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :disabled="disabled" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)"/>{{ label }}</label>' },
  UAlert: { props: ['description'], template: '<p>{{ description }}</p>' },
  UFormField: { props: ['label'], template: '<div :data-label="label"><slot/></div>' },
  USelect: { template: '<span/>' }, UAccordion: { template: '<div><slot name="change"/><slot name="captions"/></div>' },
  UBadge: { template: '<span><slot/></span>' }, USkeleton: { template: '<span/>' }
}
const cleanups: (() => void)[] = []
function mount(component: unknown, values = {}) {
  const props = reactive(values)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(component as never, props) })
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
  return { host, props }
}
async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(node => node.textContent?.trim() === text)
  expect(button).toBeTruthy()
  button!.click()
}
function check(host: HTMLElement, text: string) {
  const label = [...host.querySelectorAll('label')].find(node => node.textContent?.includes(text))
  expect(label).toBeTruthy()
  label!.querySelector('input')!.click()
}
const review = { id: 'review', post_id: 'post', account_id: 'account', provider_post_id: '123_456', account_name: 'DriveAgent', action: 'edit', before_message: 'Original', after_message: 'Approved caption', status: 'pending', expired: false, created_at: '2026-10-04T00:00:00Z', expires_at: '2026-10-11T00:00:00Z' }
const snapshot = { accountName: 'DriveAgent', message: 'Original', removed: false, customerApprovalRequired: true, operations: [], reviews: [] }
beforeEach(() => fetchMock.mockReset())
afterEach(() => cleanups.splice(0).forEach(fn => fn()))
it('requires an explicit customer confirmation and records only the immutable request decision', async () => {
  fetchMock.mockResolvedValueOnce([review]).mockResolvedValueOnce({ status: 'approved' }).mockResolvedValueOnce([{ ...review, status: 'approved' }])
  const { host } = mount(PortalReviews)
  await flush()
  expect(host.textContent).toContain('Approved caption')
  click(host, 'Review approval')
  await flush()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(host.querySelector('[role="dialog"]')).toBeTruthy()
  click(host, 'Confirm decision')
  await flush()
  expect(fetchMock.mock.calls[1]).toEqual(['/api/portal/social/live-reviews/review/respond', { method: 'POST', retry: 0, body: { action: 'approve', feedback: '' } }])
  expect(host.textContent).not.toContain('Review approval')
})
it('reloads replaced requests without retrying a customer decision', async () => {
  fetchMock.mockResolvedValueOnce([review]).mockRejectedValueOnce({ data: { statusMessage: 'Superseded' } }).mockResolvedValueOnce([{ ...review, status: 'superseded' }])
  const { host } = mount(PortalReviews)
  await flush()
  click(host, 'Review approval')
  await flush()
  click(host, 'Confirm decision')
  await flush()
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  expect(host.textContent).toContain('superseded')
})
it('sends customer-governed staff edits for review instead of applying directly', async () => {
  fetchMock.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce(snapshot)
  const { host, props } = mount(LiveManager, { open: false, post: { id: 'post', client_id: 'client', accounts: [{ id: 'account', platform: 'facebook', account_name: 'DriveAgent' }] } })
  Object.assign(props, { open: true })
  await flush()
  const textarea = host.querySelector('textarea')!
  textarea.value = 'Proposed revision'
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  check(host, 'reviewed this caption')
  await flush()
  click(host, 'Send caption for customer review')
  await flush()
  expect(fetchMock.mock.calls[1][1].body).toMatchObject({ action: 'edit', message: 'Proposed revision', expectedMessage: 'Original', requestReview: true })
})
it('applies the immutable customer-approved caption rather than the editable composer text', async () => {
  fetchMock.mockResolvedValueOnce({ ...snapshot, reviews: [{ ...review, status: 'approved' }] }).mockResolvedValueOnce({ status: 'succeeded' }).mockResolvedValueOnce(snapshot)
  const { host, props } = mount(LiveManager, { open: false, post: { id: 'post', client_id: 'client', accounts: [{ id: 'account', platform: 'facebook', account_name: 'DriveAgent' }] } })
  Object.assign(props, { open: true })
  await flush()
  const textarea = host.querySelector('textarea')!
  textarea.value = 'Unapproved alternative'
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
  check(host, 'exact customer-approved caption')
  await flush()
  click(host, 'Apply approved caption')
  await flush()
  expect(fetchMock.mock.calls[1][1].body).toMatchObject({ operationId: 'review', reviewRequestId: 'review', message: 'Approved caption', expectedMessage: 'Original' })
  expect(fetchMock.mock.calls[1][1].body.requestReview).toBeUndefined()
})
