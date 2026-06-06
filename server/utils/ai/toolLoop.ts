import { generateText, stepCountIs, type LanguageModel } from 'ai'
import { resolveModel } from '~~/server/utils/claudeClient'
import { filterToolsForUser, toSdkTools } from './toolRegistry'
import { registry } from './tools/index'
import { DEFAULT_PERSONA, type Persona } from './personas'
import { spotlightSystemClause } from './spotlight'
import type { ToolContext } from './toolContext'

export interface LoopOutput {
  text: string
  toolCalls: Array<{ name: string, args: unknown }>
  proposedAction: { proposalId: string, resolved: unknown } | null
  usage?: { inputTokens?: number, outputTokens?: number, totalTokens?: number }
}

const STEP_CAP = 5
const DEADLINE_MS = 25_000

/**
 * PURE extraction of the loop's output from a generateText result. Kept separate so the
 * trace + proposal-detection logic is unit-testable without a live/mock model.
 * Option B: a create_task proposal is read from the tool RESULT (the handler returned
 * { ok, data:{ proposalId, resolved } }) — not from any approval-request part.
 */
export function extractLoopOutput(result: any): LoopOutput {
  const steps: any[] = result?.steps ?? []
  const toolCalls = steps
    .flatMap(s => s?.toolCalls ?? [])
    .map((c: any) => ({ name: c.toolName, args: c.input }))

  let proposedAction: LoopOutput['proposedAction'] = null
  for (const s of steps) {
    for (const r of (s?.toolResults ?? [])) {
      const out = r?.output
      if (r?.toolName === 'create_task' && out?.ok && out?.data?.proposalId) {
        proposedAction = { proposalId: out.data.proposalId, resolved: out.data.resolved }
      }
    }
  }
  return { text: result?.text ?? '', toolCalls, proposedAction, usage: result?.usage }
}

/**
 * Run the gated agentic loop (AI SDK v6). Filters tools by RBAC (+ optional persona allowlist),
 * runs generateText with a step cap + wall-clock deadline, and falls back to a second provider on
 * failure. Returns the final text, the read-tool trace, and any create_task proposal (Option B).
 */
export async function runToolLoop(opts: {
  ctx: ToolContext
  system: string
  messages: any[]
  persona?: Persona
  seed: string
  modelSpec?: string
  fallbackSpec?: string
  /** Test injection — bypasses resolveModel. */
  model?: LanguageModel
  fallbackModel?: LanguageModel
  signal?: AbortSignal
}): Promise<LoopOutput> {
  const cfg = useRuntimeConfig() as any
  const persona = opts.persona ?? DEFAULT_PERSONA

  let tools = filterToolsForUser(registry, opts.ctx.userRole)
  if (persona.toolAllowlist) tools = tools.filter(t => persona.toolAllowlist!.includes(t.name))
  const sdkTools = toSdkTools(tools, opts.ctx, opts.seed)

  const system = [opts.system, persona.instructionsPreamble, spotlightSystemClause()]
    .filter(Boolean)
    .join('\n\n')

  const signal = opts.signal ?? AbortSignal.timeout(DEADLINE_MS)
  const run = (m: LanguageModel) => generateText({
    model: m,
    system,
    messages: opts.messages,
    tools: sdkTools,
    stopWhen: [stepCountIs(STEP_CAP)],
    abortSignal: signal,
  })

  const primary = opts.model ?? resolveModel(opts.modelSpec ?? cfg.aiLoopModel)
  let result
  try {
    result = await run(primary)
  } catch (err) {
    // Provider/gateway failure → ordered fallback to a second model.
    const fb = opts.fallbackModel
      ?? ((opts.fallbackSpec ?? cfg.aiLoopFallbackModel) ? resolveModel(opts.fallbackSpec ?? cfg.aiLoopFallbackModel) : null)
    if (!fb) throw err
    result = await run(fb)
  }

  return extractLoopOutput(result)
}
