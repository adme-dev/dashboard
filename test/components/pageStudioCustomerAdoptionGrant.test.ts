// @vitest-environment happy-dom
import { reactive } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Grant from '~~/app/components/page-studio/CustomerAdoptionGrant.client.vue'
import { cleanup, click, deferred, flush, mount, otherSite, siteId } from './pageStudioTransferTestSupport'

const fetch = vi.fn()
const props = () => reactive({ siteId, actorKey: 'operator-a' })
const grantId = '20000000-0000-4000-8000-000000000003'
const view = (value: object = {}) => ({ customerOrigin: 'https://customer.example.test', view: { action: 'inspect', siteId, sourceDigest: 'b'.repeat(64), selection: null, ...value } })
const children = { UCard: { template: '<section><slot/></section>' } }
type GrantOptions = { body: { body: { grantId: string, sourceDigest: string, expiresAt: string } } }
function receipt(options: GrantOptions, historical = false) {
  const { grantId, sourceDigest, expiresAt } = options.body.body
  return { customerOrigin: 'https://customer.example.test', view: { action: 'grant', siteId, historical, grant: { grantId, sourceDigest, expiresAt, revision: 1, siteId, issuedAt: '2026-10-23T09:00:00.000Z' } } }
}
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('$fetch', fetch); fetch.mockResolvedValue(view()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('does not inspect or grant until explicit actions, then confirms one finite grant', async () => {
  const host = await mount(Grant, props(), children)
  expect(fetch).not.toHaveBeenCalled()
  await click(host, 'Check saved source')
  expect(fetch.mock.calls[0][1]).toEqual({ retry: 0, timeout: 120000 })
  await click(host, 'Allow one hour of setup')
  expect(fetch).toHaveBeenCalledOnce()
  fetch.mockImplementationOnce(async (_url, options) => receipt(options))
  await click(host, 'Confirm setup access')
  const options = fetch.mock.calls[1][1]
  expect(options).toMatchObject({ method: 'POST', retry: 0, body: { action: 'grant', body: { expectedGrantId: null, expectedRevision: 0, sourceDigest: 'b'.repeat(64) } } })
  expect(Date.parse(options.body.body.expiresAt) - Date.now()).toBeLessThanOrEqual(3_600_000)
  expect(host.textContent).toContain('Setup grant recorded')
  expect(host.textContent).toContain(`https://customer.example.test/studio/adoption/${options.body.body.grantId}?revision=1`)
  expect(fetch).toHaveBeenCalledTimes(2)
})
it('lost acknowledgement keeps the identical grant for explicit result checking', async () => {
  const host = await mount(Grant, props(), children)
  await click(host, 'Check saved source'); await click(host, 'Allow one hour of setup')
  fetch.mockRejectedValueOnce(Error('private provider details'))
  await click(host, 'Confirm setup access')
  const original = structuredClone(fetch.mock.calls[1][1].body)
  expect(host.textContent).toContain('Check this grant result')
  expect(host.textContent).not.toContain('private provider details')
  expect(fetch).toHaveBeenCalledTimes(2)
  fetch.mockImplementationOnce(async (_url, options) => receipt(options, true))
  await click(host, 'Check this grant result')
  expect(fetch.mock.calls[2][1].body).toEqual(original)
  expect(host.textContent).toContain('Recorded grant retrieved')
})
it('withdraws only the inspected selection after confirmation', async () => {
  fetch.mockResolvedValue(view({ selection: { grantId, revision: 3 } }))
  const host = await mount(Grant, props(), children)
  await click(host, 'Check saved source'); await click(host, 'Withdraw setup access')
  expect(fetch).toHaveBeenCalledOnce()
  fetch.mockResolvedValueOnce({ customerOrigin: 'https://customer.example.test', view: { action: 'withdraw', siteId, withdrawn: true, grant: { grantId, revision: 3, siteId, sourceDigest: 'b'.repeat(64), issuedAt: '2026-10-23T09:00:00.000Z', expiresAt: '2026-10-23T10:00:00.000Z' } } })
  await click(host, 'Confirm withdrawal')
  expect(fetch.mock.calls[1][1].body).toEqual({ action: 'withdraw', grantId, expectedRevision: 3 })
  expect(host.textContent).toContain('Setup grant withdrawn')
  expect(host.textContent).not.toContain('Customer setup link')
})
it.each(['siteId', 'actorKey'])('discards a late inspection after %s changes', async key => {
  const pending = deferred(), values = props(), host = await mount(Grant, values, children)
  fetch.mockReturnValueOnce(pending.promise)
  await click(host, 'Check saved source')
  Object.assign(values, { [key]: key === 'siteId' ? otherSite : 'operator-b' }); await flush()
  pending.resolve(view()); await flush()
  expect(host.textContent).not.toContain('Allow one hour of setup')
})
it('rejects a forged site and unsafe customer origin without showing a link', async () => {
  const host = await mount(Grant, props(), children)
  fetch.mockResolvedValueOnce(view({ siteId: otherSite }))
  await click(host, 'Check saved source')
  expect(host.textContent).toContain('Action not confirmed')
  fetch.mockResolvedValueOnce({ ...view({ selection: { grantId, revision: 1 } }), customerOrigin: 'javascript:alert(1)' })
  await click(host, 'Check saved source')
  expect(host.textContent).not.toContain('Customer setup link')
})
it('cancel sends no mutation and invalid site makes no request', async () => {
  const host = await mount(Grant, props(), children)
  await click(host, 'Check saved source'); await click(host, 'Allow one hour of setup'); await click(host, 'Cancel')
  expect(fetch).toHaveBeenCalledOnce()
  const invalid = await mount(Grant, { siteId: '', actorKey: 'operator-a' }, children)
  await click(invalid, 'Check saved source')
  expect(fetch).toHaveBeenCalledOnce()
})
