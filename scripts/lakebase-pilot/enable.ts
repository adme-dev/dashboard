import { pathToFileURL } from 'node:url'
import {
  enableLakebasePreloads,
  LakebaseControlPlaneError,
  type LakebaseEnableDependencies,
  type LakebaseEnableResult
} from './neonControlPlane'
import {
  LakebasePilotSafetyError,
  redactPilotTarget,
  resolvePilotTarget,
  type LakebasePilotTarget
} from './contracts'

export type LakebaseEnableOutput
  = | {
    status: 'enabled'
    target: ReturnType<typeof redactPilotTarget>
    preloadLibraries: string[]
    restartDeferred: boolean
  }
  | {
    status: 'blocked'
    code: string
  }

export interface LakebaseEnableArgs {
  env?: Record<string, string | undefined>
}

export interface RunLakebaseEnableDependencies extends Partial<LakebaseEnableDependencies> {
  resolveTarget?: typeof resolvePilotTarget
  redactTarget?: typeof redactPilotTarget
  enablePreloads?: (
    input: { target: LakebasePilotTarget, apiKey: string },
    deps: LakebaseEnableDependencies
  ) => Promise<LakebaseEnableResult>
  write?: (output: LakebaseEnableOutput) => void
}

export interface RunLakebaseEnableResult {
  exitCode: 0 | 1
  output: LakebaseEnableOutput
}

function requiredApiKey(env: Record<string, string | undefined>): string {
  const apiKey = env.NEON_API_KEY?.trim()
  if (!apiKey) throw new LakebaseControlPlaneError('missing_neon_api_key')
  return apiKey
}

function failureCode(error: unknown): string {
  if (error instanceof LakebasePilotSafetyError || error instanceof LakebaseControlPlaneError) return error.code
  return 'pilot_target_validation_failed'
}

export async function runLakebaseEnable(
  args: LakebaseEnableArgs = {},
  deps: RunLakebaseEnableDependencies = {}
): Promise<RunLakebaseEnableResult> {
  const env = args.env || process.env
  const resolveTarget = deps.resolveTarget || resolvePilotTarget
  const redactTarget = deps.redactTarget || redactPilotTarget
  const write = deps.write || (output => console.log(JSON.stringify(output)))

  try {
    const target = resolveTarget(env, 'mutate')
    const apiKey = requiredApiKey(env)
    const controlPlaneDeps: LakebaseEnableDependencies = { fetch: deps.fetch || globalThis.fetch }
    const enabled = await (deps.enablePreloads || enableLakebasePreloads)({ target, apiKey }, controlPlaneDeps)
    const output: LakebaseEnableOutput = {
      status: 'enabled',
      target: redactTarget(target),
      preloadLibraries: enabled.preloadLibraries,
      restartDeferred: enabled.restartDeferred
    }
    write(output)
    return { exitCode: 0, output }
  } catch (error) {
    const output: LakebaseEnableOutput = { status: 'blocked', code: failureCode(error) }
    write(output)
    return { exitCode: 1, output }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLakebaseEnable().then((result) => {
    process.exitCode = result.exitCode
  })
}
