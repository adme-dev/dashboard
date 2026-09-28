/** One absolute budget for remote preparation. A rejected stage never resumes
 * its caller or reaches the publication transaction. Late immutable writes may
 * finish, but they cannot activate a release. */
export function runtimeFeatureDeadline(milliseconds = 10_000) {
  const expires = Date.now() + milliseconds
  const controller = new AbortController()
  let reject: (reason: Error) => void = () => {}
  const stopped = new Promise<never>((_resolve, fail) => {
    reject = fail
  })
  void stopped.catch(() => {})
  const timer = setTimeout(() => {
    controller.abort()
    reject(new Error('Runtime feature operation timed out'))
  }, milliseconds)
  const assert = () => {
    if (controller.signal.aborted || Date.now() >= expires) throw new Error('Runtime feature operation timed out')
  }
  return {
    signal: controller.signal, assert,
    async run<T>(operation: () => Promise<T>) {
      assert()
      const result = await Promise.race([operation(), stopped])
      assert()
      return result
    },
    dispose() {
      clearTimeout(timer)
      controller.abort()
    }
  }
}
