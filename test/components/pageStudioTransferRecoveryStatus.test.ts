// @vitest-environment happy-dom
import { reactive } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Recovery from '~~/app/components/page-studio/TransferRecoveryStatus.client.vue'
import { button, cleanup, click, deferred, flush, mount, otherSite, requestId, siteId } from './pageStudioTransferTestSupport'

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
  [head, 'Recovery review open'], [{ ...head, state: 'approved', version: 2 }, 'Recovery review approved'], [null, 'No recovery review yet'],
  [{ ...head, expired: true }, 'Recovery review expired'],
  [{ ...head, state: 'revoked', version: 2, expired: true }, 'Recovery review revoked']
])('explains saved state without offering or sending transfer mutations', async (recovery, label) => {
  fetch.mockResolvedValue(view(recovery))
  const host = await mount(Recovery, props())
  expect(host.textContent).toContain(label)
  expect(host.querySelectorAll('button')).toHaveLength(label === 'Recovery review approved' ? 2 : 1)
  expect(button(host, 'Refresh recovery status')).toBeDefined()
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

const inspectResult = { siteId, requestId, revision: 5, recoveryId: head.recoveryId,
  state: 'observed', historical: false, digest: 'b'.repeat(64),
  observedStartedAt: '2026-10-23T00:00:00.000Z', observedCompletedAt: '2026-10-23T00:00:01.000Z' }
it('opens only after explicit confirmation and never runs inspection automatically', async () => {
  fetch.mockResolvedValue({ ...view(null), allowedActions: ['open'] })
  const host = await mount(Recovery, props())
  await click(host, 'Open recovery review')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('one hour')
  fetch.mockImplementationOnce(async (_url, options) => ({ ...view(), recovery: { ...head, recoveryId: options.body.recoveryId, deadline: options.body.deadline }, allowedActions: ['revoke'] }))
  await click(host, 'Open review')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', retry: 0, body: { action: 'open', expectedRevision: 5, expectedHeadVersion: null } })
  expect(host.textContent).toContain('Inspect retained transfer')
})
it('explicitly captures one inspection and shows evidence without claiming transfer readiness', async () => {
  fetch.mockResolvedValue({ ...view(), allowedActions: ['revoke'] })
  const host = await mount(Recovery, props())
  fetch.mockImplementationOnce(async (_url, options) => ({ ...inspectResult, captureId: options.body.captureId }))
  await click(host, 'Inspect retained transfer')
  expect(fetch.mock.calls[1][0]).toBe(`/api/agency/page-studio/sites/${siteId}/transfer-requests/${requestId}/recovery/inspect`)
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', retry: 0, body: { action: 'inspect', recoveryId: head.recoveryId, expectedHeadVersion: 1, expectedRevision: 5 } })
  expect(host.textContent).toContain('Inspection recorded')
  expect(host.textContent).toContain('Further checks and approvals')
  expect(button(host, 'Inspect retained transfer')?.disabled).toBe(true)
})
it('lost inspection acknowledgement retains the same capture ID for an explicit retry', async () => {
  fetch.mockResolvedValue({ ...view(), allowedActions: ['revoke'] })
  const host = await mount(Recovery, props())
  fetch.mockRejectedValueOnce(Error('secret failure'))
  await click(host, 'Inspect retained transfer')
  const original = fetch.mock.calls[1][1].body.captureId
  expect(host.textContent).toContain('Inspection not confirmed')
  expect(host.textContent).not.toContain('secret failure')
  expect(fetch).toHaveBeenCalledTimes(2)
  fetch.mockImplementationOnce(async (_url, options) => ({ ...inspectResult, historical: true, captureId: options.body.captureId }))
  await click(host, 'Check this inspection')
  expect(fetch.mock.calls[2][1].body.captureId).toBe(original)
  expect(host.textContent).toContain('Saved inspection retrieved')
})
it('discards a late inspection when the site changes', async () => {
  fetch.mockResolvedValue({ ...view(), allowedActions: ['revoke'] })
  const values = props(), host = await mount(Recovery, values), pending = deferred()
  fetch.mockReturnValueOnce(pending.promise)
  await click(host, 'Inspect retained transfer')
  const captureId = fetch.mock.calls[1][1].body.captureId
  values.siteId = otherSite
  fetch.mockRejectedValue({ statusCode: 403 })
  await flush()
  pending.resolve({ ...inspectResult, captureId })
  await flush()
  expect(host.textContent).not.toContain('Inspection recorded')
})
it('rejects an inspection receipt from another capture', async () => {
  fetch.mockResolvedValue({ ...view(), allowedActions: ['revoke'] })
  const host = await mount(Recovery, props())
  fetch.mockResolvedValueOnce({ ...inspectResult, captureId: otherSite })
  await click(host, 'Inspect retained transfer')
  expect(host.textContent).toContain('Inspection not confirmed')
  expect(host.textContent).not.toContain('Inspection recorded')
})
it('revokes only after confirmation and clears saved inspection', async () => {
  fetch.mockResolvedValue({ ...view(), allowedActions: ['revoke'] })
  const host = await mount(Recovery, props())
  await click(host, 'Close review')
  expect(fetch).toHaveBeenCalledTimes(1)
  fetch.mockResolvedValueOnce(view({ ...head, state: 'revoked', version: 2 }))
  await click(host, 'Confirm close')
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'POST', retry: 0, body: { action: 'revoke', recoveryId: head.recoveryId, expectedHeadVersion: 1 } })
  expect(host.textContent).toContain('Recovery review revoked')
})

it('approved review allows revocation without exposing inspection or execution', async () => {
  fetch.mockResolvedValue({ ...view({ ...head, state: 'approved', version: 2 }), allowedActions: ['revoke'] })
  const host = await mount(Recovery, props())
  expect(host.textContent).toContain('Check saved readiness')
  expect(host.textContent).not.toContain('Inspect retained transfer')
  expect(fetch).toHaveBeenCalledOnce()
})

it('opens admission controls explicitly and reads their saved state without starting preparation', async () => {
  fetch.mockResolvedValueOnce(view({ ...head, state: 'approved', version: 2 }))
  const host = await mount(Recovery, props())
  expect(fetch).toHaveBeenCalledOnce()
  fetch.mockResolvedValueOnce({ siteId, requestId, expectedRevision: 5, action: 'read', admissionId: null,
    review: { reviewId: otherSite, revision: 1, reviewDigest: 'b'.repeat(64) }, deadline: head.deadline, pgState: 'approved', d1State: 'unverified' })
  await click(host, 'Check transfer readiness')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1][1].body.request).toEqual({ action: 'read' })
  expect(button(host, 'Start preparation')).toBeDefined()
})
