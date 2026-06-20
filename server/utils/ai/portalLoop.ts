import { generateText, stepCountIs, type LanguageModel } from 'ai'
import { resolveModel } from '~~/server/utils/claudeClient'
import { spotlightSystemClause } from './spotlight'
import { extractLoopOutput, estimateCostUsd, type LoopOutput } from './toolLoop'
import { buildPortalTools } from './portalTools'
import { assertPortalScope, type PortalToolContext } from './portalTools/portalContext'

/**
 * The client-portal agentic loop (portal-agent spec §8). Deliberately a SEPARATE entry point from the
 * agency `runToolLoop`: it constructs tools ONLY from the portal registry (agency tools are physically
 * unreachable) and HARD-asserts a clientScope before anything runs. Reuses the agency loop's pure
 * helpers (extractLoopOutput / estimateCostUsd) so the two engines stay consistent.
 */

const STEP_CAP = 5
const DEADLINE_MS = 25_000

export const PORTAL_SYSTEM_PREAMBLE = `You are the Portal Assistant for a client of a digital marketing agency.
You help THIS client understand their own portal — their projects, approvals, invoices, briefs, leads, and social performance.
- Be concise, friendly, and professional. Use markdown for readability.
- You can ONLY see this client's own data. Never reference other clients, the agency's internal finances, or staff operations.
- Use your tools to fetch live data; never invent numbers, names, or statuses.
- If a question is outside what your tools can answer, say so honestly.`

export async function runPortalToolLoop(opts: {
  ctx: PortalToolContext
  /** Extra system context appended after the portal preamble (e.g. recalled portal memory). */
  system?: string
  messages: any[]
  seed: string
  modelSpec?: string
  fallbackSpec?: string
  /** The client's assigned apps (config narrows the toolset; null = default-all). */
  enabledApps?: string[] | null
  /** Test injection — bypasses resolveModel. */
  model?: LanguageModel
  fallbackModel?: LanguageModel
  signal?: AbortSignal
}): Promise<LoopOutput> {
  // Refuse to run without a tenant key — defense in depth (buildPortalTools also asserts).
  assertPortalScope(opts.ctx)
  const cfg = useRuntimeConfig() as any

  const sdkTools = buildPortalTools(opts.ctx, opts.seed, opts.enabledApps ?? null)
  const system = [PORTAL_SYSTEM_PREAMBLE, opts.system, spotlightSystemClause()].filter(Boolean).join('\n\n')

  const run = (m: LanguageModel) => generateText({
    model: m,
    system,
    messages: opts.messages,
    tools: sdkTools,
    stopWhen: [stepCountIs(STEP_CAP)],
    abortSignal: opts.signal ?? AbortSignal.timeout(DEADLINE_MS),
    experimental_telemetry: { isEnabled: true, recordInputs: false, recordOutputs: false, functionId: 'ai-portal-loop' },
  })

  const primarySpec = opts.modelSpec ?? cfg.aiLoopModel
  const fallbackSpec = opts.fallbackSpec ?? cfg.aiLoopFallbackModel
  const aiBinding = (opts.ctx.event?.context as any)?.cloudflare?.env?.AI
  let usedSpec: string = opts.model ? 'injected' : primarySpec
  let result
  try {
    result = await run(opts.model ?? resolveModel(primarySpec, { aiBinding }))
  } catch (err) {
    const fb = opts.fallbackModel ?? (fallbackSpec ? resolveModel(fallbackSpec, { aiBinding }) : null)
    if (!fb) throw err
    usedSpec = opts.fallbackModel ? 'injected' : fallbackSpec
    result = await run(fb)
  }

  const out = extractLoopOutput(result)
  out.costUsd = estimateCostUsd(out.usage, usedSpec)
  return out
}
