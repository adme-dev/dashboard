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
