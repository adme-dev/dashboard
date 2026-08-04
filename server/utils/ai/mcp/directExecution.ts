import { createError, type H3Event } from 'h3'

import type { McpRequestClaim } from '~~/shared/utils/mcpRequestClaim'
import {
  executeTrustedMcpGodModeReadTool,
  executeTrustedMcpGodModeTool
} from '~~/server/utils/ai/godModeExecution'
import { registry } from '~~/server/utils/ai/tools'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import {
  isActiveGodModeAuthority,
  type GodModeAuthority
} from '~~/server/utils/godMode/authority'

export interface GodModeMcpCallInput {
  event: H3Event
  claim: McpRequestClaim
  authority: GodModeAuthority
  idempotencyKey: string
  toolName: string
  args: unknown
}

export interface GodModeMcpCallDependencies {
  resolveTool: (name: string) => AiTool<any> | null
  executeWrite: typeof executeTrustedMcpGodModeTool
  executeRead: typeof executeTrustedMcpGodModeReadTool
}

const defaultDependencies: GodModeMcpCallDependencies = {
  resolveTool: name => registry.find(tool => tool.name === name) ?? null,
  executeWrite: executeTrustedMcpGodModeTool,
  executeRead: executeTrustedMcpGodModeReadTool
}

function forbidden(statusMessage: string): never {
  throw createError({ statusCode: 403, statusMessage })
}

export function createGodModeMcpCallExecutor(deps: GodModeMcpCallDependencies) {
  return async function execute(input: GodModeMcpCallInput): Promise<ToolResult> {
    if (
      input.claim.uid !== input.authority.actorUserId
      || !isActiveGodModeAuthority(input.authority, input.claim.uid)
    ) forbidden('Invalid MCP owner authority')
    if (!/^mcp:[0-9a-f]{64}$/.test(input.idempotencyKey)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid MCP logical idempotency key' })
    }

    const tool = deps.resolveTool(input.toolName)
    if (!tool) throw createError({ statusCode: 404, statusMessage: 'God mode MCP tool is unavailable' })
    if (tool.mutates && !input.claim.scope.includes('mcp:write')) {
      return { ok: false, error: 'This action requires write access. Reconnect your AI assistant and grant write (mcp:write) to use it.' }
    }

    if (tool.mutates) {
      return await deps.executeWrite({
        event: input.event,
        authenticatedUserId: input.claim.uid,
        authority: input.authority,
        sessionDigest: input.claim.bodyDigest,
        toolName: input.toolName,
        args: input.args,
        idempotencyKey: input.idempotencyKey
      })
    }

    const ctx: ToolContext = {
      userId: input.claim.uid,
      userRole: 'owner',
      permissionGroups: [],
      source: 'mcp',
      event: input.event
    }
    return await deps.executeRead({
      event: input.event,
      authenticatedUserId: input.claim.uid,
      authority: input.authority,
      sessionDigest: input.claim.bodyDigest,
      idempotencyKey: input.idempotencyKey,
      tool,
      args: input.args,
      ctx
    })
  }
}

export const executeGodModeMcpCall = createGodModeMcpCallExecutor(defaultDependencies)
