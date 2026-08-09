import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { LakebasePilotSafetyError, redactPilotTarget, resolvePilotTarget } from './contracts'
import {
  closePilotDatabasePreservingError,
  createPilotDatabase,
  type PilotDatabase
} from './database'

export interface PilotTeardownDependencies {
  env: Record<string, string | undefined>
  createDatabase?: (target: ReturnType<typeof resolvePilotTarget>) => Promise<PilotDatabase>
}

export type LakebasePilotTeardownCliOutput
  = | { status: 'completed', result: Awaited<ReturnType<typeof runPilotTeardown>> }
    | { status: 'blocked', code: string }

export interface RunPilotTeardownCliDependencies {
  runTeardown?: typeof runPilotTeardown
  write?: (output: LakebasePilotTeardownCliOutput) => void
}

export interface RunPilotTeardownCliResult {
  exitCode: 0 | 1
  output: LakebasePilotTeardownCliOutput
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

function teardownFailureCode(error: unknown): string {
  if (error instanceof LakebasePilotSafetyError) return error.code
  return 'pilot_teardown_failed'
}

export async function runPilotTeardownCli(
  args: { env?: Record<string, string | undefined> } = {},
  deps: RunPilotTeardownCliDependencies = {}
): Promise<RunPilotTeardownCliResult> {
  const write = deps.write || (output => console.log(JSON.stringify(output)))
  try {
    const result = await (deps.runTeardown || runPilotTeardown)({ env: args.env || process.env })
    const output: LakebasePilotTeardownCliOutput = { status: 'completed', result }
    write(output)
    return { exitCode: 0, output }
  } catch (error) {
    const output: LakebasePilotTeardownCliOutput = { status: 'blocked', code: teardownFailureCode(error) }
    write(output)
    return { exitCode: 1, output }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPilotTeardownCli().then((result) => {
    process.exitCode = result.exitCode
  })
}
