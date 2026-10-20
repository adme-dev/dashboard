// @vitest-environment happy-dom
import { reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Detail from '~~/app/components/page-studio/TransferRequestDetail.client.vue'
import Queue from '~~/app/components/page-studio/TransferRequests.client.vue'
import { TransferWorkflowPhases } from '~~/shared/pageStudio/transferWorkflow'
import { button, cleanup, click, control, deferred, dialog, flush, mount, otherRequest, otherSite, requestId, review, siteId } from './pageStudioTransferTestSupport'

const fetch = vi.fn(), user = ref({ id: 'operator-a', role: 'owner', custom_role_id: 'assigned-system-role' })
const props = () => reactive({ siteId, requestId, actorKey: 'operator-a:system-owner' })
const phases = () => TransferWorkflowPhases.map(phase => ({ phase, state: phase === 'resources' ? 'ready' : 'unavailable', allowedActions: phase === 'resources' ? ['verify'] : [] }))
const workflow = (rows = phases(), extra = {}) => ({ siteId, requestId, revision: 4, phases: rows, ...extra })
const reserved = () => control({ state: 'reserved', revision: 4, review, allowedActions: [] })
const posts = () => fetch.mock.calls.filter(([, options]) => options?.method === 'POST')
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('$fetch', fetch)
  vi.stubGlobal('useAuth', () => ({ user }))
  user.value = { id: 'operator-a', role: 'owner', custom_role_id: 'assigned-system-role' }
  fetch.mockImplementation(async url => url.endsWith('/workflow') ? workflow() : reserved())
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('operator retained transfer workflow', () => {
  it('GETs saved state only and renders all nine ordered phases with server actions only', async () => {
    const host = await mount(Detail, props())
    expect(posts()).toHaveLength(0)
    expect(host.querySelectorAll('ol > li')).toHaveLength(9)
    expect(host.querySelector('ol > li')?.textContent).toContain('1. Production resources')
    expect(host.textContent).toContain('Ready is not saved verification')
    expect(button(host, 'Verify')).toBeDefined()
    expect(button(host, 'Start')).toBeUndefined()
    expect(button(host, 'Complete transfer')).toBeUndefined()
    expect(host.textContent).not.toContain('Transfer completion saved')
    expect(fetch.mock.calls[1][1]).toEqual({ query: { expectedRevision: 4 } })
  })
  it('confirms one phase and merges its single-phase reply while reading the full workflow', async () => {
    const host = await mount(Detail, props()), nextRead = deferred()
    fetch.mockImplementation(async (url, options) => {
      if (options?.method === 'POST') return workflow([{ phase: 'resources', state: 'verified', allowedActions: [] }])
      if (url.endsWith('/workflow')) return nextRead.promise
      return reserved()
    })
    await click(host, 'Verify')
    expect(posts()).toHaveLength(0)
    expect(dialog(host)?.textContent).toContain('Production resources')
    await click(dialog(host)!, 'Confirm action')
    expect(posts()).toHaveLength(1)
    expect(posts()[0][1].body).toEqual({ expectedRevision: 4, phase: 'resources', action: 'verify' })
    expect(host.querySelectorAll('ol > li')).toHaveLength(9)
    expect(host.querySelector('ol > li')?.textContent).toContain('verified')
    expect(button(host, 'Verify')).toBeUndefined()
    nextRead.resolve(workflow())
    await flush()
    expect(host.textContent).not.toContain('Transfer completion saved')
  })
  it.each(['review', 'reserve'])('requires confirmation for %s with the exact revision', async (action) => {
    fetch.mockResolvedValue(control({ state: action === 'review' ? 'requested' : 'approved', revision: 3, review, allowedActions: [action] }))
    const host = await mount(Detail, props())
    await click(host, action === 'review' ? 'Review saved website' : 'Reserve preparation')
    expect(posts()).toHaveLength(0)
    await click(dialog(host)!, 'Confirm action')
    expect(posts()[0][1].body).toEqual({ action, expectedRevision: 3 })
    expect(posts()).toHaveLength(1)
  })
  it.each(['resume', 'complete'])('offers %s only explicitly and does not chain another phase', async (action) => {
    const phase = action === 'complete' ? 'completion' : 'resources'
    const rows = phases().map(row => ({ ...row, state: 'ready', allowedActions: row.phase === phase ? [action] : [] }))
    fetch.mockImplementation(async url => url.endsWith('/workflow') ? workflow(rows) : reserved())
    const host = await mount(Detail, props())
    await click(host, action === 'complete' ? 'Complete transfer' : 'Resume')
    expect(posts()).toHaveLength(0)
    fetch.mockImplementation(async (url, options) => options?.method === 'POST' ? workflow([{ phase, state: action === 'complete' ? 'completed' : 'pending', allowedActions: [] }]) : url.endsWith('/workflow') ? workflow(rows) : reserved())
    await click(dialog(host)!, 'Confirm action')
    expect(posts()).toHaveLength(1)
    expect(posts()[0][1].body).toEqual({ expectedRevision: 4, phase, action })
  })
  it('suppresses duplicate confirmation clicks and never retries a lost acknowledgement', async () => {
    const host = await mount(Detail, props()), pending = deferred()
    fetch.mockImplementation((url, options) => options?.method === 'POST' ? pending.promise : Promise.resolve(url.endsWith('/workflow') ? workflow() : reserved()))
    await click(host, 'Verify')
    const confirm = button(dialog(host)!, 'Confirm action')!
    confirm.click()
    confirm.click()
    await flush()
    expect(posts()).toHaveLength(1)
    pending.reject(new Error('lost reply'))
    await flush()
    expect(posts()).toHaveLength(1)
    expect(host.textContent).toContain('Nothing is retried automatically')
    expect(button(host, 'Verify')).toBeDefined()
  })
  it.each(['actorKey', 'siteId', 'requestId'])('removes confirmation and suppresses late work across %s change', async (field) => {
    const values = props(), host = await mount(Detail, values), pending = deferred()
    await click(host, 'Verify')
    fetch.mockImplementation((_url, options) => options?.method === 'POST' ? pending.promise : Promise.reject({ statusCode: 403 }))
    const confirm = button(dialog(host)!, 'Confirm action')!
    confirm.click()
    await flush()
    values[field] = field === 'siteId' ? otherSite : field === 'requestId' ? otherRequest : 'operator-b'
    await flush()
    expect(dialog(host)).toBeNull()
    pending.resolve(workflow([{ phase: 'completion', state: 'completed', allowedActions: [] }]))
    await flush()
    expect(posts()).toHaveLength(1)
    expect(host.textContent).not.toContain('Transfer completion saved')
    expect(button(host, 'Verify')).toBeUndefined()
  })
  it.each(['revision', 'requestId', 'siteId'])('rejects mismatched workflow %s instead of offering actions', async (field) => {
    fetch.mockImplementation(async url => url.endsWith('/workflow') ? workflow(phases(), { [field]: field === 'revision' ? 8 : otherRequest }) : reserved())
    const host = await mount(Detail, props())
    expect(button(host, 'Verify')).toBeUndefined()
    expect(host.textContent).toContain('could not be confirmed')
  })
  it('removes retained phase actions when the refreshed control needs attention', async () => {
    const host = await mount(Detail, props())
    await click(host, 'Verify')
    fetch.mockImplementation(async (url, options) => {
      if (options?.method === 'POST') return workflow([{ phase: 'resources', state: 'ready', allowedActions: ['verify'] }])
      return control({ state: 'needs-attention', revision: 4, review, allowedActions: [] })
    })
    await click(dialog(host)!, 'Confirm action')
    expect(host.querySelectorAll('ol > li')).toHaveLength(0)
    expect(button(host, 'Verify')).toBeUndefined()
    expect(host.textContent).toContain('original authority needs attention')
    expect(posts()).toHaveLength(1)
  })
  it('uses completion state alone to announce completion', async () => {
    fetch.mockImplementation(async url => url.endsWith('/workflow') ? workflow(phases().map(row => row.phase === 'completion' ? { ...row, state: 'completed', allowedActions: [] } : row)) : reserved())
    const host = await mount(Detail, props())
    expect(host.textContent).toContain('Transfer completion saved')
  })
})
describe('operator queue role and identity changes', () => {
  it('allows an assigned owner candidate to reach the server and renders no mutation on entry', async () => {
    fetch.mockResolvedValue({ requests: [reserved()], nextCursor: null })
    const host = await mount(Queue)
    expect(fetch).toHaveBeenCalledOnce()
    expect(posts()).toHaveLength(0)
    expect(button(host, 'Open request')).toBeDefined()
  })
  it('locks queue selection and refresh while its mounted detail mutation is pending', async () => {
    const pending = deferred()
    fetch.mockImplementation(async (url, options) => {
      if (options?.method === 'POST') return pending.promise
      if (url.endsWith('/transfer-requests')) return { requests: [reserved(), control({ siteId: otherSite, requestId: otherRequest })], nextCursor: otherRequest }
      return url.endsWith('/workflow') ? workflow() : reserved()
    })
    const host = await mount(Queue, {}, { PageStudioTransferRequestDetail: Detail })
    await click(host, 'Open request')
    await click(host, 'Verify')
    button(dialog(host)!, 'Confirm action')!.click()
    await flush()
    expect(posts()).toHaveLength(1)
    expect(button(host, 'Refresh queue')?.disabled).toBe(true)
    expect(button(host, 'Next')?.disabled).toBe(true)
    expect([...host.querySelectorAll('button')].filter(value => value.textContent === 'Open request').every(value => value.disabled)).toBe(true)
    pending.resolve(workflow([{ phase: 'resources', state: 'verified', allowedActions: [] }]))
    await flush()
    expect(button(host, 'Refresh queue')?.disabled).toBe(false)
  })
  it('denied server results offer no stale action or detail', async () => {
    fetch.mockRejectedValue({ statusCode: 403 })
    const host = await mount(Queue)
    expect(button(host, 'Open request')).toBeUndefined()
    expect(host.textContent).toContain('Check your platform access')
  })
  it('suppresses late results when the same user role assignment changes', async () => {
    const pending = deferred()
    fetch.mockReturnValueOnce(pending.promise).mockRejectedValue({ statusCode: 403 })
    const host = await mount(Queue)
    user.value = { ...user.value, custom_role_id: 'different-role' }
    await flush()
    pending.resolve({ requests: [reserved()], nextCursor: null })
    await flush()
    expect(button(host, 'Open request')).toBeUndefined()
    expect(posts()).toHaveLength(0)
  })
})
