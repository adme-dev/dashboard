import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { coordinateManagedTransferCopyGraph } from '~~/server/utils/pageStudio/managedTransferCopyManagement'
import { handleManagedTransferCopyManagement } from '~~/workers/page-studio-management/src/managedTransferCopyManagement'

const core = vi.hoisted(() => ({ prepareManagedTransferCopyGraph: vi.fn(), readManagedTransferCopyGraph: vi.fn() }))
vi.mock('~~/workers/page-studio-management/src/managedTransferCopyAdmission', () => core)
const reference = () => ({ operationId: randomUUID(), intentDigest: 'a'.repeat(64), action: 'prepare' as const })
const runner = vi.fn(async () => {
  throw new Error('Unexpected direct database use')
})
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }

describe('private copy admission management boundary', () => {
  it('captures exact binding method and sends a detached strict original reference', async () => {
    const input = reference()
    const original = { ...input }
    const service = { managedTransferCopyGraph: vi.fn(async function (this: unknown, request: unknown) {
      expect(this).toBe(service)
      const requestDigest = await collectionDigest(request)
      ;(request as { intentDigest: string }).intentDigest = 'b'.repeat(64)
      return { ok: true, requestDigest, value: { operationId: input.operationId, state: 'copy-admitted', admissionDigest: 'c'.repeat(64) } }
    }) }
    const promise = coordinateManagedTransferCopyGraph(input, { env: { ...env, PAGE_STUDIO_MANAGEMENT: service } })
    service.managedTransferCopyGraph = vi.fn(() => {
      throw new Error('Replaced method')
    })
    expect(await promise).toEqual({ operationId: input.operationId, state: 'copy-admitted', admissionDigest: 'c'.repeat(64) })
    expect(input).toEqual(original)
  })
  it('rejects missing binding, wrong response identity, and forged digest without local fallback', async () => {
    const input = reference()
    await expect(coordinateManagedTransferCopyGraph(input, { env })).rejects.toMatchObject({ statusCode: 503 })
    for (const wrong of ['digest', 'operation']) {
      const call = vi.fn(async (request: unknown) => ({ ok: true, requestDigest: wrong === 'digest' ? 'b'.repeat(64) : await collectionDigest(request),
        value: { operationId: wrong === 'operation' ? randomUUID() : input.operationId, state: 'not-started' } }))
      await expect(coordinateManagedTransferCopyGraph(input, { env: { ...env, PAGE_STUDIO_MANAGEMENT: { managedTransferCopyGraph: call } } })).rejects.toMatchObject({ statusCode: 503 })
      expect(call).toHaveBeenCalledTimes(1)
    }
  })
  it('never replays an uncertain call or accepts caller-selected physical identities', async () => {
    const call = vi.fn(async () => {
      throw new Error('Lost acknowledgement')
    })
    await expect(coordinateManagedTransferCopyGraph(reference(), { env: { ...env, PAGE_STUDIO_MANAGEMENT: { managedTransferCopyGraph: call } } })).rejects.toMatchObject({ statusCode: 503 })
    expect(call).toHaveBeenCalledTimes(1)
    await expect(coordinateManagedTransferCopyGraph({ ...reference(), databaseId: 'untrusted' }, { env })).rejects.toThrow()
  })
  it('dispatches only production references and returns redacted admission identity', async () => {
    const request = { ...reference(), expectedEnvironment: 'production' }
    core.prepareManagedTransferCopyGraph.mockResolvedValue({ secret: 'must not leave worker' })
    const response = await handleManagedTransferCopyManagement(request, env, runner)
    expect(response).toEqual({ ok: true, requestDigest: await collectionDigest(request), value: { operationId: request.operationId,
      state: 'copy-admitted', admissionDigest: await collectionDigest({ secret: 'must not leave worker' }) } })
    expect(JSON.stringify(response)).not.toContain('secret')
    core.prepareManagedTransferCopyGraph.mockClear()
    expect(await handleManagedTransferCopyManagement(request, { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, runner)).toMatchObject({ ok: false, error: { statusCode: 503 } })
    expect(core.prepareManagedTransferCopyGraph).not.toHaveBeenCalled()
  })
  it('reads without preparing and sanitizes internal error details', async () => {
    const request = { ...reference(), action: 'read', expectedEnvironment: 'production' }
    core.readManagedTransferCopyGraph.mockResolvedValue(null)
    expect(await handleManagedTransferCopyManagement(request, env, runner)).toMatchObject({ ok: true, value: { state: 'not-started' } })
    core.readManagedTransferCopyGraph.mockRejectedValue({ statusCode: 403, message: 'database credentials and SQL' })
    const result = await handleManagedTransferCopyManagement(request, env, runner)
    expect(result).toMatchObject({ ok: false, error: { statusCode: 403 } })
    expect(JSON.stringify(result)).not.toContain('credentials')
  })
})
