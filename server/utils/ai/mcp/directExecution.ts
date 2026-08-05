import { createError, type H3Event } from 'h3'

import type { McpRequestClaim } from '~~/shared/utils/mcpRequestClaim'
import {
  executeTrustedMcpGodModeReadTool,
  executeTrustedMcpGodModeResolvedMutation,
  executeTrustedMcpGodModeTool
} from '~~/server/utils/ai/godModeExecution'
import { registry } from '~~/server/utils/ai/tools'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { GodModeBypassedControl } from '~~/server/utils/godMode/audit'
import { resolveGodModeMcpExecution } from './registry'
import type { McpExecutionDescriptor, McpProjectionContext } from './project'
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
  requireWriteScope?: boolean
}

export interface GodModeMcpCallDependencies {
  resolveExecution: (name: string) => McpExecutionDescriptor | null
  executeWrite: typeof executeTrustedMcpGodModeTool
  executeRead: typeof executeTrustedMcpGodModeReadTool
  executeResolvedMutation: typeof executeTrustedMcpGodModeResolvedMutation
}

const ownerProjectionContext: McpProjectionContext = {
  tools: registry,
  role: 'owner',
  scopes: ['mcp:read'],
  requireWriteScope: true,
  suiteFlags: {
    generation: false,
    writes: false,
    financial: false,
    video: false,
    videoGeneration: false,
    banners: false
  }
}

const defaultDependencies: GodModeMcpCallDependencies = {
  resolveExecution: name => resolveGodModeMcpExecution(ownerProjectionContext, name),
  executeWrite: executeTrustedMcpGodModeTool,
  executeRead: executeTrustedMcpGodModeReadTool,
  executeResolvedMutation: executeTrustedMcpGodModeResolvedMutation
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

    const execution = deps.resolveExecution(input.toolName)
    if (!execution) throw createError({ statusCode: 404, statusMessage: 'God mode MCP tool is unavailable' })
    const missingWriteScope = !!execution.tool.mutates
      && input.requireWriteScope === true
      && !input.claim.scope.includes('mcp:write')
    const bypassedControls: GodModeBypassedControl[] = execution.tool.mutates
      ? (missingWriteScope ? ['confirmation', 'mcp_scope'] : ['confirmation'])
      : []

    if (execution.tool.mutates && execution.kind === 'supplemental') {
      return await deps.executeResolvedMutation({
        event: input.event,
        authenticatedUserId: input.claim.uid,
        authority: input.authority,
        sessionDigest: input.claim.bodyDigest,
        toolName: execution.name,
        args: input.args,
        idempotencyKey: input.idempotencyKey,
        tool: execution.tool,
        executionClass: execution.executionClass,
        preflight: execution.preflight,
        executeMutation: execution.executeMutation,
        executeSupplemental: execution.executeSupplemental,
        bypassedControls
      })
    }

    if (execution.tool.mutates) {
      return await deps.executeWrite({
        event: input.event,
        authenticatedUserId: input.claim.uid,
        authority: input.authority,
        sessionDigest: input.claim.bodyDigest,
        toolName: execution.canonicalName,
        auditToolName: execution.name,
        args: input.args,
        idempotencyKey: input.idempotencyKey,
        bypassedControls
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
      tool: execution.tool,
      args: input.args,
      ctx
    })
  }
}

export const executeGodModeMcpCall = createGodModeMcpCallExecutor(defaultDependencies)
