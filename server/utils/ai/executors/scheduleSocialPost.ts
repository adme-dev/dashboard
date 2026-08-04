import type { ToolContext } from '../toolContext'
import { proposalToSocialPostBody } from '../tools/scheduleSocialPost'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * The propose_schedule_post executor (Phase 2). On a confirmed proposal it creates the social post
 * via the existing publishing endpoint. The POST is injected (`post`) so the executor is unit-testable;
 * the default uses Nitro's global $fetch (resolves the internal relative route on the CF runtime — see
 * #129). Low-risk (`confirm`): it writes an internal draft/scheduled row, not a live platform publish.
 */
export type SocialPostPoster = (body: ReturnType<typeof proposalToSocialPostBody>, ctx: ToolContext) => Promise<{ id: string }>

const internalFetch = (<T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => (globalThis as any).$fetch(request, options) as Promise<T>) as <T = unknown>(
  request: string,
  options: { method: string; body?: unknown; headers?: unknown }
) => Promise<T>

const defaultPoster: SocialPostPoster = (body, ctx) =>
  internalFetch<{ id: string }>('/api/agency/social/publishing/posts', { method: 'POST', body, headers: ctx.event.headers as any })

export function makeScheduleSocialPostExecutor(post: SocialPostPoster = defaultPoster): ActionExecutor {
  return {
    toolName: 'propose_schedule_post',
    label: 'social post',
    riskTier: 'confirm',
    requiredPermission: 'CREATIVE',
    executionClass: 'internal-http',
    async execute(payload: any, ctx: ToolContext): Promise<ExecutorResult> {
      const created = await post(proposalToSocialPostBody(payload), ctx)
      const client = payload?.clientName ?? 'the client'
      const when = payload?.status === 'scheduled' && payload?.scheduledAt
        ? ` scheduled for ${payload.scheduledAt}`
        : ' as a draft'
      return {
        resultRef: created.id,
        summary: `✅ Created social post for ${client}${when}.`,
      }
    },
  }
}

export const scheduleSocialPostExecutor: ActionExecutor = makeScheduleSocialPostExecutor()
