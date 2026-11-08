import { resolveChatRuntime } from '../chatRuntime'
import { queryOneFresh } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import type { ToolContext } from '../toolContext'
import { resolvePersonalAssistantContext } from '../personalAssistantContext'
import { composeEffectiveAssistantTools } from '../governance/catalogComposition'
import { resolvePersona } from '../personas'

/** A click never revives a retired release, personal disabled tool, narrowed persona or read-only role. */
export async function nativeConfirmationAllowed(tool: AiTool<unknown>, ctx: ToolContext): Promise<boolean> {
  if (!ctx.conversationId || !resolveChatRuntime(ctx.event).toolsEnabled) return false
  const context = await resolvePersonalAssistantContext({ userId: ctx.userId, event: ctx.event })
  const conversation = await queryOneFresh<{ system_context: { persona?: string | null } }>(
    `SELECT system_context FROM ai_conversations WHERE id=$1 AND user_id=$2 AND is_archived=FALSE`,
    [ctx.conversationId, ctx.userId]
  )
  if (!conversation) return false
  const persona = resolvePersona(conversation.system_context?.persona ?? context.preferences.personaKey)
  const composition = composeEffectiveAssistantTools({
    rbacFilteredTools: tool.requiredPermission && !context.permissionGroups.includes(tool.requiredPermission) ? [] : [tool],
    catalogRows: context.catalogRows,
    grantedPermissionGroups: context.permissionGroups,
    personaToolAllowlist: persona.toolAllowlist,
    disabledTools: context.preferences.disabledTools,
    readOnly: context.isReadOnly,
    runtimePolicy: context.runtimePolicy,
    actorUserId: ctx.userId
  })
  return composition.tools.some(candidate => candidate.name === tool.name)
}
