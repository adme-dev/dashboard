import type { AiTool } from '~~/server/utils/ai/toolRegistry'
import type { ToolContext, ToolResult } from '~~/server/utils/ai/toolContext'
import type { TrustedSupplementalExecutionServices } from '~~/server/utils/ai/godModeExecution'
import {
  executeGoogleAdsTool,
  getGoogleAdsToolSchema,
  isGoogleAdsWriteToolName,
  projectGoogleAdsTools,
  type GoogleAdsMcpFlags
} from './googleAdsTools'
import {
  executeGoogleAdsSearchPlanningTool,
  isGoogleAdsSearchPlanningTool
} from './googleAdsSearchTools'
import { buildGoogleAdsMcpToolDependencies } from './googleAdsServer'
import {
  MCP_CONFIRM_TOOL,
  projectConfirmActionManifest,
  resolveRegisteredConfirmDescription
} from './writeTools'
import type {
  McpExecutionDescriptor,
  McpProjectionContext,
  McpToolManifest
} from './project'

function flagsFor(context: McpProjectionContext): GoogleAdsMcpFlags {
  if (context.governanceBypass) {
    return { read: true, write: true, automation: true, destructive: true }
  }
  return {
    read: context.suiteFlags.googleAdsRead === true,
    write: context.suiteFlags.googleAdsWrite === true,
    automation: context.suiteFlags.googleAdsAutomation === true,
    destructive: context.suiteFlags.googleAdsDestructive === true
  }
}

export function projectGoogleAdsMcpSuite(context: McpProjectionContext): McpToolManifest[] {
  const manifests = projectGoogleAdsTools(
    context.governanceBypass ? 'admin' : context.role,
    flagsFor(context)
  )
  return manifests.map(manifest => manifest.name === MCP_CONFIRM_TOOL
    ? projectConfirmActionManifest(resolveRegisteredConfirmDescription(context))
    : manifest)
}

async function executeGoogleAdsRegistryTool(
  name: string,
  args: unknown,
  context: ToolContext,
  flags: GoogleAdsMcpFlags
): Promise<ToolResult> {
  if (isGoogleAdsSearchPlanningTool(name)) {
    return await executeGoogleAdsSearchPlanningTool(name, args, context, flags, true)
  }
  return await executeGoogleAdsTool(
    name,
    args,
    context,
    flags,
    buildGoogleAdsMcpToolDependencies(flags)
  )
}

function executionDescriptor(
  manifest: McpToolManifest,
  flags: GoogleAdsMcpFlags
): McpExecutionDescriptor {
  const parameters = getGoogleAdsToolSchema(manifest.name)
  if (!parameters) throw new Error(`Missing Google Ads MCP schema for ${manifest.name}`)
  const mutates = isGoogleAdsWriteToolName(manifest.name)
  const tool: AiTool<unknown> = {
    name: manifest.name,
    description: manifest.description,
    parameters,
    requiredPermission: 'MEDIA_BUYING',
    mutates,
    returnsUntrusted: !mutates,
    handler: mutates
      ? async () => ({
        ok: false,
        error: 'Google Ads mutations require the authenticated owner MCP execution coordinator.'
      })
      : async (args, context) => await executeGoogleAdsRegistryTool(
        manifest.name,
        args,
        context,
        flags
      )
  }
  if (!mutates) {
    return {
      name: manifest.name,
      canonicalName: manifest.name,
      kind: 'supplemental',
      tool
    }
  }
  return {
    name: manifest.name,
    canonicalName: manifest.name,
    kind: 'supplemental',
    executionClass: 'external-provider',
    executeSupplemental: async (
      args: unknown,
      context: ToolContext,
      services: TrustedSupplementalExecutionServices
    ): Promise<ToolResult> => {
      await services.markDispatched()
      return await executeGoogleAdsRegistryTool(manifest.name, args, context, flags)
    },
    tool
  }
}

export function resolveGoogleAdsMcpExecutions(
  context: McpProjectionContext
): McpExecutionDescriptor[] {
  const flags = flagsFor(context)
  return projectGoogleAdsTools(context.governanceBypass ? 'admin' : context.role, flags)
    .filter(manifest => manifest.name !== MCP_CONFIRM_TOOL)
    .map(manifest => executionDescriptor(manifest, flags))
}
