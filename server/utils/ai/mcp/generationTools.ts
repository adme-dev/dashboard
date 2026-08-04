import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { McpProjectionContext, McpToolManifest } from './project'

/**
 * MCP Server Phase 2a — owned media-generation tools (spec: ai-copilot-mcp-server-phase2 §4).
 *
 * These are NOT in the in-app read registry: they BILL and persist assets, so they live in their own
 * group, gated by `MCP_GEN_TOOLS_ENABLED` (default off) and the CREATIVE permission. The read-only
 * guard (`executeReadOnlyTool`) still hard-blocks every `mutates` registry tool; this is the separate,
 * explicitly-gated action path. PURE over an injected `runner` so the projection + guard are unit-
 * testable without the Cloudflare bindings (queues/R2/DB) the real runner needs.
 *
 * Async shape: long jobs are `start_*` (returns a jobId immediately) + `get_generation_status` (poll).
 * Voiceover is fast/synchronous and returns the asset directly.
 */

export interface GenerationToolDescriptor {
  name: string
  description: string
  parameters: z.ZodTypeAny
  requiredPermission: PermissionGroup
}

const CHANNELS = z.array(z.enum(['radio', 'tiktok', 'meta'])).default([])

export const generationTools: GenerationToolDescriptor[] = [
  {
    name: 'generate_voiceover',
    description:
      'Generate an owned, licence-clear AI voiceover from text. Synchronous — returns the finished audio asset. '
      + 'Use for radio/TikTok/Meta scripts; output is brand-safe and cleared for paid use.',
    parameters: z.object({
      text: z.string().min(2).max(2000),
      lang: z.string().max(12).default('en'),
      voice: z.string().max(40).optional(),
      title: z.string().max(120).optional(),
      clientId: z.string().uuid().optional(),
      channels: CHANNELS
    }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'start_music_generation',
    description:
      'Start an owned AI music-generation job from a text brief. Asynchronous — returns a jobId immediately; '
      + 'poll get_generation_status for the finished track. Copyrighted-artist prompts are rejected. '
      + 'Owned + licence-clear for paid channels.',
    parameters: z.object({
      prompt: z.string().min(2).max(2000),
      isInstrumental: z.boolean().default(false),
      lyrics: z.string().max(3500).optional(),
      format: z.enum(['mp3', 'wav']).default('mp3'),
      title: z.string().max(120).optional(),
      clientId: z.string().uuid().optional(),
      channels: CHANNELS
    }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'get_generation_status',
    description:
      'Check an async generation job (e.g. music). Returns its status and, when ready, the asset URL. '
      + 'Poll this after start_music_generation until status is "done" or "failed".',
    parameters: z.object({ jobId: z.string().uuid() }),
    requiredPermission: 'CREATIVE'
  }
]

/** The generation tools a role may call, as MCP manifests — empty unless the group flag is on. */
export function projectGenerationTools(
  role: string,
  enabled: boolean,
  options: { bypassPermissions?: boolean } = {}
): McpToolManifest[] {
  if (!enabled) return []
  return generationTools
    .filter(t => options.bypassPermissions || roleHasPermission(role, t.requiredPermission))
    .map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
    }))
}

/** Registered-suite adapter. God mode bypasses both the suite flag and role permission narrowing. */
export function projectGenerationMcpSuite(context: McpProjectionContext): McpToolManifest[] {
  return projectGenerationTools(
    context.role,
    context.governanceBypass || context.suiteFlags.generation,
    { bypassPermissions: context.governanceBypass }
  )
}

export type GenExecuteOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'not_found' | 'forbidden' | 'bad_args' | 'handler_error' }

/** Injected execution: name → runner. The real runner (internal endpoint) calls the audio engines via ctx.event bindings. */
export type GenerationRunner = Record<string, (args: unknown, ctx: ToolContext) => Promise<unknown>>

/**
 * Execute ONE generation tool. Defense-in-depth at the wire boundary, mirroring executeReadOnlyTool:
 *  - group flag off → disabled (never runs)
 *  - unknown tool → not_found
 *  - role lacks CREATIVE → forbidden
 *  - args fail Zod → bad_args (the host is untrusted input)
 *  - runner missing/throws → handler_error
 * Never throws — every failure is a typed outcome.
 */
export async function executeGenerationTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  deps: { enabled: boolean, runner: GenerationRunner }
): Promise<GenExecuteOutcome> {
  if (!deps.enabled) return { ok: false, error: 'Generation tools are not enabled over MCP.', code: 'disabled' }

  const tool = generationTools.find(t => t.name === name)
  if (!tool) return { ok: false, error: `Unknown generation tool: ${name}`, code: 'not_found' }

  if (!roleHasPermission(ctx.userRole, tool.requiredPermission)) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }

  const run = deps.runner[name]
  if (!run) return { ok: false, error: 'No runner registered for tool.', code: 'handler_error' }

  try {
    const data = await run(parsed.data, ctx)
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Generation failed.', code: 'handler_error' }
  }
}
