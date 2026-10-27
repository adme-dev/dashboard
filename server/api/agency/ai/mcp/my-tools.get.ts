// server/api/agency/ai/mcp/my-tools.get.ts
// Session-facing companion to the Connect AI Assistants page (/agency/ai/connectors).
// Previews which tools an external AI host (Claude / Cursor / ChatGPT) would expose for the signed-in
// staff member — the complete registered union for an active owner authority, otherwise the SAME
// staff projection tools/list serves (marketingPolicy.projectMcpToolsForStaff) with the same runtime
// flags and fresh authority. It cannot see the OAuth grant of a future connection, so it states the
// scopes it assumes and marks the tools that need write consent.
// This is informational only: requireAuth (no MCP secret), never executes a tool.
import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { registry } from '~~/server/utils/ai/tools'
import { projectGodModeTools } from '~~/server/utils/ai/mcp/registry'
import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import {
  isActiveGodModeAuthority,
  resolveGodModeAuthority
} from '~~/server/utils/godMode/authority'
import { isMcpManagementStaff, projectMcpToolsForStaff } from '~~/server/utils/ai/mcp/marketingPolicy'
import { resolveMcpRuntimeConfig } from '~~/server/utils/ai/mcp/runtimeConfig'
import { resolveMcpStaffContext } from '~~/server/utils/ai/mcp/staffAuthority'
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE, isWriteScopeToolName } from '~~/server/utils/ai/mcp/scope'

/** The preview assumes a connection that consented to both scopes; actual tools/list narrows to the grant. */
const ASSUMED_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE]

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const role = user.role ?? ''
  const runtime = resolveMcpRuntimeConfig(event)
  const authority = await resolveGodModeAuthority(event, user.id)
  const activeGodMode = isActiveGodModeAuthority(authority, user.id)
  const projectionContext = {
    tools: registry as AiTool<unknown>[],
    role,
    scopes: ASSUMED_SCOPES,
    requireWriteScope: runtime.legacyRequireWriteScope,
    suiteFlags: runtime.suiteFlags
  }
  const base = {
    enabled: runtime.serverEnabled,
    workerOrigin: runtime.workerOrigin
  }

  if (activeGodMode) {
    return {
      ...base,
      role,
      authority: 'god_mode' as const,
      preview: { assumedScopes: ASSUMED_SCOPES, projection: 'owner' as const },
      tools: projectGodModeTools(projectionContext).map(t => ({ name: t.name, description: t.description }))
    }
  }

  const staff = await resolveMcpStaffContext(event, user.id, ASSUMED_SCOPES, { runtimeConfig: runtime })
  const tools = projectMcpToolsForStaff({ context: projectionContext, staff })
  return {
    ...base,
    role: staff.userRole,
    preview: {
      assumedScopes: ASSUMED_SCOPES,
      projection: isMcpManagementStaff(staff) ? 'management' as const : 'staff' as const
    },
    marketingCapabilities: staff.marketingCapabilities ?? [],
    // Display only the already-resolved fresh authority; never enumerate clients or query providers.
    access: {
      permissionGroups: staff.permissionGroups ?? [],
      readOnly: staff.assistantReadOnly === true,
      clientScope: {
        mode: staff.assistantScope?.clientAccessMode ?? 'assigned',
        assignedClientCount: staff.assistantScope?.clientAccessMode === 'all_active'
          ? null
          : (staff.assistantScope?.assignedClientIds.length ?? 0)
      }
    },
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      requiresWriteScope: isWriteScopeToolName(t.name)
    }))
  }
})
