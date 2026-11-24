import { createHash } from 'node:crypto'
import { MAX_CREATIVE_PACKAGE_ASSETS } from '~~/app/utils/thebrief-import'

/** Read-only admission to retry the existing audited upload keys. Never resets ledger rows. */
export interface ImportRecoveryRow {
  actorId: string
  state: string
  phase: string
  stale: boolean
  resultReference: string | null
  assetId: string | null
  assetClientId: string | null
  assetUploadedBy: string | null
  metadata: { assetId?: string, r2Key?: string } | null
}

export function bannerImportRecovery(rows: ImportRecoveryRow[], actorId: string, clientId: string, total: number) {
  const safe = rows.length > 0 && rows.every(row => row.actorId === actorId && (
    (row.state === 'succeeded' && !!row.resultReference && row.assetId === row.resultReference && row.assetClientId === clientId && row.assetUploadedBy === actorId)
    || (row.state === 'in_progress' && row.stale === true && (row.phase === 'claimed' || (row.phase === 'dispatched' && !!row.metadata?.assetId && row.metadata.r2Key?.startsWith(`banner-assets/${actorId}/`))))
  ))
  return { canResume: safe, completed: rows.filter(row => row.state === 'succeeded').length, total }
}

export interface StoredImportReceipt {
  name: string
  fileSize: number
  clientId: string
  uploadedBy: string
  r2Key: string
  url: string
}

/** Verify acknowledged bytes directly in private R2 before reusing a non-owner upload. */
export async function recoverStoredImportReceipts(
  assets: StoredImportReceipt[], actorId: string, clientId: string, hashes: string[], startedAt: string,
  read: (key: string) => Promise<{ size: number, body: ReadableStream<Uint8Array> } | null>,
  now = Date.now()
) {
  const empty = { canResume: false, completed: 0, total: hashes.length, receipts: [] as Array<{ sha256: string, url: string }> }
  const age = now - Date.parse(startedAt)
  if (!Number.isFinite(age) || age < 15 * 60_000 || age > 7 * 86400_000 || !assets.length || assets.length > MAX_CREATIVE_PACKAGE_ASSETS || assets.reduce((sum, asset) => sum + asset.fileSize, 0) > 64 * 1024 * 1024) return empty
  const receipts = new Map<string, string>()
  for (const asset of assets) {
    const sha = /^([a-f0-9]{64})\.(?:png|jpg|gif|webp|mp4|webm|mp3)$/.exec(asset.name)?.[1]
    if (!sha || !hashes.includes(sha) || asset.clientId !== clientId || asset.uploadedBy !== actorId || !asset.r2Key.startsWith(`banner-assets/${actorId}/`) || !(asset.fileSize > 0 && asset.fileSize <= 24 * 1024 * 1024)
      || !/^https:\/\/app\.xeroflow\.io\/api\/public\/banner-assets\/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(asset.url)) return empty
    const object = await read(asset.r2Key)
    if (!object || object.size !== asset.fileSize) return empty
    const reader = object.body.getReader()
    const digest = createHash('sha256')
    let bytes = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > asset.fileSize) return empty
        digest.update(chunk.value)
      }
    } finally { await reader.cancel().catch(() => {}) }
    if (bytes !== asset.fileSize || digest.digest('hex') !== sha) return empty
    receipts.set(sha, asset.url)
  }
  return { canResume: true, completed: receipts.size, total: hashes.length, receipts: [...receipts].map(([sha256, url]) => ({ sha256, url })) }
}
