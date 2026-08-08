import { neon } from '@neondatabase/serverless'
import { pathToFileURL } from 'node:url'
import {
  classifyLakebaseReadiness,
  inspectLakebaseCapability,
  type LakebaseCapabilityReport,
  type LakebaseQuery,
  type LakebaseReadiness
} from './capability'
import {
  LakebasePilotSafetyError,
  redactPilotTarget,
  resolvePilotTarget,
  type LakebasePilotTarget
} from './contracts'

export type LakebasePreflightFailureCode
  = | 'database_query_failed'
    | 'preflight_failed'
    | string

export type LakebasePreflightOutput
  = | {
    status: 'ready' | 'blocked'
    target: ReturnType<typeof redactPilotTarget>
    capability: LakebaseCapabilityReport
    readiness: LakebaseReadiness
  }
  | {
    status: 'blocked'
    code: LakebasePreflightFailureCode
  }

export interface LakebasePreflightArgs {
  env?: Record<string, string | undefined>
}

export interface LakebasePreflightDependencies {
  resolveTarget?: typeof resolvePilotTarget
  redactTarget?: typeof redactPilotTarget
  createQuery?: (target: LakebasePilotTarget) => LakebaseQuery
  inspectCapability?: typeof inspectLakebaseCapability
  classifyReadiness?: typeof classifyLakebaseReadiness
  write?: (output: LakebasePreflightOutput) => void
}

export interface LakebasePreflightResult {
  exitCode: 0 | 1
  output: LakebasePreflightOutput
}

function createNeonQuery(target: LakebasePilotTarget): LakebaseQuery {
  const execute = neon(target.databaseUrl, { fullResults: true }) as unknown as (
    sql: string,
    params?: unknown[]
  ) => Promise<{ rows: Record<string, unknown>[] }>
  return async (sql, params) => (await execute(sql, params)).rows
}

function failureCode(error: unknown): LakebasePreflightFailureCode {
  if (error instanceof LakebasePilotSafetyError) return error.code
  return 'database_query_failed'
}

export async function runLakebasePreflight(
  args: LakebasePreflightArgs = {},
  deps: LakebasePreflightDependencies = {}
): Promise<LakebasePreflightResult> {
  const resolveTarget = deps.resolveTarget || resolvePilotTarget
  const redactTarget = deps.redactTarget || redactPilotTarget
  const inspectCapability = deps.inspectCapability || inspectLakebaseCapability
  const classifyReadiness = deps.classifyReadiness || classifyLakebaseReadiness
  const write = deps.write || (output => console.log(JSON.stringify(output)))

  try {
    const target = resolveTarget(args.env || process.env, 'read')
    const query = (deps.createQuery || createNeonQuery)(target)
    const capability = await inspectCapability(query)
    const readiness = classifyReadiness(capability)
    const output: LakebasePreflightOutput = {
      status: readiness.ready ? 'ready' : 'blocked',
      target: redactTarget(target),
      capability,
      readiness
    }
    write(output)
    return { exitCode: readiness.ready ? 0 : 1, output }
  } catch (error) {
    const output: LakebasePreflightOutput = { status: 'blocked', code: failureCode(error) }
    write(output)
    return { exitCode: 1, output }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLakebasePreflight().then((result) => {
    process.exitCode = result.exitCode
  })
}
