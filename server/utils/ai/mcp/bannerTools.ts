import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { McpExecutionDescriptor, McpProjectionContext, McpToolManifest } from './project'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'
import {
  MCP_BANNER_CONFIRM_DESCRIPTION,
  projectConfirmActionManifest,
  resolveRegisteredConfirmDescription
} from './writeTools'

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

export interface BannerCreateProjectInput {
  name: string
  headline: string
  format: 'mrec'
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

// ── Immediate owner mutations ─────────────────────────────────────────────────

const BannerCreateProjectParams = z.object({
  name: z.string().trim().min(1).max(255),
  headline: z.string().trim().min(1).max(120),
  format: z.literal('mrec').default('mrec'),
}).strict()

/**
 * Direct banner mutations are projected only for a runtime-verified God Mode owner. They execute
 * through the Task-5 local transaction coordinator, which owns immutable audit and idempotency.
 */
export const bannerDirectMutationTools: BannerToolDescriptor[] = [
  {
    name: 'create_banner_project',
    description:
      'Create a new draft Banner Studio project with one renderable 300×250 MRec artboard. '
      + 'Provide the project name and headline text; the project remains editable and unpublished. '
      + 'This does not render, publish, distribute, or email the banner.',
    parameters: BannerCreateProjectParams,
    mutates: true,
    requiredPermission: 'CREATIVE',
  },
]

// ── Manifest projection ────────────────────────────────────────────────────────

/**
 * The banner tools a role may call, as MCP manifests — empty unless the suite flag is on.
 * Includes read tools + propose tool + confirm_action, all filtered by CREATIVE permission.
 * tools.post.ts dedupes by name, so co-emission with the write/video confirm is safe.
 */
export function projectBannerTools(
  role: string,
  enabled: boolean,
  options: {
    bypassPermissions?: boolean
    confirmDescription?: string
    includeDirectMutations?: boolean
  } = {}
): McpToolManifest[] {
  if (!enabled) return []
  if (!options.bypassPermissions && !roleHasPermission(role, 'CREATIVE')) return []
  const all = [
    ...bannerReadTools,
    ...bannerProposeTools,
    ...(options.includeDirectMutations && options.bypassPermissions ? bannerDirectMutationTools : []),
  ]
  const tools = all
    .filter(t => options.bypassPermissions || roleHasPermission(role, t.requiredPermission))
    .map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>,
    }))
  return [
    ...tools,
    projectConfirmActionManifest(options.confirmDescription ?? MCP_BANNER_CONFIRM_DESCRIPTION)
  ]
}

/** Registered banner/creative-production suite adapter. */
export function projectBannerMcpSuite(context: McpProjectionContext): McpToolManifest[] {
  return projectBannerTools(
    context.role,
    context.governanceBypass || context.suiteFlags.banners,
    {
      bypassPermissions: context.governanceBypass,
      includeDirectMutations: context.governanceBypass,
      confirmDescription: resolveRegisteredConfirmDescription(context)
    }
  )
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
    | { ok: false, error: string, code: 'disabled' | 'not_found' | 'forbidden' | 'bad_args' | 'handler_error' }

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
  options: { bypassPermissions?: boolean } = {}
): Promise<BannerExecuteOutcome> {
  if (!enabled) return { ok: false, error: 'Banner tools are not enabled over MCP.', code: 'disabled' }

  const tool = bannerReadTools.find(t => t.name === name)
  if (!tool) return { ok: false, error: `Unknown banner tool: ${name}`, code: 'not_found' }

  if (!options.bypassPermissions && !roleHasPermission(ctx.userRole, tool.requiredPermission)) {
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
  options: { bypassPermissions?: boolean } = {}
): Promise<BannerProposeOutcome> {
  if (!enabled) return { ok: false, error: 'Banner tools are not enabled over MCP.', code: 'disabled' }
  if (!options.bypassPermissions && !roleHasPermission(ctx.userRole, 'CREATIVE')) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  if (name !== 'propose_banner_render') {
    return { ok: false, error: `Unknown banner propose tool: ${name}`, code: 'not_found' }
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

/** Complete executable descriptors for banner reads and proposal writers. */
export function resolveBannerMcpExecutions(): McpExecutionDescriptor[] {
  const reads = bannerReadTools.map(descriptor => ({
    name: descriptor.name,
    canonicalName: descriptor.name,
    kind: 'supplemental' as const,
    tool: {
      ...descriptor,
      mutates: false,
      handler: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const { buildBannerReadRunner } = await import('./bannerRunner')
        const outcome = await executeBannerTool(
          buildBannerReadRunner(),
          descriptor.name,
          args,
          ctx,
          true,
          { bypassPermissions: true }
        )
        return outcome.ok
          ? { ok: true, data: outcome.data }
          : { ok: false, error: 'error' in outcome ? outcome.error : 'Banner tool failed.' }
      }
    }
  }))
  const proposals = bannerProposeTools.map(descriptor => ({
    name: descriptor.name,
    canonicalName: descriptor.name,
    kind: 'supplemental' as const,
    executionClass: 'internal-http' as const,
    executeSupplemental: async (args: unknown, ctx: ToolContext, services: TrustedSupplementalExecutionServices): Promise<ToolResult> => {
      const { buildBannerProposeDeps } = await import('./bannerRunner')
      const baseDeps = buildBannerProposeDeps()
      const outcome = await executeBannerPropose(
        descriptor.name,
        args,
        ctx,
        {
          ...baseDeps,
          persist: async (...persistArgs) => {
            await services.markDispatched()
            return await baseDeps.persist(...persistArgs)
          }
        },
        true,
        { bypassPermissions: true }
      )
      return outcome.ok
        ? { ok: true, data: { proposalId: outcome.proposalId } }
        : { ok: false, error: 'error' in outcome ? outcome.error : 'Banner proposal failed.' }
    },
    tool: {
      ...descriptor,
      mutates: true,
      handler: async (args: unknown, ctx: ToolContext): Promise<ToolResult> => {
        const { buildBannerProposeDeps } = await import('./bannerRunner')
        const outcome = await executeBannerPropose(
          descriptor.name,
          args,
          ctx,
          buildBannerProposeDeps(),
          true,
          { bypassPermissions: true }
        )
        return outcome.ok
          ? { ok: true, data: { proposalId: outcome.proposalId } }
          : { ok: false, error: 'error' in outcome ? outcome.error : 'Banner proposal failed.' }
      }
    }
  }))
  const directMutations = bannerDirectMutationTools.map(descriptor => ({
    name: descriptor.name,
    canonicalName: descriptor.name,
    kind: 'supplemental' as const,
    executionClass: 'local-transactional' as const,
    executeMutation: async (
      args: BannerCreateProjectInput,
      ctx: ToolContext,
      db: { query: (sql: string, params?: unknown[]) => Promise<any> }
    ): Promise<ToolResult> => {
      const { createBannerProjectDraft } = await import('./bannerRunner')
      return await createBannerProjectDraft(args, ctx, db)
    },
    tool: {
      ...descriptor,
      mutates: true,
      handler: async (): Promise<ToolResult> => ({
        ok: false,
        error: 'Banner project creation requires the authenticated God Mode mutation coordinator.'
      })
    }
  }))
  return [...reads, ...proposals, ...directMutations]
}
