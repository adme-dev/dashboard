import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { bannerImportRecovery, recoverStoredImportReceipts, type ImportRecoveryRow } from '~~/server/utils/banner/importRecovery'

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

it('verifies staff receipts from private stored bytes before reusing them', async () => {
  const data = new TextEncoder().encode('verified artwork')
  const sha256 = createHash('sha256').update(data).digest('hex')
  const asset = { name: `${sha256}.mp4`, fileSize: data.length, clientId: 'client', uploadedBy: 'staff', r2Key: 'banner-assets/staff/object/file.mp4', url: 'https://app.xeroflow.io/api/public/banner-assets/v1.asset.signature' }
  const read = async () => ({ size: data.length, body: new Response(data).body! })
  const started = '2026-11-23T00:00:00Z', now = Date.parse('2026-11-23T00:30:00Z')
  expect(await recoverStoredImportReceipts([asset], 'staff', 'client', [sha256, 'b'.repeat(64)], started, read, now)).toMatchObject({ canResume: true, completed: 1, total: 2, receipts: [{ sha256, url: asset.url }] })
  expect((await recoverStoredImportReceipts([asset], 'staff', 'client', [sha256], started, read, now - 20 * 60_000)).canResume).toBe(false)
  expect((await recoverStoredImportReceipts([{ ...asset, clientId: 'other' }], 'staff', 'client', [sha256], started, read, now)).canResume).toBe(false)
  expect((await recoverStoredImportReceipts([asset], 'staff', 'client', [sha256], started, async () => null, now)).canResume).toBe(false)
  expect((await recoverStoredImportReceipts([asset], 'staff', 'client', [sha256], started, async () => ({ size: data.length, body: new Response(new Uint8Array(data.length)).body! }), now)).canResume).toBe(false)
})
