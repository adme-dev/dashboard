import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { McpToolManifest } from './project'

/**
 * MCP Server Phase 2b — banner-render suite over MCP.
 *
 * Mirrors videoTools.ts: PURE descriptors + manifest projection + injected-dep propose/execute,
 * unit-testable with no Cloudflare bindings. The read tools discover banner projects and poll
 * render-job status. The propose tool queues a render via the confirm-tier ai_pending_actions
 * machinery — nothing is spent until confirm_action(proposalId) is called.
 *
 * Gated by MCP_BANNER_TOOLS_ENABLED + the CREATIVE permission.
 */

export interface BannerToolDescriptor {
  name: string
  description: string
  parameters: z.ZodTypeAny
  mutates?: boolean
  requiredPermission: PermissionGroup
}

// ── Read tools ─────────────────────────────────────────────────────────────────

export const bannerReadTools: BannerToolDescriptor[] = [
  {
    name: 'list_banner_projects',
    description:
      'List banner projects you can render into. Returns id/name/formats/updatedAt. '
      + 'Pick a project (and one of its formats) before calling propose_banner_render.',
    parameters: z.object({}),
    requiredPermission: 'CREATIVE',
  },
  {
    name: 'get_banner_render_status',
    description:
      'Check the status of one or more banner render jobs by job id. '
      + 'Returns status and, when complete, the output asset URL. '
      + 'Poll after confirming a propose_banner_render.',
    parameters: z.object({
      jobIds: z.array(z.string()).min(1).max(20),
    }),
    requiredPermission: 'CREATIVE',
  },
]

// ── Propose tools ──────────────────────────────────────────────────────────────

const BannerRenderParams = z.object({
  project: z.string().min(1),
  format: z.string().min(1),
  fps: z.number().int().min(12).max(60).default(30),
  quality: z.union([z.literal(1), z.literal(2)]).default(1),
})

export const bannerProposeTools: BannerToolDescriptor[] = [
  {
    name: 'propose_banner_render',
    description:
      'Propose (does NOT render yet) a banner render job for a project/format pair. '
      + 'Returns a proposalId. Call confirm_action(proposalId) to start the render. '
      + 'Use list_banner_projects to find valid project names and their supported formats.',
    parameters: BannerRenderParams,
    mutates: true,
    requiredPermission: 'CREATIVE',
  },
]

// ── Manifest projection ────────────────────────────────────────────────────────

/**
 * The banner tools a role may call, as MCP manifests — empty unless the suite flag is on.
 * Includes read tools + propose tool, all filtered by CREATIVE permission.
 */
export function projectBannerTools(role: string, enabled: boolean): McpToolManifest[] {
  if (!enabled) return []
  if (!roleHasPermission(role, 'CREATIVE')) return []
  const all = [...bannerReadTools, ...bannerProposeTools]
  return all
    .filter(t => roleHasPermission(role, t.requiredPermission))
    .map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>,
    }))
}

// ── Confirm-action constants ────────────────────────────────────────────────────

export const BANNER_CONFIRM_ACTIONS = ['banner_render'] as const
export type BannerConfirmAction = typeof BANNER_CONFIRM_ACTIONS[number]

/** Which confirm-tier banner action a propose tool targets; null for anything else. */
export function resolveBannerProposeAction(name: string): BannerConfirmAction | null {
  if (name === 'propose_banner_render') return 'banner_render'
  return null
}

// ── Execute outcomes ───────────────────────────────────────────────────────────

export type BannerExecuteOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'not_found' | 'forbidden' | 'bad_args' | 'handler_error' }

export type BannerProposeOutcome
  = | { ok: true, proposalId: string }
    | { ok: false, error: string, code: 'disabled' | 'forbidden' | 'bad_args' | 'handler_error' }

// ── Read tool execution ────────────────────────────────────────────────────────

/** Injected execution for the banner read tools: name → runner. */
export type BannerReadRunner = Record<string, (args: unknown, ctx: ToolContext) => Promise<unknown>>

/**
 * Execute ONE banner read tool. Defense-in-depth at the wire boundary, mirroring executeVideoTool:
 *  - flag off → disabled · unknown tool → not_found · role lacks CREATIVE → forbidden
 *  - args fail Zod → bad_args · runner missing/throws → handler_error
 * Never throws — every failure is a typed outcome.
 */
export async function executeBannerTool(
  runner: BannerReadRunner,
  name: string,
  args: unknown,
  ctx: ToolContext,
  enabled: boolean,
): Promise<BannerExecuteOutcome> {
  if (!enabled) return { ok: false, error: 'Banner tools are not enabled over MCP.', code: 'disabled' }

  const tool = bannerReadTools.find(t => t.name === name)
  if (!tool) return { ok: false, error: `Unknown banner tool: ${name}`, code: 'not_found' }

  if (!roleHasPermission(ctx.userRole, tool.requiredPermission)) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }

  const run = runner[name]
  if (!run) return { ok: false, error: 'No runner registered for tool.', code: 'handler_error' }

  try {
    return { ok: true, data: await run(parsed.data, ctx) }
  } catch {
    return { ok: false, error: 'Banner tool failed.', code: 'handler_error' }
  }
}

// ── Propose execution ──────────────────────────────────────────────────────────

/** The resolved payload a `banner_render` proposal persists. */
export interface BannerRenderPendingPayload {
  projectId: string
  format: string
  fps: number
  quality: 1 | 2
}

export interface BannerProposeDeps {
  /** Resolve a banner project by name or id. Returns null if not found. */
  resolveProject: (project: string, ctx: ToolContext) => Promise<{ id: string, name: string, formats: string[] } | null>
  /** Persist an ai_pending_actions row (tool_name = action) and return { proposalId }. */
  persist: (ctx: ToolContext, action: BannerConfirmAction, payload: BannerRenderPendingPayload) => Promise<{ proposalId: string }>
}

/**
 * Propose a banner render action. Never throws. Spends nothing — at most persists a pending row.
 *  - flag off → disabled · role lacks CREATIVE → forbidden
 *  - args fail Zod → bad_args · project not found → forbidden
 *  - format not on the project → bad_args · persist error → handler_error
 */
export async function executeBannerPropose(
  name: string,
  args: unknown,
  ctx: ToolContext,
  deps: BannerProposeDeps,
  enabled: boolean,
): Promise<BannerProposeOutcome> {
  if (!enabled) return { ok: false, error: 'Banner tools are not enabled over MCP.', code: 'disabled' }
  if (!roleHasPermission(ctx.userRole, 'CREATIVE')) return { ok: false, error: 'Not permitted.', code: 'forbidden' }

  if (name !== 'propose_banner_render') {
    return { ok: false, error: `Unknown banner propose tool: ${name}`, code: 'not_found' as any }
  }

  const parsed = BannerRenderParams.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }

  const p = parsed.data
  try {
    const project = await deps.resolveProject(p.project, ctx)
    if (!project) return { ok: false, error: 'Banner project not found.', code: 'forbidden' }

    if (!project.formats.includes(p.format)) {
      return { ok: false, error: `Format '${p.format}' is not available for this project. Available: ${project.formats.join(', ')}.`, code: 'bad_args' }
    }

    const payload: BannerRenderPendingPayload = {
      projectId: project.id,
      format: p.format,
      fps: p.fps,
      quality: p.quality,
    }
    const { proposalId } = await deps.persist(ctx, 'banner_render', payload)
    return { ok: true, proposalId }
  } catch {
    return { ok: false, error: 'Propose failed.', code: 'handler_error' }
  }
}
