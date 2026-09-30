import { randomUUID } from 'node:crypto'

type Stage = 'publisher' | 'recovery' | 'content' | 'seal' | 'approval' | 'activation'
  | 'published-authority' | 'published-recovery' | 'published-projection'

/** Fixed-stage timing only. Never serialize request, storage or error payloads. */
export function runtimeFeatureDiagnostics() {
  const operationId = randomUUID()
  return async <T>(stage: Stage, work: () => Promise<T>): Promise<T> => {
    const started = Date.now()
    try {
      const result = await work()
      console.info('[page-studio-runtime-feature]', { operationId, stage, outcome: 'ok', elapsedMs: Date.now() - started })
      return result
    } catch (error) {
      const category = error instanceof Error && error.message === 'Runtime feature operation timed out'
        ? 'deadline'
        : error instanceof Error && error.name === 'ZodError' ? 'validation' : 'operation'
      console.error('[page-studio-runtime-feature]', { operationId, stage, outcome: 'failed', category, elapsedMs: Date.now() - started })
      throw error
    }
  }
}
