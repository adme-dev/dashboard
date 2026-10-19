import { describe, expect, it, vi } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { authorizeManagedTransferSourceRetention } from '~~/server/utils/pageStudio/managedTransferSourceRetention'
import { handleManagedTransferSourceRetentionManagement } from '~~/workers/page-studio-management/src/managedTransferSourceRetentionManagement'

const core = vi.hoisted(() => ({ authorizeManagedTransferSourceRetention: vi.fn() }))
vi.mock('~~/workers/page-studio-management/src/managedTransferSourceRetention', () => core)
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
const authorization = () => ({ action: 'retain', request: { operationId: 'test' } })
describe('fixed terminal source retention transport', () => {
  it('captures the original receiver, input and request digest despite service mutation', async () => {
    const input = authorization(), original = structuredClone(input)
    const service = { managedTransferSourceRetention: async function (wire: { authorization: unknown }) {
      expect(this).toBe(service)
      const requestDigest = await collectionDigest(wire)
      wire.authorization = { action: 'other' }
      return { ok: true, requestDigest, value: original }
    } }
    const pending = authorizeManagedTransferSourceRetention(input, { env: { ...env, PAGE_STUDIO_MANAGEMENT: service } })
    service.managedTransferSourceRetention = () => {
      throw new Error('replaced')
    }
    expect(await pending).toEqual(original)
    expect(input).toEqual(original)
  })
  it('rejects substituted authorization and response identity', async () => {
    for (const changed of ['value', 'digest']) {
      const remote = async (request: unknown) => ({ ok: true, requestDigest: changed === 'digest' ? 'f'.repeat(64) : await collectionDigest(request), value: changed === 'value' ? { action: 'read' } : authorization() })
      await expect(authorizeManagedTransferSourceRetention(authorization(), { env: { ...env, PAGE_STUDIO_MANAGEMENT: { managedTransferSourceRetention: remote } } })).rejects.toMatchObject({ statusCode: 503 })
    }
  })
  it('does not replay an uncertain callback or call under wrong environment', async () => {
    const remote = vi.fn(async () => {
      throw new Error('lost response')
    })
    await expect(authorizeManagedTransferSourceRetention(authorization(), { env: { ...env, PAGE_STUDIO_MANAGEMENT: { managedTransferSourceRetention: remote } } })).rejects.toMatchObject({ statusCode: 503 })
    expect(remote).toHaveBeenCalledTimes(1)
    await expect(authorizeManagedTransferSourceRetention(authorization(), { env: { ...env, PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_MANAGEMENT: { managedTransferSourceRetention: remote } } })).rejects.toMatchObject({ statusCode: 503 })
    expect(remote).toHaveBeenCalledTimes(1)
  })
  it('delegates full authorization to the Worker and redacts private errors', async () => {
    const input = { expectedEnvironment: 'production', authorization: authorization() }
    const run = vi.fn(async () => {
      throw new Error('unexpected database')
    })
    core.authorizeManagedTransferSourceRetention.mockResolvedValue(input.authorization)
    expect(await handleManagedTransferSourceRetentionManagement(input, env, run)).toMatchObject({ ok: true, value: input.authorization })
    core.authorizeManagedTransferSourceRetention.mockRejectedValue({ statusCode: 403, message: 'private SQL details' })
    const result = await handleManagedTransferSourceRetentionManagement(input, env, run)
    expect(result).toMatchObject({ ok: false, error: { statusCode: 403 } })
    expect(JSON.stringify(result)).not.toContain('private SQL')
    core.authorizeManagedTransferSourceRetention.mockClear()
    expect(await handleManagedTransferSourceRetentionManagement(input, { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, run)).toMatchObject({ ok: false })
    expect(core.authorizeManagedTransferSourceRetention).not.toHaveBeenCalled()
  })
})
