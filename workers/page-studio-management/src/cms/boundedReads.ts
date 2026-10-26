/**
 * Ordered bounded reads that stop scheduling after the first failure and let
 * in-flight siblings settle before rethrowing it, so no work outlives the stage.
 */
export async function readBounded<T, R>(items: readonly T[], limit: number, read: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  const failures: unknown[] = []
  let next = 0
  const worker = async () => {
    while (!failures.length && next < items.length) {
      const index = next++
      try {
        results[index] = await read(items[index]!)
      } catch (error) {
        failures.push(error)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failures.length) throw failures[0]
  return results
}
