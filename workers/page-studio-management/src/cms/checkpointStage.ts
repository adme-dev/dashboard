type CheckpointStage = 'snapshot' | 'replay' | 'base' | 'artifacts' | 'candidate' | 'verify' | 'commit'

/** Preserve the original failure and transaction boundaries; emit fixed labels only. */
export async function checkpointStage<T>(stage: CheckpointStage, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    console.warn('page-studio-cms-management-failed', { operation: 'checkpoint', stage, category: 'checkpoint-stage' })
    throw error
  }
}
