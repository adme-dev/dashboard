// @vitest-environment happy-dom
import { reactive } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Approval from '~~/app/components/page-studio/TransferRecoveryApproval.client.vue'
import { button, cleanup, click, deferred, flush, mount, otherSite, requestId, siteId } from './pageStudioTransferTestSupport'
const fetch = vi.fn()
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const reference = { reviewId: id(1), revision: 1, reviewDigest: 'b'.repeat(64) }
const deadline = '2099-10-24T00:00:00.000Z'
const head = { recoveryId: id(2), epoch: 1, version: 1, state: 'reconciling', deadline, expired: false }
const scope = { siteId, requestId, expectedRevision: 5 }
const summary = () => ({ reference, maximumDeadline: deadline, remainingWork: 'same-operation-source-through-retention', plan: { pages: 20, storageBytes: 10000, customDomains: 1, monthlyBuilds: 20, monthlyTrafficBytes: 100000, monthlyAiOperations: 0 }, consents: [] as { party: string, expired: boolean }[] })
const props = (mode: 'owner' | 'operator' = 'operator') => reactive({ siteId, requestId, revision: 5, mode, actorKey: 'operator-a', ...(mode === 'owner' ? { reference } : {}) })
let view = summary()
let currentHead = { ...head }
function reply(mode: 'owner' | 'operator', value: unknown) { return mode === 'operator' ? { view: value, customerOrigin: 'https://studio.example.test' } : value }
function normal(mode: 'owner' | 'operator') {
  fetch.mockImplementation(async (_url, options) => {
    if (options.method !== 'POST') return { siteId, requestId, revision: 5, recovery: currentHead, allowedActions: ['revoke'] }
    const action = options.body.request
    if (action.action === 'read') return reply(mode, { ...scope, action: 'read', historical: true, review: view })
    if (action.action === 'renew-plan') return reply(mode, { ...scope, action: action.action, historical: false, renewalRequestId: action.renewalRequestId, recoveryId: action.recoveryId, effectiveUntil: action.effectiveUntil, planKey: 'bounded' })
    if (action.action === 'create-review') { view.reference = { ...reference, reviewId: action.body.reviewId }; return reply(mode, { ...scope, action: action.action, historical: false, review: view }) }
    if (action.action === 'consent-review') { view.consents.push({ party: mode, expired: false }); return reply(mode, { ...scope, action: action.action, historical: false, review: action.review, consentId: action.consentId, party: mode }) }
    return reply(mode, { ...scope, action: action.action, historical: false, review: action.review, approvalId: action.approvalId, deadline })
  })
}
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); vi.stubGlobal('$fetch', fetch); view = summary(); currentHead = { ...head }; normal('operator') })
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals() })
it('renews, creates, consents and approves only explicit confirmed steps', async () => {
  const host = await mount(Approval, props())
  expect(fetch).toHaveBeenCalledTimes(1)
  await click(host, 'Renew original plan limits'); expect(fetch).toHaveBeenCalledTimes(1)
  await click(host, 'Confirm this step')
  expect(fetch.mock.calls[1][1].body.request).toMatchObject({ action: 'renew-plan', effectiveUntil: deadline, expectedHeadVersion: 1 })
  await click(host, 'Create recovery review'); await click(host, 'Confirm this step')
  expect(host.textContent).toContain('Owner review link'); expect(host.querySelector('a')?.href).toContain('https://studio.example.test/studio/sites/')
  await click(host, 'Agree to this review'); await click(host, 'Confirm this step')
  expect(button(host, 'Approve after fresh checks')).toBeUndefined()
  view.consents.push({ party: 'owner', expired: false })
  await click(host, 'Refresh review'); await click(host, 'Approve after fresh checks'); await click(host, 'Confirm this step')
  expect(host.textContent).toContain('Recovery review approved')
  expect(fetch.mock.calls.filter(([, o]) => o.method === 'POST').every(([, o]) => o.retry === 0)).toBe(true)
})
it('owner reads exact reference and can only give their own agreement', async () => {
  normal('owner'); const host = await mount(Approval, props('owner'))
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/portal/page-studio/customer/sites/${siteId}/transfer-requests/${requestId}/recovery/review`, { method: 'POST', retry: 0, body: { expectedRevision: 5, request: { action: 'read', review: reference } } })
  expect(host.textContent).not.toContain('Renew original plan limits')
  await click(host, 'Agree to this review'); expect(fetch).toHaveBeenCalledTimes(1)
  await click(host, 'Confirm this step'); expect(fetch.mock.calls[1][1].body).not.toHaveProperty('authentication')
  expect(button(host, 'Agree to this review')).toBeUndefined()
  expect(host.textContent).toContain('Your agreement is recorded')
  await click(host, 'Refresh review'); expect(host.textContent).toContain('agreement recorded')
})
it('retains exact uncertain action across refresh and component reload', async () => {
  let host = await mount(Approval, props())
  await click(host, 'Renew original plan limits'); fetch.mockRejectedValueOnce(Error('lost'))
  await click(host, 'Confirm this step')
  const original = fetch.mock.calls[1][1].body.request
  expect(host.textContent).toContain('could not be confirmed'); expect(fetch).toHaveBeenCalledTimes(2)
  cleanup(); host = await mount(Approval, props())
  await click(host, 'Check the same step'); await click(host, 'Confirm this step')
  expect(fetch.mock.calls.at(-1)?.[1].body.request).toEqual(original)
  expect(button(host, 'Create recovery review')).toBeDefined()
})
it('restores an exact created review reference after reload', async () => {
  let host = await mount(Approval, props())
  await click(host, 'Renew original plan limits'); await click(host, 'Confirm this step')
  await click(host, 'Create recovery review'); await click(host, 'Confirm this step')
  const retained = structuredClone(view.reference)
  cleanup(); host = await mount(Approval, props())
  expect(fetch.mock.calls.at(-1)?.[1].body.request).toEqual({ action: 'read', review: retained })
  expect(button(host, 'Agree to this review')).toBeDefined()
})
it.each(['siteId', 'actorKey'])('drops late mutations when %s changes', async key => {
  const values = props(), host = await mount(Approval, values), later = deferred()
  await click(host, 'Renew original plan limits'); fetch.mockReturnValueOnce(later.promise); await click(host, 'Confirm this step')
  const action = fetch.mock.calls[1][1].body.request
  Object.assign(values, { [key]: key === 'siteId' ? otherSite : 'operator-b' }); await flush()
  later.resolve(reply('operator', { ...scope, action: 'renew-plan', historical: false, renewalRequestId: action.renewalRequestId, recoveryId: action.recoveryId, effectiveUntil: deadline, planKey: 'bounded' })); await flush()
  expect(button(host, 'Create recovery review')).toBeUndefined()
})
it('discards view and confirmation on blur until fresh authentication read', async () => {
  normal('owner'); const host = await mount(Approval, props('owner'))
  await click(host, 'Agree to this review'); window.dispatchEvent(new Event('blur')); await flush()
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(button(host, 'Agree to this review')).toBeUndefined()
  expect(fetch).toHaveBeenCalledTimes(1)
  await click(host, 'Refresh review'); expect(button(host, 'Agree to this review')).toBeDefined()
})
it('does not consent once the review expires while the confirmation is open', async () => {
  normal('owner'); const host = await mount(Approval, props('owner'))
  await click(host, 'Agree to this review')
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(deadline) + 1)
  await click(host, 'Confirm this step'); expect(fetch).toHaveBeenCalledTimes(1)
  now.mockRestore()
})
it('rejects another review or site response and exposes no mutation', async () => {
  normal('owner'); fetch.mockResolvedValueOnce({ ...scope, siteId: otherSite, action: 'read', historical: true, review: view })
  const host = await mount(Approval, props('owner')); expect(host.textContent).toContain('could not be confirmed'); expect(button(host, 'Agree to this review')).toBeUndefined()
})
it('does not read incomplete owner references or admit operator actions from saved owner state', async () => {
  const values = props('owner'); Object.assign(values, { reference: { ...reference, reviewDigest: '' } })
  const host = await mount(Approval, values); expect(host.textContent).toContain('link is incomplete'); expect(fetch).not.toHaveBeenCalled()
})

it.each([['approved', 2], ['pending', 3], ['applied', 4]])('reads current %s head after approval and reload instead of offering another approval', async (state, version) => {
  let host = await mount(Approval, props())
  await click(host, 'Renew original plan limits'); await click(host, 'Confirm this step')
  await click(host, 'Create recovery review'); await click(host, 'Confirm this step')
  view.consents = [{ party: 'owner', expired: false }, { party: 'operator', expired: false }]
  await click(host, 'Refresh review'); await click(host, 'Approve after fresh checks'); await click(host, 'Confirm this step')
  currentHead = { ...head, state: String(state), version: Number(version) }
  cleanup(); host = await mount(Approval, props())
  expect(host.textContent).toContain('Recovery review approved')
  expect(button(host, 'Approve after fresh checks')).toBeUndefined()
  expect(button(host, 'Agree to this review')).toBeUndefined()
  await click(host, 'Refresh review')
  expect(button(host, 'Approve after fresh checks')).toBeUndefined()
})
it('retains the original approval ID when the response is lost but the server head advanced', async () => {
  let host = await mount(Approval, props())
  await click(host, 'Renew original plan limits'); await click(host, 'Confirm this step')
  await click(host, 'Create recovery review'); await click(host, 'Confirm this step')
  view.consents = [{ party: 'owner', expired: false }, { party: 'operator', expired: false }]
  await click(host, 'Refresh review'); await click(host, 'Approve after fresh checks')
  fetch.mockRejectedValueOnce(Error('lost'))
  await click(host, 'Confirm this step')
  const original = fetch.mock.calls.at(-1)![1].body.request
  currentHead = { ...head, state: 'approved', version: 2 }
  cleanup(); host = await mount(Approval, props())
  expect(button(host, 'Approve after fresh checks')).toBeUndefined()
  await click(host, 'Check the same step'); await click(host, 'Confirm this step')
  expect(fetch.mock.calls.at(-1)![1].body.request).toEqual(original)
})
