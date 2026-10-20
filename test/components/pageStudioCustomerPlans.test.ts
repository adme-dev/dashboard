// @vitest-environment happy-dom
import { ref } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Plans from '~~/app/components/page-studio/CustomerPlans.client.vue'
import { button, cleanup, click, deferred, flush, mount, siteId } from './pageStudioTransferTestSupport'

const fetch = vi.fn(), user = ref({ id: 'owner-a', role: 'owner', custom_role_id: 'assigned-system-role' })
const target = { workspaceId: 'workspace', entitlementId: 'entitlement', workspaceName: 'Flowers', siteId, siteName: 'Flowers website', eligible: true, status: 'trial', planKey: 'customer_preview_v1', effectiveUntil: null, limits: { pagesPerSiteLimit: 5, domainLimit: 0, buildLimit: 10 } }
const grant = { props: ['target'], emits: ['invalidated'], template: '<section data-confirmation>{{ target.siteName }}<button @click="$emit(\'invalidated\')">Server denied plan</button></section>' }
beforeEach(() => {
  vi.resetAllMocks()
  user.value = { id: 'owner-a', role: 'owner', custom_role_id: 'assigned-system-role' }
  vi.stubGlobal('useAuth', () => ({ user }))
  vi.stubGlobal('$fetch', fetch)
  fetch.mockResolvedValue({ targets: [target], nextCursor: null })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it.each(['owner', 'admin'])('allows an assigned %s candidate to load customer plans', async (role) => {
  user.value = { ...user.value, role }
  const host = await mount(Plans, {}, { PageStudioCustomerPlanGrant: grant })
  expect(fetch).toHaveBeenCalledOnce()
  expect(button(host, 'Set publishing plan')).toBeDefined()
  await click(host, 'Set publishing plan')
  expect(host.querySelector('[data-confirmation]')).not.toBeNull()
})
it('clears target and confirmation after same-user role reassignment and server denial', async () => {
  const host = await mount(Plans, {}, { PageStudioCustomerPlanGrant: grant })
  await click(host, 'Set publishing plan')
  fetch.mockRejectedValue({ statusCode: 403 })
  user.value = { ...user.value, custom_role_id: 'different-role' }
  await flush()
  expect(host.querySelector('[data-confirmation]')).toBeNull()
  expect(button(host, 'Set publishing plan')).toBeUndefined()
  expect(host.textContent).toContain('could not be loaded')
})
it('ignores a late customer list after account change', async () => {
  const pending = deferred()
  fetch.mockReturnValueOnce(pending.promise).mockRejectedValue({ statusCode: 403 })
  const host = await mount(Plans, {}, { PageStudioCustomerPlanGrant: grant })
  user.value = { ...user.value, id: 'owner-b' }
  await flush()
  pending.resolve({ targets: [target], nextCursor: null })
  await flush()
  expect(button(host, 'Set publishing plan')).toBeUndefined()
  expect(host.querySelector('[data-confirmation]')).toBeNull()
})

it('clears the selected target when its mounted grant reports server denial', async () => {
  const host = await mount(Plans, {}, { PageStudioCustomerPlanGrant: grant })
  await click(host, 'Set publishing plan')
  fetch.mockRejectedValue({ statusCode: 403 })
  await click(host, 'Server denied plan')
  expect(host.querySelector('[data-confirmation]')).toBeNull()
  expect(button(host, 'Set publishing plan')).toBeUndefined()
})
