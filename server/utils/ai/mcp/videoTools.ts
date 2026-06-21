import { z } from 'zod'
import { roleHasPermission } from '~~/server/utils/permissions'
import type { PermissionGroup } from '~~/server/utils/permissions'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { McpToolManifest } from './project'

/**
 * MCP Server Phase 2b — owned video-generation suite over MCP (spec:
 * docs/superpowers/specs/2026-06-21-mcp-phase2b-video-generation-design.md).
 *
 * Mirrors the 2a generation pattern: this module is PURE (descriptors + projection + guards + injected-
 * dep propose/confirm), unit-testable with no Cloudflare bindings; the binding half lives in
 * videoRunner.ts. The read tools (this file's first half) discover AV projects + models + jobs and poll
 * status — no spend, no writes — gated by MCP_VIDEO_TOOLS_ENABLED + the CREATIVE permission. The
 * confirm-tier propose/confirm half (added below) reuses the dormant 2c ai_pending_actions machinery.
 */

export interface VideoToolDescriptor {
  name: string
  description: string
  parameters: z.ZodTypeAny
  requiredPermission: PermissionGroup
}

const UUID = z.string().uuid()

export const videoReadTools: VideoToolDescriptor[] = [
  {
    name: 'list_av_projects',
    description:
      'List the AV (audio-visual) projects you can generate video into. Returns id/title/client/hasTimeline. '
      + 'Pick a projectId before starting a generation, or call create_video_project to make a new one.',
    parameters: z.object({}),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'list_video_models',
    description:
      'List selectable video-generation models and, per model, the allowed modes / durations / aspect-ratios / '
      + 'resolutions / subject-types, plus the tenant monthly cap. Use this to form a valid propose_video_generation '
      + 'call. Optional projectId scopes to that tenant\'s policy.',
    parameters: z.object({ projectId: UUID.optional() }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'list_video_generations',
    description: 'List recent video-generation jobs for an AV project (status, mode, model, cost, createdAt).',
    parameters: z.object({ projectId: UUID }),
    requiredPermission: 'CREATIVE'
  },
  {
    name: 'get_video_generation_status',
    description:
      'Check a video-generation job by id. Returns status and, when ready, the output asset URL. '
      + 'Poll after confirming a propose_video_generation.',
    parameters: z.object({ jobId: UUID }),
    requiredPermission: 'CREATIVE'
  }
]

/** The video READ tools a role may call, as MCP manifests — empty unless the suite flag is on. */
export function projectVideoReadTools(role: string, suiteEnabled: boolean): McpToolManifest[] {
  if (!suiteEnabled) return []
  return videoReadTools
    .filter(t => roleHasPermission(role, t.requiredPermission))
    .map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: z.toJSONSchema(t.parameters) as Record<string, unknown>
    }))
}

/** Keep only AV projects the actor may use: admin/owner see all; everyone else sees their own. */
export function filterUsableAvProjects<T extends { mediaType: string, createdBy?: string | null }>(
  projects: T[],
  actor: { id: string, role: string }
): T[] {
  const all = actor.role === 'admin' || actor.role === 'owner'
  return projects.filter(p => p.mediaType === 'av' && (all || p.createdBy === actor.id))
}

export type VideoExecuteOutcome
  = | { ok: true, data: unknown }
    | { ok: false, error: string, code: 'disabled' | 'not_found' | 'forbidden' | 'bad_args' | 'handler_error' }

/** Injected execution for the read tools: name → runner. The real runner reaches the engine via ctx. */
export type VideoReadRunner = Record<string, (args: unknown, ctx: ToolContext) => Promise<unknown>>

/**
 * Execute ONE video READ tool. Defense-in-depth at the wire boundary, mirroring executeGenerationTool:
 *  - suite flag off → disabled · unknown tool → not_found · role lacks CREATIVE → forbidden
 *  - args fail Zod → bad_args (the host is untrusted) · runner missing/throws → handler_error
 * Never throws — every failure is a typed outcome.
 */
export async function executeVideoTool(
  name: string,
  args: unknown,
  ctx: ToolContext,
  deps: { enabled: boolean, runner: VideoReadRunner }
): Promise<VideoExecuteOutcome> {
  if (!deps.enabled) return { ok: false, error: 'Video tools are not enabled over MCP.', code: 'disabled' }

  const tool = videoReadTools.find(t => t.name === name)
  if (!tool) return { ok: false, error: `Unknown video tool: ${name}`, code: 'not_found' }

  if (!roleHasPermission(ctx.userRole, tool.requiredPermission)) {
    return { ok: false, error: 'Not permitted.', code: 'forbidden' }
  }

  const parsed = tool.parameters.safeParse(args)
  if (!parsed.success) return { ok: false, error: 'Invalid arguments.', code: 'bad_args' }

  const run = deps.runner[name]
  if (!run) return { ok: false, error: 'No runner registered for tool.', code: 'handler_error' }

  try {
    return { ok: true, data: await run(parsed.data, ctx) }
  } catch {
    return { ok: false, error: 'Video tool failed.', code: 'handler_error' }
  }
}
