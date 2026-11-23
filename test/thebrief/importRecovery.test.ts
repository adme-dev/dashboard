import { expect, it } from 'vitest'
import { bannerImportRecovery, type ImportRecoveryRow } from '~~/server/utils/banner/importRecovery'

const row: ImportRecoveryRow = { actorId: 'owner', state: 'succeeded', phase: 'result_captured', stale: true, resultReference: 'asset', assetId: 'asset', assetClientId: 'client', assetUploadedBy: 'owner', metadata: null }
it('admits only known same-owner/client receipts and reclaimable expired claims', () => {
  expect(bannerImportRecovery([row], 'owner', 'client', 3)).toEqual({ canResume: true, completed: 1, total: 3 })
  expect(bannerImportRecovery([{ ...row, state: 'in_progress', phase: 'claimed' }], 'owner', 'client', 3).canResume).toBe(true)
  expect(bannerImportRecovery([{ ...row, state: 'in_progress', phase: 'dispatched', metadata: { assetId: 'reserved', r2Key: 'banner-assets/owner/reserved/file.mp4' } }], 'owner', 'client', 3).canResume).toBe(true)
})
it.each([
  [], [{ ...row, actorId: 'other' }], [{ ...row, assetClientId: 'other' }], [{ ...row, assetId: 'different' }], [{ ...row, state: 'failed' }],
  [{ ...row, state: 'in_progress', phase: 'claimed', stale: false }], [{ ...row, state: 'in_progress', phase: 'dispatched', metadata: null }],
  [{ ...row, state: 'in_progress', phase: 'result_captured' }]
])('holds unsafe or absent recovery evidence %j', (...rows) => {
  expect(bannerImportRecovery(rows as ImportRecoveryRow[], 'owner', 'client', 3).canResume).toBe(false)
})
