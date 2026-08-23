/**
 * One attempt → one key. Owners' requests run under the God-mode execution
 * ledger, which requires a stable `Idempotency-Key` per attempt (regex
 * `^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$`); staff requests carry it harmlessly.
 * A retry of the *same* attempt should reuse the key; a new user action gets a new one.
 */
export function idempotencyKey(scope: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 13)
    : Math.random().toString(36).slice(2, 15)
  return `${scope.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 40)}:${Date.now().toString(36)}:${random}`
}
