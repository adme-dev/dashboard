import { beforeEach, expect, it, vi } from 'vitest'
import fixture from '../fixtures/pageStudioManagedTransferDestinationAuthoring.json'
import { collectionDigest } from '~~/shared/pageStudio/collectionApi'

const core = vi.hoisted(() => ({ coordinateCompletedManagedTransfer: vi.fn(), completeManagedTransfer: vi.fn() }))
vi.mock('~~/workers/page-studio-management/src/completedManagedTransfer', () => ({ coordinateCompletedManagedTransfer: core.coordinateCompletedManagedTransfer }))
vi.mock('~~/workers/page-studio-management/src/managedTransferCompletion', () => ({ completeManagedTransfer: core.completeManagedTransfer }))
const module = () => import('~~/workers/page-studio-management/src/completedManagedTransferManagement')
const env = { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production' }, siteId = fixture.request.completionReceipt.destination.scope.siteId
const status = { siteId, completed: true, editorConnection: 'ready', sourceRetention: 'pending', canRetryConnection: false, canRetryRetention: true }
const run = async () => {
  throw new Error('Unexpected SQL')
}
beforeEach(() => vi.resetAllMocks())
it('binds customer-safe status to exact site/action and denies finalization in that wire', async () => {
  const m = await module(), request = { siteId, action: 'status', expectedEnvironment: 'production' }
  core.coordinateCompletedManagedTransfer.mockResolvedValue(status)
  expect(await m.handleCompletedManagedTransferManagement(request, env, run)).toEqual({ ok: true, requestDigest: await collectionDigest(request), value: status })
  expect(await m.handleCompletedManagedTransferManagement({ ...request, action: 'finalize' }, env, run)).toMatchObject({ ok: false, error: { statusCode: 400 } })
  expect(core.completeManagedTransfer).not.toHaveBeenCalled()
  expect(await m.handleCompletedManagedTransferManagement(request, { ...env, PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' }, run)).toMatchObject({ ok: false, error: { statusCode: 503 } })
})
it('keeps finalization on a distinct strict reference-only private method with original authority', async () => {
  const m = await module(), reference = { operationId: fixture.request.operationId, intentDigest: fixture.request.intentDigest }
  core.completeManagedTransfer.mockResolvedValue(fixture.request.completionReceipt)
  expect(await m.handleManagedTransferFinalization(reference, env, run)).toEqual({ ok: true, requestDigest: await collectionDigest(reference), value: fixture.request.completionReceipt })
  expect(core.completeManagedTransfer).toHaveBeenCalledTimes(1)
  expect(core.coordinateCompletedManagedTransfer).not.toHaveBeenCalled()
  expect(await m.handleManagedTransferFinalization({ ...reference, action: 'complete' }, env, run)).toMatchObject({ ok: false, error: { statusCode: 400 } })
  core.completeManagedTransfer.mockRejectedValue({ statusCode: 403, message: 'secret SQL' })
  const rejected = await m.handleManagedTransferFinalization(reference, env, run)
  expect(rejected).toMatchObject({ ok: false, error: { statusCode: 403 } })
  expect(JSON.stringify(rejected)).not.toContain('secret')
})
