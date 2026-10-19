import { expect, it, vi } from 'vitest'
import fixture from '../../fixtures/pageStudioManagedTransferDestinationAuthoring.json'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { authorizeManagedTransferDestinationAuthoring, readManagedTransferDestinationAuthoring } from '~~/server/utils/pageStudio/managedTransferDestinationAuthoring'

vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: () => {
  throw new Error('Pages must not access SQL')
} }))
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }
it('captures fixed private method and detached callback before awaited digest and requires exact echo', async () => {
  const authorization = { action: 'read', request: structuredClone(fixture.request) }
  const service = { managedTransferDestinationAuthoring: async function (wire: Record<string, unknown>) {
    expect(this).toBe(service)
    return { ok: true, requestDigest: await collectionDigest(wire), value: wire.authorization }
  } }
  const pending = authorizeManagedTransferDestinationAuthoring(authorization, { env: { ...env, PAGE_STUDIO_MANAGEMENT: service } })
  service.managedTransferDestinationAuthoring = async () => {
    throw new Error('Replaced')
  }
  authorization.action = 'retain'
  expect(await pending).toEqual({ action: 'read', request: fixture.request })
})
it('binds read response to fixed production site request and rejects wrong response digest or callback bytes', async () => {
  const service = { managedTransferDestinationAuthoring: async (wire: Record<string, unknown>) => ({ ok: true, requestDigest: await collectionDigest(wire), value: fixture.request }) }
  expect(await readManagedTransferDestinationAuthoring({ siteId: fixture.request.completionReceipt.destination.scope.siteId }, { env: { ...env, PAGE_STUDIO_MANAGEMENT: service } })).toEqual(fixture.request)
  await expect(authorizeManagedTransferDestinationAuthoring({ action: 'read', request: fixture.request }, { env: { ...env, PAGE_STUDIO_MANAGEMENT: service } })).rejects.toMatchObject({ statusCode: 503 })
  service.managedTransferDestinationAuthoring = async () => ({ ok: true, requestDigest: '0'.repeat(64), value: fixture.request })
  await expect(readManagedTransferDestinationAuthoring({ siteId: fixture.request.completionReceipt.destination.scope.siteId }, { env: { ...env, PAGE_STUDIO_MANAGEMENT: service } })).rejects.toMatchObject({ statusCode: 503 })
})
it('has no fallback, uncertain-call retry, caller-selected environment or exposed private SQL error', async () => {
  const remote = vi.fn(async () => {
    throw new Error('Lost response')
  })
  await expect(authorizeManagedTransferDestinationAuthoring({ action: 'install', request: fixture.request }, { env: { ...env, PAGE_STUDIO_MANAGEMENT: { managedTransferDestinationAuthoring: remote } } })).rejects.toMatchObject({ statusCode: 503 })
  expect(remote).toHaveBeenCalledTimes(1)
  await expect(readManagedTransferDestinationAuthoring({ siteId: fixture.request.completionReceipt.destination.scope.siteId }, { env: { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' } })).rejects.toThrow()
  await expect(readManagedTransferDestinationAuthoring({ siteId: fixture.request.completionReceipt.destination.scope.siteId, provider: {} }, { env })).rejects.toThrow()
})
