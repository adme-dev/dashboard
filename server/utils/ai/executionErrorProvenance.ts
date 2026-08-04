const trustedPreDispatchErrors = new WeakSet<object>()

/**
 * Runtime provenance for failures that occurred before an executor began its mutation transport.
 * A caller-visible field is not evidence: only errors branded inside this server module are trusted.
 */
export function markTrustedPreDispatchError(error: unknown, boundedCode: string): Error {
  const candidate = error instanceof Error ? error : new Error('God mode action failed before dispatch')
  Object.assign(candidate, { boundedCode, preDispatch: true })
  trustedPreDispatchErrors.add(candidate)
  return candidate
}

export function isTrustedPreDispatchError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && trustedPreDispatchErrors.has(error))
}
