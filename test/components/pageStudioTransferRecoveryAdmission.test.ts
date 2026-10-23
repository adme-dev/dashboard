// @vitest-environment happy-dom
import { reactive } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Admission from '~~/app/components/page-studio/TransferRecoveryAdmission.client.vue'
import { button, cleanup, click, deferred, flush, mount, otherSite, requestId, siteId } from './pageStudioTransferTestSupport'
const fetch = vi.fn()
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const review = { reviewId: id(1), revision: 1, reviewDigest: 'b'.repeat(64) }
const deadline = '2099-10-24T00:00:00.000Z'
const scope = { siteId, requestId, expectedRevision: 5 }
const props = () => reactive({ siteId, requestId, revision: 5, actorKey: 'operator-a' })
let pgState = 'approved', admissionId: string | null = null
function response(action: string) {
  return { ...scope, action, admissionId, review, deadline, pgState,
    d1State: action === 'prepare' ? 'prepared' : action === 'enable' ? 'enabled' : 'unverified' }
}
function normal() {
  fetch.mockImplementation(async (_url, options) => {
    const action = options.body.request
    if (action.action === 'begin') { pgState = 'pending'; admissionId = action.admissionId }
    if (action.action === 'apply') pgState = 'applied'
    return response(action.action)
  })
}
beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); vi.stubGlobal('$fetch', fetch); pgState = 'approved'; admissionId = null; normal() })
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals() })
it('runs four explicitly confirmed steps without automatically dispatching the next step', async () => {
  const host = await mount(Admission, props())
  expect(fetch).toHaveBeenCalledExactlyOnceWith(`/api/agency/page-studio/sites/${siteId}/transfer-requests/${requestId}/recovery/admission`, { method: 'POST', retry: 0, body: { expectedRevision: 5, request: { action: 'read' } } })
  for (const [index, label] of ['Start preparation', 'Verify website preparation', 'Record verified admission', 'Enable approved admission'].entries()) {
    await click(host, label); expect(fetch).toHaveBeenCalledTimes(index + 1)
    await click(host, 'Confirm readiness step'); expect(fetch).toHaveBeenCalledTimes(index + 2)
  }
  expect(host.textContent).toContain('Transfer readiness verified')
  expect(host.textContent).toContain('have not been run here')
  const actions = fetch.mock.calls.slice(1).map(([, options]) => options.body.request)
  expect(new Set(actions.map(action => action.admissionId)).size).toBe(1)
  expect(actions[0].prepareEventId).not.toBe(actions[0].enableEventId)
  expect(fetch.mock.calls.every(([, options]) => options.retry === 0)).toBe(true)
})
it.each(['begin', 'prepare', 'apply', 'enable'])('replays the identical uncertain %s after a server advance and reload', async lostAction => {
  let host = await mount(Admission, props())
  const steps = ['begin', 'prepare', 'apply', 'enable'], labels = ['Start preparation', 'Verify website preparation', 'Record verified admission', 'Enable approved admission']
  for (let i = 0; i < steps.indexOf(lostAction); i++) { await click(host, labels[i]); await click(host, 'Confirm readiness step') }
  await click(host, labels[steps.indexOf(lostAction)])
  fetch.mockImplementationOnce(async (_url, options) => {
    if (lostAction === 'begin') { pgState = 'pending'; admissionId = options.body.request.admissionId }
    if (lostAction === 'apply') pgState = 'applied'
    throw Error('lost reply')
  })
  await click(host, 'Confirm readiness step')
  const original = structuredClone(fetch.mock.calls.at(-1)![1].body.request)
  const count = fetch.mock.calls.length
  expect(host.textContent).toContain('could not be confirmed'); expect(button(host, 'Start preparation')).toBeUndefined()
  cleanup(); host = await mount(Admission, props())
  expect(fetch).toHaveBeenCalledTimes(count + 1)
  expect(host.textContent).toContain('Fresh verification required')
  await click(host, 'Check the same step'); await click(host, 'Confirm readiness step')
  expect(fetch.mock.calls.at(-1)![1].body.request).toEqual(original)
})
it('refresh never infers remote readiness from an applied database record', async () => {
  pgState = 'applied'; admissionId = id(9)
  const host = await mount(Admission, props())
  expect(host.textContent).not.toContain('Transfer readiness verified')
  await click(host, 'Enable approved admission'); await click(host, 'Confirm readiness step')
  expect(host.textContent).toContain('Transfer readiness verified')
  await click(host, 'Refresh saved readiness')
  expect(host.textContent).not.toContain('Transfer readiness verified')
  expect(button(host, 'Enable approved admission')).toBeDefined()
})
it('pending reload requires explicit preparation verification before apply', async () => {
  pgState = 'pending'; admissionId = id(9)
  const host = await mount(Admission, props())
  expect(button(host, 'Record verified admission')).toBeUndefined()
  await click(host, 'Verify website preparation'); await click(host, 'Confirm readiness step')
  expect(button(host, 'Record verified admission')).toBeDefined()
})
it.each(['siteId', 'actorKey'])('discards late mutation response after %s changes', async key => {
  const values = props(), host = await mount(Admission, values), later = deferred()
  await click(host, 'Start preparation'); fetch.mockReturnValueOnce(later.promise); await click(host, 'Confirm readiness step')
  const original = fetch.mock.calls.at(-1)![1].body.request
  Object.assign(values, { [key]: key === 'siteId' ? otherSite : 'operator-b' }); await flush()
  later.resolve({ ...response('begin'), pgState: 'pending', admissionId: original.admissionId }); await flush()
  expect(button(host, 'Verify website preparation')).toBeUndefined()
})
it('invalidates confirmations on blur and requires a fresh authenticated read', async () => {
  const host = await mount(Admission, props())
  await click(host, 'Start preparation'); window.dispatchEvent(new Event('blur')); await flush()
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(button(host, 'Start preparation')).toBeUndefined(); expect(fetch).toHaveBeenCalledTimes(1)
  await click(host, 'Refresh saved readiness'); expect(button(host, 'Start preparation')).toBeDefined()
})
it('rechecks the review deadline at confirmation', async () => {
  const host = await mount(Admission, props()); await click(host, 'Start preparation')
  const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(deadline) + 1)
  await click(host, 'Confirm readiness step'); expect(fetch).toHaveBeenCalledTimes(1); now.mockRestore()
})
it('rejects mismatched scope, remote state or admission replies', async () => {
  fetch.mockResolvedValueOnce({ ...response('read'), siteId: otherSite })
  const host = await mount(Admission, props()); expect(button(host, 'Start preparation')).toBeUndefined()
  await click(host, 'Refresh saved readiness'); await click(host, 'Start preparation')
  fetch.mockResolvedValueOnce({ ...response('begin'), pgState: 'pending', admissionId: id(99) })
  await click(host, 'Confirm readiness step'); expect(host.textContent).toContain('could not be confirmed')
  expect(button(host, 'Verify website preparation')).toBeUndefined()
})
it('does not replay stored work against a different saved admission', async () => {
  let host = await mount(Admission, props()); await click(host, 'Start preparation'); fetch.mockRejectedValueOnce(Error('lost')); await click(host, 'Confirm readiness step')
  pgState = 'pending'; admissionId = id(99)
  cleanup(); host = await mount(Admission, props())
  expect(button(host, 'Check the same step')).toBeUndefined(); expect(button(host, 'Start preparation')).toBeUndefined()
})

it.each(['begin', 'prepare'])('lets an operator explicitly use a newer applied state after another tab advances past %s', async lostAction => {
  let host = await mount(Admission, props())
  if (lostAction === 'prepare') { await click(host, 'Start preparation'); await click(host, 'Confirm readiness step') }
  await click(host, lostAction === 'begin' ? 'Start preparation' : 'Verify website preparation')
  fetch.mockImplementationOnce(async (_url, options) => { admissionId = options.body.request.admissionId; pgState = 'applied'; throw Error('lost and advanced elsewhere') })
  await click(host, 'Confirm readiness step')
  cleanup(); host = await mount(Admission, props())
  expect(button(host, 'Check the same step')).toBeUndefined()
  expect(button(host, 'Enable approved admission')).toBeUndefined()
  const count = fetch.mock.calls.length
  await click(host, 'Use newer saved state')
  expect(fetch).toHaveBeenCalledTimes(count)
  expect(button(host, 'Enable approved admission')).toBeDefined()
  expect(host.textContent).toContain('Fresh verification required')
  cleanup(); host = await mount(Admission, props())
  expect(button(host, 'Enable approved admission')).toBeDefined()
})
