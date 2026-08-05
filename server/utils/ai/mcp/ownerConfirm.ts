import { execute, queryOne } from '~~/server/utils/db'
import { getExecutor } from '~~/server/utils/ai/executors'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'
import {
  dispatchBannerConfirm,
  buildBannerConfirmDeps
} from './bannerRunner'
import type { BannerRenderPendingPayload } from './bannerTools'
import {
  buildVideoConfirmDeps
} from './videoRunner'
import {
  dispatchVideoConfirm,
  type VideoGenerationPendingPayload
} from './videoTools'
import {
  executeWriteConfirm,
  type ClaimedProposal
} from './writeTools'

/**
 * Active-owner confirmation over the existing MCP pending-action protocol. The outer resolved-tool
 * coordinator owns immutable attempt/outcome audit and logical idempotency; this dispatcher retains
 * the pending row's atomic single-use claim and every provider/budget hard boundary.
 */
export async function executeOwnerMcpConfirm(
  args: unknown,
  ctx: ToolContext,
  execution?: TrustedSupplementalExecutionServices
): Promise<ToolResult> {
  const videoConfirmDeps = buildVideoConfirmDeps()
  const outcome = await executeWriteConfirm(args, ctx, {
    enabled: true,
    writeEnabled: true,
    financialEnabled: true,
    execution,
    getExecutor,
    claim: async (proposalId, uid) => queryOne<ClaimedProposal>(
      `UPDATE ai_pending_actions SET status='executed', confirmed_by=$2, executed_at=now()
        WHERE id = $1 AND user_id = $2 AND status='proposed' AND source='mcp' AND expires_at > now()
        RETURNING tool_name, resolved_payload`,
      [proposalId, uid]
    ).catch(() => null),
    revertClaim: async (proposalId, uid) => {
      await execute(
        `UPDATE ai_pending_actions SET status='proposed', confirmed_by=NULL, executed_at=NULL
          WHERE id = $1 AND user_id = $2 AND status='executed' AND source='mcp'`,
        [proposalId, uid]
      ).catch(() => {})
    },
    videoDispatch: async (row, videoCtx) => {
      const payload = row.tool_name === 'video_generation'
        ? {
            ...(row.resolved_payload as VideoGenerationPendingPayload),
            idempotencyKey: ctx.godModeExecutionKey
          }
        : row.resolved_payload
      return await dispatchVideoConfirm(
        { tool_name: row.tool_name, resolved_payload: payload },
        videoCtx,
        { genEnabled: true, ...videoConfirmDeps, execution }
      )
    },
    bannerDispatch: async (row, bannerCtx) => {
      if (row.tool_name !== 'banner_render') return null
      return await dispatchBannerConfirm(
        row.resolved_payload as BannerRenderPendingPayload,
        bannerCtx,
        { ...buildBannerConfirmDeps(), execution }
      )
    }
  })
  return outcome.ok
    ? { ok: true, data: outcome.data }
    : { ok: false, error: 'error' in outcome ? outcome.error : 'Confirmation failed.' }
}
