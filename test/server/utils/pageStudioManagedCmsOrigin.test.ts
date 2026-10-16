import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readManagedCmsOrigin } from '../../../server/utils/pageStudio/managedCmsOrigin'

const readers = vi.hoisted(() => ({ adoption: vi.fn(), completion: vi.fn() }))
vi.mock('../../../server/utils/pageStudio/cmsAdoptionReceipt', () => ({ readManagedCmsAdoptionReceipt: readers.adoption }))
vi.mock('../../../server/utils/pageStudio/managedTransferCompletionRead', () => ({ readCurrentManagedTransferCompletion: readers.completion }))
const scope = { tenantId: 'tenant', clientId: 'client', businessId: 'client', siteId: 'site', environment: 'production' as const }
const database = (row: unknown) => ({ query: vi.fn().mockResolvedValue({ rows: row ? [row] : [] }) })
beforeEach(() => vi.resetAllMocks())
describe('explicit managed CMS origin', () => {
  it('keeps ordinary adoption verification unchanged', async () => {
    readers.adoption.mockResolvedValue({ adoptionId: 'adoption' })
    expect(await readManagedCmsOrigin(database({ state: 'managed', adoption_id: 'adoption', transfer_id: null }), scope)).toEqual({ kind: 'adoption', receipt: { adoptionId: 'adoption' } })
    expect(readers.completion).not.toHaveBeenCalled()
  })
  it('uses the current completed destination reader without original login authority', async () => {
    readers.completion.mockResolvedValue({ operationId: 'transfer' })
    expect(await readManagedCmsOrigin(database({ state: 'managed', adoption_id: null, transfer_id: 'transfer' }), scope)).toEqual({ kind: 'transfer', receipt: { operationId: 'transfer' } })
    expect(readers.adoption).not.toHaveBeenCalled()
  })
  it.each([null, { state: 'retained', adoption_id: 'adoption', transfer_id: null }, { state: 'managed', adoption_id: null, transfer_id: null }, { state: 'managed', adoption_id: 'adoption', transfer_id: 'transfer' }])('rejects missing, retained or ambiguous origin %j', async (row) => {
    await expect(readManagedCmsOrigin(database(row), scope)).rejects.toThrow()
    expect(readers.adoption).not.toHaveBeenCalled()
    expect(readers.completion).not.toHaveBeenCalled()
  })
  it.each([null, { operationId: 'other' }])('rejects absent or substituted completion without adoption fallback %j', async (receipt) => {
    readers.completion.mockResolvedValue(receipt)
    await expect(readManagedCmsOrigin(database({ state: 'managed', adoption_id: null, transfer_id: 'transfer' }), scope)).rejects.toThrow()
    expect(readers.adoption).not.toHaveBeenCalled()
  })
})
