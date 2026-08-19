import { z } from 'zod'
import { roleHasPermission, type PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { McpExecutionDescriptor, McpProjectionContext, McpToolManifest } from './project'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'

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

export const GENERATION_READ_TOOL_NAMES = new Set(['get_generation_status', 'list_creative_models'])

export function isGenerationReadToolName(name: string): boolean {
  return GENERATION_READ_TOOL_NAMES.has(name)
}

const CHANNELS = z.array(z.enum(['radio', 'tiktok', 'meta'])).default([])

export const generationTools: GenerationToolDescriptor[] = [
  {
    name: 'list_creative_models',
    description:
      'List the governed image-generation, approved-source transform and vision-inspection models available to '
      + 'XeroFlow assistants, including safety classes and current spend/retention readiness. Read-only.',
    parameters: z.object({}),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'generate_banner_image',
    description:
      'Generate an owned image asset from a text prompt for an assistant brief sample or Banner Studio project. '
      + 'Recraft is restricted to non-vehicle creative. Returns an assetId, URL and automatic Qwen compliance '
      + 'evidence; failed or unavailable checks return review_blocked. This is billed and rate-limited.',
    parameters: z.object({
      prompt: z.string().min(2).max(1000),
      aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:3', '3:4']).default('1:1'),
      modelId: z.literal('aigateway/recraft-offer-card').default('aigateway/recraft-offer-card'),
      subjectType: z.literal('non_vehicle').default('non_vehicle'),
      referenceSourceAssetIds: z.array(z.string().uuid()).max(4).default([]),
      expectedPrice: z.string().max(500).optional(),
      expectedDisclaimer: z.string().max(2000).optional(),
      expectedLogo: z.string().max(500).optional(),
      title: z.string().max(120).optional(),
      clientId: z.string().uuid().optional(),
    }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'upscale_banner_image',
    description:
      'Upscale an approved source image through Cloudflare AI Gateway without regenerating its composition. '
      + 'Vehicle assets are allowed only because sourceAssetId resolves through XeroFlow\'s approval gate. '
      + 'Returns a new owned Banner Studio asset and immutable model provenance.',
    parameters: z.object({
      sourceAssetId: z.string().uuid(),
      subjectType: z.enum(['vehicle', 'non_vehicle']),
      clientId: z.string().uuid().optional(),
      targetMegapixels: z.number().int().min(1).max(128).default(4),
      outputFormat: z.enum(['webp', 'jpg', 'png']).default('webp'),
      outputQuality: z.number().int().min(0).max(100).default(90),
      enhanceDetails: z.boolean().default(false),
      enhanceRealism: z.boolean().default(false),
      expectedPrice: z.string().max(500).optional(),
      expectedDisclaimer: z.string().max(2000).optional(),
      expectedLogo: z.string().max(500).optional(),
      title: z.string().max(120).optional(),
    }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'verify_creative_compliance',
    description:
      'Run the Qwen vision pre-flight against an owned Banner Studio image and up to four approved OEM/reference '
      + 'assets. Checks vehicle/badge match, OCR disclaimer and price, logo distortion and artefacts. Returns a '
      + 'structured verdict plus an immutable checkId. A failed verdict must not be treated as publishable.',
    parameters: z.object({
      assetId: z.string().uuid(),
      clientId: z.string().uuid().optional(),
      subjectType: z.enum(['vehicle', 'non_vehicle']),
      referenceSourceAssetIds: z.array(z.string().uuid()).max(4).default([]),
      expectedPrice: z.string().max(500).optional(),
      expectedDisclaimer: z.string().max(2000).optional(),
      expectedLogo: z.string().max(500).optional(),
      notes: z.string().max(2000).optional(),
    }),
    requiredPermission: 'CREATIVE'
  },
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

/** Complete executable descriptors for the supplemental generation suite. */
export function resolveGenerationMcpExecutions(): McpExecutionDescriptor[] {
  return generationTools.map(descriptor => {
    const readOnly = isGenerationReadToolName(descriptor.name)
    return ({
    name: descriptor.name,
    canonicalName: descriptor.name,
    kind: 'supplemental' as const,
    ...(!readOnly
      ? { executionClass: 'external-provider' as const }
      : {}),
    ...(descriptor.name === 'start_music_generation'
      ? {
          preflight: async (_args: unknown, ctx: ToolContext) => {
            const { isMusicGenerationProviderAvailable } = await import('./generationRunner')
            return isMusicGenerationProviderAvailable(ctx.event)
              ? { ok: true as const }
              : {
                  ok: false as const,
                  code: 'provider_unavailable',
                  message: 'Music generation provider is unavailable.',
                  statusCode: 503
                }
          }
        }
      : {}),
    ...(!readOnly
      ? {
          executeSupplemental: async (
            args: unknown,
            ctx: ToolContext,
            services: TrustedSupplementalExecutionServices
          ): Promise<ToolResult> => {
            const { buildGenerationRunner } = await import('./generationRunner')
            const outcome = await executeGenerationTool(descriptor.name, args, ctx, {
              enabled: true,
              bypassPermissions: true,
              runner: buildGenerationRunner(services)
            })
            return outcome.ok
              ? { ok: true, data: outcome.data }
              : { ok: false, error: 'error' in outcome ? outcome.error : 'Generation failed.' }
          }
        }
      : {}),
    tool: {
      ...descriptor,
      mutates: !readOnly,
      handler: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const { buildGenerationRunner } = await import('./generationRunner')
        const outcome = await executeGenerationTool(descriptor.name, args, ctx, {
          enabled: true,
          bypassPermissions: true,
          runner: buildGenerationRunner()
        })
        return outcome.ok
          ? { ok: true, data: outcome.data }
          : { ok: false, error: 'error' in outcome ? outcome.error : 'Generation failed.' }
      }
    }
    })
  })
}

export type GenExecuteOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'not_found' | 'forbidden' | 'bad_args' | 'handler_error' }

/** Injected execution: name → runner. The real runner (internal endpoint) calls the audio engines via ctx.event bindings. */
export type GenerationRunner = Record<string, (
  args: unknown,
  ctx: ToolContext,
  services?: TrustedSupplementalExecutionServices
) => Promise<unknown>>

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
  deps: { enabled: boolean, runner: GenerationRunner, bypassPermissions?: boolean }
): Promise<GenExecuteOutcome> {
  if (!deps.enabled) return { ok: false, error: 'Generation tools are not enabled over MCP.', code: 'disabled' }

  const tool = generationTools.find(t => t.name === name)
  if (!tool) return { ok: false, error: `Unknown generation tool: ${name}`, code: 'not_found' }

  if (!deps.bypassPermissions && !roleHasPermission(ctx.userRole, tool.requiredPermission)) {
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
