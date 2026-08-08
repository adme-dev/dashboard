import { readFile } from 'node:fs/promises'
import { redactPilotTarget, resolvePilotTarget } from './contracts'
import {
  closePilotDatabasePreservingError,
  createPilotDatabase,
  type PilotDatabase
} from './database'

export interface PilotTeardownDependencies {
  env: Record<string, string | undefined>
  createDatabase?: (target: ReturnType<typeof resolvePilotTarget>) => Promise<PilotDatabase>
}

export async function runPilotTeardown(deps: PilotTeardownDependencies) {
  const target = resolvePilotTarget(deps.env, 'mutate')
  const database = await (deps.createDatabase || createPilotDatabase)(target)
  let operationCompleted = false
  let primaryError: unknown

  try {
    const teardownSql = await readFile(new URL('./sql/teardown.sql', import.meta.url), 'utf8')
    await database.query(teardownSql)
    const result = {
      target: redactPilotTarget(target),
      droppedSchema: 'lakebase_pilot' as const
    }
    operationCompleted = true
    return result
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    await closePilotDatabasePreservingError(database, { operationCompleted, primaryError })
  }
}
