// @vitest-environment happy-dom
import { reactive } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Recovery from '~~/app/components/page-studio/TransferRecoveryStatus.client.vue'
import { cleanup, click, deferred, flush, mount, otherSite, requestId, siteId } from './pageStudioTransferTestSupport'

const fetch = vi.fn()
const props = () => reactive({ siteId, requestId, revision: 5, actorKey: 'operator-a' })
const head = { recoveryId: '20000000-0000-4000-8000-000000000003', epoch: 1, version: 1,
  state: 'reconciling', deadline: '2026-10-24T00:00:00.000Z', expired: false }
const view = (recovery: unknown = head) => ({ siteId, requestId, revision: 5, recovery, allowedActions: [] })
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('$fetch', fetch)
  fetch.mockResolvedValue(view())
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([
  [head, 'Recovery review open'], [null, 'No recovery review yet'],
  [{ ...head, expired: true }, 'Recovery review expired'],
  [{ ...head, state: 'revoked', version: 2, expired: true }, 'Recovery review revoked']
])('explains saved state without offering or sending transfer mutations', async (recovery, label) => {
  fetch.mockResolvedValue(view(recovery))
  const host = await mount(Recovery, props())
  expect(host.textContent).toContain(label)
  expect(host.querySelectorAll('button')).toHaveLength(1)
  expect(host.querySelector('button')?.textContent).toBe('Refresh recovery status')
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/agency/page-studio/sites/${siteId}/transfer-requests/${requestId}/recovery`,
    { query: { expectedRevision: 5 }, retry: 0 })
  expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
})
it.each(['siteId', 'requestId', 'revision'])('discards a response for a different %s', async key => {
  fetch.mockResolvedValue(view())
  fetch.mockResolvedValueOnce({ ...view(), [key]: key === 'revision' ? 6 : otherSite })
  const host = await mount(Recovery, props())
  expect(host.textContent).toContain('Recovery status unavailable')
  expect(host.textContent).not.toContain('Recovery review open')
})
it.each(['actorKey', 'siteId', 'requestId', 'revision'])('discards late responses after %s changes', async key => {
  const pending = deferred(), values = props()
  fetch.mockReturnValueOnce(pending.promise).mockRejectedValue({ statusCode: 403 })
  const host = await mount(Recovery, values)
  Object.assign(values, { [key]: key === 'revision' ? 6 : key === 'actorKey' ? 'operator-b' : otherSite })
  await flush()
  pending.resolve(view())
  await flush()
  expect(host.textContent).not.toContain('Recovery review open')
  expect(host.textContent).toContain('Recovery status unavailable')
})
it('clears prior data after a failed refresh and permits one explicit read retry', async () => {
  const host = await mount(Recovery, props())
  fetch.mockRejectedValueOnce(new Error('private failure')).mockResolvedValueOnce(view(null))
  await click(host, 'Refresh recovery status')
  expect(host.textContent).toContain('Recovery status unavailable')
  expect(host.textContent).not.toContain('private failure')
  expect(host.textContent).not.toContain('Recovery review open')
  expect(fetch).toHaveBeenCalledTimes(2)
  await click(host, 'Refresh recovery status')
  expect(host.textContent).toContain('No recovery review yet')
  expect(fetch).toHaveBeenCalledTimes(3)
})
