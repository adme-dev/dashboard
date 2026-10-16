import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { callManagedTransferCopyExecution } from '~~/server/utils/pageStudio/managedTransferCopyExecutionManagement'
import { handleManagedTransferCopyExecutionManagement } from '~~/workers/page-studio-management/src/managedTransferCopyExecutionManagement'

const core = vi.hoisted(() => ({ coordinateManagedTransferCopyGraph: vi.fn(), authorizeManagedTransferCopyGraph: vi.fn() }))
vi.mock('~~/workers/page-studio-management/src/managedTransferCopyCoordinator', () => core)
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
const input = () => ({ operationId: randomUUID(), intentDigest: 'a'.repeat(64), action: 'verify' })
const run = vi.fn(async () => {
  throw new Error('Unexpected SQL')
})
it('keeps a captured private method, receiver and original reference across awaits', async () => {
  const request = input(), service = { managedTransferCopyGraphExecution: async function (wire: Record<string, unknown>) {
    expect(this).toBe(service)
    const requestDigest = await collectionDigest(wire)
    wire.intentDigest = 'b'.repeat(64)
    return { ok: true, requestDigest, value: { operationId: request.operationId, state: 'verified', proofDigest: 'c'.repeat(64) } }
  } }
  const result = callManagedTransferCopyExecution(request, { env: { ...env, PAGE_STUDIO_MANAGEMENT: service } })
  service.managedTransferCopyGraphExecution = () => {
    throw new Error('Replaced')
  }
  expect(await result).toMatchObject({ state: 'verified' })
  expect(request.intentDigest).toBe('a'.repeat(64))
})
it('never retries uncertain RPC or allows caller selected providers', async () => {
  const remote = vi.fn(async () => {
    throw new Error('Lost acknowledgement')
  })
  await expect(callManagedTransferCopyExecution(input(), { env: { ...env, PAGE_STUDIO_MANAGEMENT: { managedTransferCopyGraphExecution: remote } } })).rejects.toMatchObject({ statusCode: 503 })
  expect(remote).toHaveBeenCalledTimes(1)
  await expect(callManagedTransferCopyExecution({ ...input(), context: {} }, { env })).rejects.toThrow()
})
it('requires exact echoed callback and matching response digest', async () => {
  const request = { operationId: randomUUID(), intentDigest: 'a'.repeat(64), action: 'authorize', authorization: { operationId: '', intentDigest: 'a'.repeat(64), action: 'inspect', requestDigest: 'b'.repeat(64), contextDigest: 'c'.repeat(64) } }
  request.authorization.operationId = request.operationId
  const remote = async (wire: unknown) => ({ ok: true, requestDigest: await collectionDigest(wire), value: { ...request.authorization, contextDigest: 'f'.repeat(64) } })
  await expect(callManagedTransferCopyExecution(request, { env: { ...env, PAGE_STUDIO_MANAGEMENT: { managedTransferCopyGraphExecution: remote } } })).rejects.toMatchObject({ statusCode: 503 })
})
it('dispatches only production requests and sanitizes private errors', async () => {
  const request = { ...input(), expectedEnvironment: 'production' }
  core.coordinateManagedTransferCopyGraph.mockResolvedValue({ operationId: request.operationId, state: 'pending' })
  expect(await handleManagedTransferCopyExecutionManagement(request, env, run)).toMatchObject({ ok: true, value: { state: 'pending' } })
  core.coordinateManagedTransferCopyGraph.mockClear()
  expect(await handleManagedTransferCopyExecutionManagement(request, { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, run)).toMatchObject({ ok: false })
  expect(core.coordinateManagedTransferCopyGraph).not.toHaveBeenCalled()
  core.coordinateManagedTransferCopyGraph.mockRejectedValue({ statusCode: 403, message: 'secret SQL' })
  const result = await handleManagedTransferCopyExecutionManagement(request, env, run)
  expect(result).toMatchObject({ ok: false, error: { statusCode: 403 } })
  expect(JSON.stringify(result)).not.toContain('secret')
})
