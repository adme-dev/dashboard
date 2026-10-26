type CheckpointStage = 'snapshot' | 'replay' | 'base' | 'artifacts' | 'candidate' | 'verify' | 'commit'
/** Fixed labels, durations and counts only; never manifest bytes or identities. */
export interface CheckpointTiming {
  started: number
  stages: Array<{ stage: CheckpointStage, ms: number }>
  artifactsRead: number | null
}

export function checkpointTiming(): CheckpointTiming {
  return { started: performance.now(), stages: [], artifactsRead: null }
}

/** Preserve the original failure and transaction boundaries; emit fixed labels only. */
export async function checkpointStage<T>(stage: CheckpointStage, work: () => Promise<T>, timing?: CheckpointTiming): Promise<T> {
  const started = performance.now()
  try {
    return await work()
  } catch (error) {
    console.warn('page-studio-cms-management-failed', { operation: 'checkpoint', stage, category: 'checkpoint-stage' })
    throw error
  } finally {
    timing?.stages.push({ stage, ms: Math.round(performance.now() - started) })
  }
}

export function logCheckpointTiming(timing: CheckpointTiming, mode: string, outcome: 'committed' | 'replayed' | 'failed') {
  console.info(JSON.stringify({ event: 'page_studio_cms_checkpoint_timing', mode, outcome, totalMs: Math.round(performance.now() - timing.started), stages: timing.stages, artifactsRead: timing.artifactsRead }))
}
