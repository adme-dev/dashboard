/** Models native per-lookup callable wrappers for genuine PG orchestration tests.
 * Actual workerd binding behavior is independently tested in the runtime suite. */
export function freshRecoveryRpcBinding<T extends object>(methods: T): T {
  return new Proxy({} as T, {
    get(_target, key) {
      const method = Reflect.get(methods, key)
      if (typeof method !== 'function') return method
      return new Proxy(method, {
        get(target, property, receiver) {
          if (property === 'call' || property === 'bind') throw new Error('Named RPC function property')
          return Reflect.get(target, property, receiver)
        },
        apply(target, receiver, args) { return Reflect.apply(target, receiver, args) }
      })
    }
  })
}
