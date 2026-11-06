/** One ordered stream for autosave, version snapshots, render and explicit reload. */
export function createSerialMediaOperations() {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const next = tail.then(operation)
      tail = next.catch(() => undefined)
      return next
    }
  }
}
