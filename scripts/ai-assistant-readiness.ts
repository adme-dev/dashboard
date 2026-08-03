import { getCompanyAssistantRolloutReadiness } from '~~/server/utils/ai/governance/companyRolloutReadiness'

export type AiAssistantReadinessGate = 'pilot' | 'enforced'

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

export async function runAiAssistantReadiness(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = parseAiAssistantReadinessArgs(args)
  const readiness = await getCompanyAssistantRolloutReadiness()
  const passed = options.gate === 'pilot' ? readiness.readyForPilot : readiness.readyForEnforcement
  if (options.json) console.log(JSON.stringify({ gate: options.gate, passed, ...readiness }, null, 2))
  else {
    console.log(`AI assistant ${options.gate} readiness: ${passed ? 'PASS' : 'BLOCKED'}`)
    for (const blocker of readiness.blockers) console.log(blocker)
  }
  return passed ? 0 : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAiAssistantReadiness().then(code => { process.exitCode = code }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
