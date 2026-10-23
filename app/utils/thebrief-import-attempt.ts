/** A lost upload response must be reconciled before another write is attempted. */
export interface ImportAttemptStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export function importAttemptKey(clientId: string, sourceHash: string): string {
  return `thebrief-import-pending:${clientId}:${sourceHash}`
}

export function beginImportAttempt(store: ImportAttemptStore, key: string): void {
  if (store.getItem(key)) throw new Error('A previous import needs reconciliation. Check the banner library and uploaded assets before retrying; this browser has paused further writes for this package.')
  // Fail closed if durable browser storage is unavailable.
  store.setItem(key, JSON.stringify({ startedAt: new Date().toISOString() }))
}

export function finishImportAttempt(store: ImportAttemptStore, key: string): void {
  store.removeItem(key)
}
