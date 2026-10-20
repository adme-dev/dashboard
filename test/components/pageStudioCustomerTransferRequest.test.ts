// @vitest-environment happy-dom
import { reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Request from '~~/app/components/studio/CustomerTransferRequest.client.vue'
import { apps, button, cleanup, click, control, deferred, dialog, flush, mount, otherSite, requestId, review, siteId } from './pageStudioTransferTestSupport'

const fetch = vi.fn()
const props = () => reactive({ siteId, websiteName: 'Flower shop', accountKey: 'owner-a', active: true })
const posts = () => fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('$fetch', fetch)
  fetch.mockResolvedValue(null)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('customer saved preparation controls', () => {
  it('reads on entry and requires confirmation before requesting preparation', async () => {
    const host = await mount(Request, props())
    expect(posts()).toHaveLength(0)
    expect(fetch.mock.calls[0][0]).toBe(`/api/portal/page-studio/customer/sites/${siteId}/transfer-request`)
    await click(host, 'Request preparation')
    expect(posts()).toHaveLength(0)
    expect(dialog(host)?.textContent).toContain('Flower shop')
    fetch.mockImplementation(async (_url, options) => options?.method === 'POST' ? control({ requestId: options.body.requestId }) : null)
    await click(dialog(host)!, 'Request preparation')
    expect(posts()).toHaveLength(1)
    expect(posts()[0][1].body).toEqual({ action: 'request', requestId: expect.any(String) })
    expect(host.textContent).toContain('Preparation requested')
  })
  it('shows original review details and approves the exact request and revision', async () => {
    fetch.mockResolvedValue(control({ state: 'reviewed', revision: 2, review, allowedActions: ['approve', 'revoke'] }))
    const host = await mount(Request, props())
    expect(host.textContent).toContain(review.checkpointId)
    expect(host.textContent).toContain('7 items')
    expect(host.textContent).not.toContain(review.applicationId)
    await click(host, 'Review approval')
    expect(posts()).toHaveLength(0)
    expect(dialog(host)?.textContent).toContain(review.checkpointId)
    fetch.mockResolvedValueOnce(control({ state: 'approved', revision: 3, review, allowedActions: ['revoke'] }))
    await click(dialog(host)!, 'Approve this website')
    expect(posts()[0][1].body).toEqual({ action: 'approve', requestId, expectedRevision: 2 })
    expect(host.textContent).toContain('Approval saved')
  })
  it.each(['reserving', 'reserved'])('removes cancellation at %s', async (state) => {
    fetch.mockResolvedValue(control({ state, review, allowedActions: [] }))
    const host = await mount(Request, props())
    expect(button(host, 'Cancel request')).toBeUndefined()
    expect(host.textContent).toContain('cancellation is no longer available')
  })
  it('keeps the same request UUID after an uncertain reply and an overview refresh', async () => {
    const values = props()
    const host = await mount(Request, values)
    fetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') throw new Error('lost reply')
      return null
    })
    await click(host, 'Request preparation')
    await click(dialog(host)!, 'Request preparation')
    const original = posts()[0][1].body.requestId
    expect(posts()).toHaveLength(1)
    values.active = false
    await flush()
    values.active = true
    await flush()
    await click(host, 'Request preparation')
    await click(dialog(host)!, 'Request preparation')
    expect(posts()).toHaveLength(2)
    expect(posts()[1][1].body.requestId).toBe(original)
  })
  it('reuses parent-held request identity after remount but clears it for another account', async () => {
    let retained: string | null = null
    const values = { ...props(), 'onUpdate:pendingRequestId': (value: string | null) => {
      retained = value
    } }
    const first = await mount(Request, values)
    fetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') throw new Error('lost reply')
      return null
    })
    await click(first, 'Request preparation')
    await click(dialog(first)!, 'Request preparation')
    const original = posts()[0][1].body.requestId
    expect(retained).toBe(original)
    apps.pop()!.unmount()
    const next = reactive({ ...values, pendingRequestId: retained })
    const second = await mount(Request, next)
    await click(second, 'Request preparation')
    await click(dialog(second)!, 'Request preparation')
    expect(posts()[1][1].body.requestId).toBe(original)
    next.accountKey = 'owner-b'
    await flush()
    await click(second, 'Request preparation')
    await click(dialog(second)!, 'Request preparation')
    expect(posts()[2][1].body.requestId).not.toBe(original)
  })
  it('recovers a saved request with GET after a lost reply without another mutation', async () => {
    const host = await mount(Request, props())
    fetch.mockImplementation(async (_url, options) => {
      if (options?.method === 'POST') throw new Error('lost reply')
      return control()
    })
    await click(host, 'Request preparation')
    await click(dialog(host)!, 'Request preparation')
    expect(posts()).toHaveLength(1)
    expect(host.textContent).toContain('Preparation requested')
    expect(button(host, 'Request preparation')).toBeUndefined()
  })
  it.each(['siteId', 'accountKey'])('suppresses late reads and removes confirmation across %s change', async (field) => {
    const first = deferred(), second = deferred()
    fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const values = props(), host = await mount(Request, values)
    values[field] = field === 'siteId' ? otherSite : 'owner-b'
    await flush()
    first.resolve(control({ state: 'reviewed', review, allowedActions: ['approve'] }))
    await flush()
    expect(host.textContent).not.toContain(review.checkpointId)
    expect(button(host, 'Review approval')).toBeUndefined()
    second.resolve(null)
    await flush()
    await click(host, 'Request preparation')
    expect(dialog(host)).not.toBeNull()
    values.accountKey = 'owner-c'
    await flush()
    expect(dialog(host)).toBeNull()
    expect(posts()).toHaveLength(0)
  })
  it('keeps a pending POST locked across overview suspension and resume', async () => {
    const pending = deferred(), values = props(), host = await mount(Request, values)
    fetch.mockImplementation((_url, options) => options?.method === 'POST' ? pending.promise : Promise.resolve(null))
    await click(host, 'Request preparation')
    button(dialog(host)!, 'Request preparation')!.click()
    await flush()
    values.active = false
    await flush()
    values.active = true
    await flush()
    expect(button(host, 'Refresh preparation')?.disabled).toBe(true)
    expect(button(host, 'Request preparation')).toBeUndefined()
    expect(posts()).toHaveLength(1)
    pending.resolve(control({ requestId: posts()[0][1].body.requestId }))
    await flush()
    expect(button(host, 'Refresh preparation')?.disabled).toBe(false)
    expect(posts()).toHaveLength(1)
  })
  it('suppresses a late mutation and never duplicates a pending confirmation', async () => {
    const pending = deferred(), values = props(), host = await mount(Request, values)
    fetch.mockImplementation((_url, options) => options?.method === 'POST' ? pending.promise : Promise.resolve(null))
    await click(host, 'Request preparation')
    const confirm = button(dialog(host)!, 'Request preparation')!
    confirm.click()
    confirm.click()
    await flush()
    expect(posts()).toHaveLength(1)
    values.accountKey = 'owner-b'
    await flush()
    pending.resolve(control({ requestId: posts()[0][1].body.requestId, state: 'approved' }))
    await flush()
    expect(host.textContent).not.toContain('Approval saved')
    expect(dialog(host)).toBeNull()
  })
  it('ignores late data after unmount and rejects wrong-site replies', async () => {
    fetch.mockResolvedValue(control({ siteId: otherSite }))
    const host = await mount(Request, props())
    expect(host.textContent).not.toContain('Preparation requested')
    expect(button(host, 'Request preparation')).toBeUndefined()
    const pending = deferred()
    fetch.mockReturnValue(pending.promise)
    await click(host, 'Refresh preparation')
    apps.pop()!.unmount()
    const calls = fetch.mock.calls.length
    pending.resolve(control())
    await flush()
    expect(fetch).toHaveBeenCalledTimes(calls)
  })
})
