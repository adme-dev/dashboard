export type AsyncTask<T = unknown> = () => Promise<T>

export async function runTasksSequentially(
  tasks: AsyncTask[],
): Promise<PromiseSettledResult<unknown>[]> {
  const results: PromiseSettledResult<unknown>[] = []

  for (const task of tasks) {
    try {
      results.push({ status: 'fulfilled', value: await task() })
    } catch (reason) {
      results.push({ status: 'rejected', reason })
    }
  }

  return results
}

export function createSingleFlight<T>(task: AsyncTask<T>): AsyncTask<T> {
  let active: Promise<T> | null = null

  return () => {
    if (active) return active

    active = task().finally(() => {
      active = null
    })

    return active
  }
}
