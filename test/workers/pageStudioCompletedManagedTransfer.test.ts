import { beforeEach, expect, it, vi } from 'vitest'
import fixture from '../fixtures/pageStudioManagedTransferDestinationAuthoring.json'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

const state = vi.hoisted(() => ({ allowed: true, locked: false, completion: null as unknown, request: null as unknown, retained: false, lostAck: false, authorityHook: null as null | (() => void), calls: [] as string[] }))
vi.mock('~~/workers/page-studio-management/src/managedTransferDestinationAuthoring', () => ({
  withCurrentCompletedManagedTransferAuthority: async (_input: unknown, work: (db: unknown, context: unknown) => Promise<unknown>) => {
    state.authorityHook?.()
    state.authorityHook = null
    if (!state.allowed)
      throw Object.assign(new Error('Owner revoked'), { statusCode: 403 })
    if (!state.completion)
      throw Object.assign(new Error('No completion'), { statusCode: 409 })
    state.locked = true
    try {
      return await work({}, { completion: structuredClone(state.completion) })
    } finally {
      state.locked = false
    }
  }, readManagedTransferDestinationAuthoring: async () => structuredClone(state.request)
}))
vi.mock('~~/workers/page-studio-management/src/managedTransferSourceRetention', () => ({ coordinateManagedTransferSourceRetention: async (input: {
  action: string
  operationId: string
}) => {
  expect(state.locked).toBe(false)
  state.calls.push(input.action)
  if (input.action === 'retain') {
    state.retained = true
    if (state.lostAck)
      throw new Error('Lost ack')
  }
  return { operationId: input.operationId, state: state.retained ? 'retained' : 'retention-pending' }
} }))
const module = () => import('~~/workers/page-studio-management/src/completedManagedTransfer')
const siteId = fixture.request.completionReceipt.destination.scope.siteId
beforeEach(() => {
  state.allowed = true
  state.locked = false
  state.completion = structuredClone(fixture.request.completionReceipt)
  state.request = structuredClone(fixture.request)
  state.retained = false
  state.lostAck = false
  state.calls = []
  state.authorityHook = null
})
async function setup(initial: 'ready' | 'not-started' | 'disabled' = 'ready') {
  let current = initial
  const read = vi.fn(async (request: unknown) => {
    expect(state.locked).toBe(false)
    return { operationId: fixture.request.operationId, intentDigest: fixture.request.intentDigest, requestDigest: await collectionDigest(request), state: current, ...(current === 'ready' ? { grantDigest: fixture.grant.digest } : {}) }
  })
  const install = vi.fn(async (request: unknown) => {
    current = 'ready'
    return read(request)
  })
  const dependencies = { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONER: { readManagedTransferDestinationAuthoring: read, installManagedTransferDestinationAuthoring: install } } }
  const call = async (action: string) => (await module()).coordinateCompletedManagedTransfer({ siteId, action }, dependencies)
  return { call, read, install, dependencies }
}
it('status is read-only and preserves ready editor with independently pending source retention', async () => {
  const c = await setup()
  expect(await c.call('status')).toEqual({ siteId, completed: true, editorConnection: 'ready', sourceRetention: 'pending', canRetryConnection: false, canRetryRetention: true })
  expect(c.install).not.toHaveBeenCalled()
  expect(state.calls).toEqual(['status'])
})
it('connect is explicit only from verified pending and never retains source automatically', async () => {
  const c = await setup('not-started')
  expect(await c.call('status')).toMatchObject({ editorConnection: 'pending', canRetryConnection: true })
  expect(c.install).not.toHaveBeenCalled()
  expect(await c.call('connect')).toMatchObject({ editorConnection: 'ready', sourceRetention: 'pending' })
  expect(c.install).toHaveBeenCalledTimes(1)
  expect(state.calls).not.toContain('retain')
})
it('retain lost acknowledgement performs one read-only recovery and no automatic second write or editor install', async () => {
  const c = await setup()
  state.lostAck = true
  expect(await c.call('retain')).toMatchObject({ editorConnection: 'ready', sourceRetention: 'retained', canRetryRetention: false })
  expect(state.calls).toEqual(['status', 'retain', 'status'])
  expect(c.install).not.toHaveBeenCalled()
})
it('unknown or disabled editor selection never grants a retry action or issues install', async () => {
  const c = await setup('disabled')
  expect(await c.call('connect')).toMatchObject({ editorConnection: 'unavailable', canRetryConnection: false })
  expect(c.install).not.toHaveBeenCalled()
  c.read.mockRejectedValue(new Error('Lost response'))
  expect(await c.call('status')).toMatchObject({ editorConnection: 'unavailable', canRetryConnection: false, sourceRetention: 'pending' })
})
it('requires exact ready proof and detaches a mismatched observation before authority callbacks', async () => {
  const c = await setup()
  c.read.mockImplementation(async (request: unknown) => {
    const raw = { operationId: fixture.request.operationId, intentDigest: fixture.request.intentDigest, requestDigest: await collectionDigest(request), state: 'ready', grantDigest: '0'.repeat(64) }
    state.authorityHook = () => {
      raw.grantDigest = fixture.grant.digest
    }
    return raw
  })
  expect(await c.call('status')).toMatchObject({ editorConnection: 'unavailable', canRetryConnection: false })
})
it('fails the whole operation when current authority or exact completion changes during provider work', async () => {
  const c = await setup()
  const read = c.read.getMockImplementation()!
  c.read.mockImplementation(async (request) => {
    const value = await read(request)
    state.allowed = false
    return value
  })
  await expect(c.call('status')).rejects.toMatchObject({ statusCode: 403 })
})
it('never invokes any remote or write for a site without native completion', async () => {
  const c = await setup()
  state.completion = null
  await expect(c.call('status')).rejects.toMatchObject({ statusCode: 409 })
  expect(c.read).not.toHaveBeenCalled()
  expect(state.calls).toEqual([])
})
it('rejects a changed completion after a callback instead of returning progress for the old transfer', async () => {
  const c = await setup()
  const read = c.read.getMockImplementation()!
  c.read.mockImplementation(async (request) => {
    const value = await read(request)
    ;(state.completion as { digest: string }).digest = '0'.repeat(64)
    return value
  })
  await expect(c.call('status')).rejects.toMatchObject({ statusCode: 409 })
})
it('rejects a remote mutated outgoing request and matching substituted echo', async () => {
  const c = await setup()
  c.read.mockImplementation(async (request: unknown) => {
    const changed = request as { operationId: string }
    changed.operationId = '00000000-0000-4000-8000-000000000009'
    return { operationId: changed.operationId, intentDigest: fixture.request.intentDigest, requestDigest: await collectionDigest(request), state: 'ready', grantDigest: fixture.grant.digest }
  })
  expect(await c.call('status')).toMatchObject({ editorConnection: 'unavailable', canRetryConnection: false })
  expect(state.request).toEqual(fixture.request)
})
it('does not retry an uncertain install and only later status may observe the result', async () => {
  const c = await setup('not-started')
  c.install.mockRejectedValue(new Error('Lost install acknowledgement'))
  expect(await c.call('connect')).toMatchObject({ editorConnection: 'unavailable', canRetryConnection: false })
  expect(c.install).toHaveBeenCalledTimes(1)
  expect(state.calls).not.toContain('retain')
})
