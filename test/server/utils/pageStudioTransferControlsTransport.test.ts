import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { callTransferControls, callTransferWorkflow } from '~~/server/utils/pageStudio/transferControls'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { TransferWorkflowPhases } from '~~/shared/pageStudio/transferWorkflow'

const identity = { siteId: randomUUID(), requestId: randomUUID() }
const input = { ...identity, action: 'operator-status', operator: { actorId: randomUUID(), loginSessionHash: 'a'.repeat(64) } }
const value = { ...identity, revision: 5, state: 'reserved', review: null, expiresAt: new Date(Date.now() + 60000).toISOString(), allowedActions: [] }
const environment = (call: unknown, workflow = false) => ({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_MANAGEMENT: workflow
  ? { fetch: async (request: Request) => {
      expect(request.url).toBe('https://page-studio-management.internal/transfer-workflow')
      const body = await request.json()
      return Response.json(await (call as (value: unknown) => Promise<unknown>)(body), { headers: { 'x-request-digest': await collectionDigest(body) } })
    } }
  : { transferControls: call } })
it('matches the request digest and exact public identity', async () => {
  const call = vi.fn(async request => ({ ok: true, requestDigest: await collectionDigest(request), value }))
  expect(await callTransferControls(input, environment(call))).toEqual(value)
  expect(call).toHaveBeenCalledExactlyOnceWith({ ...input, expectedEnvironment: 'production' })
})
it.each(['digest', 'site', 'request', 'extra', 'null', 'list'])('rejects a mismatched %s control reply', async (kind) => {
  const call = vi.fn(async request => ({ ok: true, requestDigest: kind === 'digest' ? 'b'.repeat(64) : await collectionDigest(request),
    value: kind === 'null'
      ? null
      : kind === 'list'
        ? { requests: [], nextCursor: null }
        : { ...value,
            ...(kind === 'site' ? { siteId: randomUUID() } : {}), ...(kind === 'request' ? { requestId: randomUUID() } : {}), ...(kind === 'extra' ? { operationId: randomUUID() } : {}) } }))
  await expect(callTransferControls(input, environment(call))).rejects.toMatchObject({ statusCode: 503 })
  expect(call).toHaveBeenCalledTimes(1)
})
it('allows null only for owner status', async () => {
  const call = vi.fn(async request => ({ ok: true, requestDigest: await collectionDigest(request), value: null }))
  expect(await callTransferControls({ action: 'owner-status', siteId: identity.siteId, ownerLoginSessionHash: 'a'.repeat(64) }, environment(call))).toBeNull()
})
it('never retries a lost acknowledgement', async () => {
  const call = vi.fn().mockRejectedValue(new Error('private payload'))
  await expect(callTransferControls({ ...input, action: 'reserve', expectedRevision: 4 }, environment(call))).rejects.toMatchObject({ statusCode: 503 })
  expect(call).toHaveBeenCalledTimes(1)
})
it('captures the receiver before digest work and withholds mutation of caller input', async () => {
  const request = { ...input }
  const service = { transferControls: vi.fn(async function (this: unknown, received) {
    expect(this).toBe(service)
    received.siteId = randomUUID()
    return { ok: true, requestDigest: await collectionDigest(received), value }
  }) }
  await expect(callTransferControls(request, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_MANAGEMENT: service })).rejects.toMatchObject({ statusCode: 503 })
  expect(request.siteId).toBe(identity.siteId)
})
it.each(['valid', 'revision', 'order', 'count', 'site'])('validates workflow %s identity and phase ordering', async (kind) => {
  const request = { ...input, action: 'status', expectedRevision: 5 }
  const phases = TransferWorkflowPhases.map(phase => ({ phase, state: 'unavailable', allowedActions: [] }))
  const call = vi.fn(async received => ({ ok: true, requestDigest: await collectionDigest(received), value: {
    ...identity, revision: kind === 'revision' ? 6 : 5, ...(kind === 'site' ? { siteId: randomUUID() } : {}),
    phases: kind === 'order' ? [...phases].reverse() : kind === 'count' ? phases.slice(1) : phases
  } }))
  const result = callTransferWorkflow(request, environment(call, true))
  if (kind === 'valid') expect(await result).toMatchObject({ ...identity, revision: 5, phases })
  else await expect(result).rejects.toMatchObject({ statusCode: 503 })
})
it('preserves workflow business errors and never falls back to named RPC', async () => {
  const call = vi.fn(async request => ({ ok: false, requestDigest: await collectionDigest(request), error: { statusCode: 409, message: 'The original review changed' } }))
  await expect(callTransferWorkflow({ ...input, action: 'status', expectedRevision: 5 }, environment(call, true))).rejects.toMatchObject({ statusCode: 409, statusMessage: 'The original review changed' })
  const named = vi.fn()
  await expect(callTransferWorkflow({ ...input, action: 'status', expectedRevision: 5 }, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_MANAGEMENT: { transferWorkflow: named } })).rejects.toMatchObject({ statusCode: 503 })
  expect(named).not.toHaveBeenCalled()
})
it('rejects workflow header digest mismatch and preserves the captured request during await', async () => {
  const request = { ...input, action: 'status', expectedRevision: 5 }
  let received: Record<string, unknown> | undefined
  const fetch = vi.fn(async (wire: Request) => {
    received = await wire.json() as Record<string, unknown>
    request.expectedRevision = 99
    return Response.json({ ok: true, requestDigest: await collectionDigest(received), value: { ...identity, revision: 5, phases: TransferWorkflowPhases.map(phase => ({ phase, state: 'unavailable', allowedActions: [] })) } }, { headers: { 'x-request-digest': await collectionDigest(received) } })
  })
  expect((await callTransferWorkflow(request, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_MANAGEMENT: { fetch } })).revision).toBe(5)
  expect(received?.expectedRevision).toBe(5)
  fetch.mockResolvedValueOnce(Response.json({}, { headers: { 'x-request-digest': 'f'.repeat(64) } }))
  await expect(callTransferWorkflow(request, { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_MANAGEMENT: { fetch } })).rejects.toMatchObject({ statusCode: 503 })
})
