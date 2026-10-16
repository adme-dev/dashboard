import { expect, it, vi } from 'vitest'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

const module = () => import('~~/server/utils/pageStudio/completedManagedTransfer')
const siteId = '00000000-0000-4000-8000-000000000001', env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
const status = { siteId, completed: true, editorConnection: 'ready', sourceRetention: 'pending', canRetryConnection: false, canRetryRetention: true }
it('calls fixed captured method with current site/action and validates redacted status/digest', async () => {
  const service = { completedManagedTransfer: async function (request: Record<string, unknown>) {
    expect(this).toBe(service)
    return { ok: true, requestDigest: await collectionDigest(request), value: status }
  } }
  const input = { siteId, action: 'status' }
  const pending = (await module()).callCompletedManagedTransfer(input, { env: { ...env, PAGE_STUDIO_MANAGEMENT: service } })
  service.completedManagedTransfer = async () => {
    throw new Error('Replaced')
  }
  input.action = 'retain'
  expect(await pending).toEqual(status)
})
it('never retries uncertainty, admits finalize or accepts a substituted site/private field', async () => {
  const remote = vi.fn(async () => {
      throw new Error('Lost response')
    }), m = await module()
  await expect(m.callCompletedManagedTransfer({ siteId, action: 'connect' }, { env: { ...env, PAGE_STUDIO_MANAGEMENT: { completedManagedTransfer: remote } } })).rejects.toMatchObject({ statusCode: 503 })
  expect(remote).toHaveBeenCalledTimes(1)
  await expect(m.callCompletedManagedTransfer({ siteId, action: 'finalize' }, { env })).rejects.toThrow()
  const bad = async (request: unknown) => ({ ok: true, requestDigest: await collectionDigest(request), value: { ...status, siteId: '00000000-0000-4000-8000-000000000002' } })
  await expect(m.callCompletedManagedTransfer({ siteId, action: 'status' }, { env: { ...env, PAGE_STUDIO_MANAGEMENT: { completedManagedTransfer: bad } } })).rejects.toMatchObject({ statusCode: 503 })
})
