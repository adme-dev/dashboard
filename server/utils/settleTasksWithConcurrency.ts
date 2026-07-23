export type AsyncTask<T> = () => Promise<T>

export async function settleTasksWithConcurrency<T>(
  tasks: AsyncTask<T>[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const limit = Math.max(1, Math.floor(concurrency))
  const results = new Array<PromiseSettledResult<T>>(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]!() }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  )

  return results
}
