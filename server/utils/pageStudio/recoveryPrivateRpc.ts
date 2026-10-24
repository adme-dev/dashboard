/** Native named RPC properties return fresh wrappers on repeated lookup. Capture
 * once, while still rejecting own-method replacement/accessors/descriptor drift.
 * Callers separately retain trusted binding/config and fresh current authority.
 */
export function captureRecoveryRpc(receiver: Record<string, unknown> | undefined, key: string) {
  if (!receiver) return null
  const denied = () => new Error('Private recovery RPC changed')
  const original = Object.getOwnPropertyDescriptor(receiver, key)
  if (original && !('value' in original)) throw denied()
  const method = receiver[key]
  if (typeof method !== 'function') return null
  const assertCurrent = () => {
    const current = Object.getOwnPropertyDescriptor(receiver, key)
    if (original
      ? !current || !('value' in current) || current.value !== method
      || current.configurable !== original.configurable || current.enumerable !== original.enumerable
      || current.writable !== original.writable
      : current !== undefined) throw denied()
  }
  assertCurrent()
  return { assertCurrent, call: (...args: unknown[]): Promise<unknown> => {
    assertCurrent()
    return Reflect.apply(method, receiver, args)
  } }
}
