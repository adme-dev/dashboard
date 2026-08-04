import {
  CompanyRolloutReadinessError,
  getCompanyAssistantRolloutReadiness,
  type CompanyAssistantRolloutReadiness
} from '~~/server/utils/ai/governance/companyRolloutReadiness'

export type AiAssistantReadinessGate = 'pilot' | 'enforced'

export interface AiAssistantReadinessDependencies {
  getReadiness(): Promise<CompanyAssistantRolloutReadiness>
  write(output: string): void
}

const defaultDependencies: AiAssistantReadinessDependencies = {
  getReadiness: getCompanyAssistantRolloutReadiness,
  write: output => console.log(output)
}

export function parseAiAssistantReadinessArgs(args: string[]): { gate: AiAssistantReadinessGate, json: boolean } {
  let gate: AiAssistantReadinessGate | null = null
  let json = false
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--json') {
      json = true
      continue
    }
    if (arg === '--gate' && !gate) {
      const value = args[++index]
      if (value === 'pilot' || value === 'enforced') {
        gate = value
        continue
      }
    }
    throw new Error('Usage: pnpm readiness:ai-assistants -- --gate pilot|enforced [--json]')
  }
  if (!gate) throw new Error('Usage: pnpm readiness:ai-assistants -- --gate pilot|enforced [--json]')
  return { gate, json }
}

function errorCode(error: unknown): string {
  if (error instanceof CompanyRolloutReadinessError) return error.code
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : null
  return typeof code === 'string' && /^(?:readiness_query_failed|[a-z_]+_unbounded|invalid_[a-z_]+_row|missing_employee_department_row)$/.test(code)
    ? code
    : 'readiness_unavailable'
}

function gateBlockers(gate: AiAssistantReadinessGate, blockers: string[], passed: boolean): string[] {
  if (passed) return []
  return gate === 'pilot'
    ? blockers.filter(blocker => blocker === 'no_evaluated_pilot_release' || blocker === 'no_eligible_pilot_membership')
    : blockers.filter(blocker => blocker !== 'no_evaluated_pilot_release' && blocker !== 'no_eligible_pilot_membership')
}

function writeFailure(
  json: boolean,
  gate: AiAssistantReadinessGate | null,
  code: string,
  write: AiAssistantReadinessDependencies['write']
) {
  if (json) write(JSON.stringify({ gate, passed: false, error: { code } }))
  else write(`AI assistant ${gate ?? 'unknown'} readiness: BLOCKED\n${code}`)
}

export async function runAiAssistantReadiness(
  args: string[] = process.argv.slice(2),
  dependencies: AiAssistantReadinessDependencies = defaultDependencies
): Promise<number> {
  let options: { gate: AiAssistantReadinessGate, json: boolean }
  try {
    options = parseAiAssistantReadinessArgs(args)
  } catch {
    writeFailure(args.includes('--json'), null, 'invalid_arguments', dependencies.write)
    return 1
  }
  try {
    const readiness = await dependencies.getReadiness()
    const passed = options.gate === 'pilot' ? readiness.readyForPilot : readiness.readyForEnforcement
    const blockers = gateBlockers(options.gate, readiness.blockers, passed)
    if (options.json) dependencies.write(JSON.stringify({ gate: options.gate, passed, ...readiness, blockers }))
    else {
      dependencies.write([
        `AI assistant ${options.gate} readiness: ${passed ? 'PASS' : 'BLOCKED'}`,
        ...blockers
      ].join('\n'))
    }
    return passed ? 0 : 1
  } catch (error) {
    writeFailure(options.json, options.gate, errorCode(error), dependencies.write)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAiAssistantReadiness()
    .then(code => { process.exitCode = code })
    .catch(() => { process.exitCode = 1 })
}
