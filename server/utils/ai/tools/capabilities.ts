import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import type { ToolContext, ToolResult } from '../toolContext'
import { ok, fail } from '../toolContext'
import { MCP_GEN_RATE_MAX, MCP_GEN_RATE_WINDOW_MIN } from '../mcp/rateLimit'
import { hasWriteScope, isWriteScopeToolName } from '../mcp/scope'

const params = z.object({})
type Args = z.infer<typeof params>
type ToolMode = 'read' | 'propose_only' | 'confirmation' | 'direct_generation'

export type CapabilityInspection = {
  tools: Array<{ name: string, mode: ToolMode }>
  suites: {
    textModels: boolean
    imageGeneration: boolean
    bannerStudio: boolean
    video: boolean
    audio: boolean
  }
}

export type CapabilitiesDeps = {
  inspect: (ctx: ToolContext) => Promise<CapabilityInspection>
}

const defaultDeps: CapabilitiesDeps = {
  inspect: async (ctx) => {
    const [toolModule, projectModule, generationModule, videoModule, bannerModule, writeModule] = await Promise.all([
      import('./index'),
      import('../mcp/project'),
      import('../mcp/generationTools'),
      import('../mcp/videoTools'),
      import('../mcp/bannerTools'),
      import('../mcp/writeTools'),
    ])
    const registryTools = toolModule.registry as AiTool<unknown>[]
    const genEnabled = process.env.MCP_GEN_TOOLS_ENABLED === 'true'
    const videoEnabled = process.env.MCP_VIDEO_TOOLS_ENABLED === 'true'
    const videoGenEnabled = videoEnabled && process.env.MCP_VIDEO_GEN_ENABLED === 'true'
    const bannerEnabled = process.env.MCP_BANNER_TOOLS_ENABLED === 'true'
    const writeEnabled = process.env.MCP_WRITE_TOOLS_ENABLED === 'true'
    const financialEnabled = process.env.MCP_FINANCIAL_TOOLS_ENABLED === 'true'
    const manifests = [
      ...projectModule.projectReadOnlyTools(registryTools, ctx.userRole),
      ...generationModule.projectGenerationTools(ctx.userRole, genEnabled),
      ...writeModule.projectWriteTools(registryTools, ctx.userRole, writeEnabled),
      ...videoModule.projectVideoTools(ctx.userRole, { suite: videoEnabled, gen: videoGenEnabled }),
      ...bannerModule.projectBannerTools(ctx.userRole, bannerEnabled),
      ...writeModule.projectFinancialTools(registryTools, ctx.userRole, financialEnabled),
    ]
    const grantedScopes = new Set(ctx.mcpScopes ?? [])
    const scopeFiltered = process.env.MCP_REQUIRE_WRITE_SCOPE === 'true' && !hasWriteScope(grantedScopes)
      ? manifests.filter(tool => !isWriteScopeToolName(tool.name))
      : manifests
    const generationNames = new Set(generationModule.generationTools.map(tool => tool.name).filter(name => name !== 'get_generation_status'))
    const unique = [...new Map(scopeFiltered.map(manifest => {
      const mode: ToolMode = manifest.name === 'confirm_action'
        ? 'confirmation'
        : generationNames.has(manifest.name)
          ? 'direct_generation'
          : manifest.name.startsWith('propose_') || manifest.name === 'create_video_project'
            ? 'propose_only'
            : 'read'
      return [manifest.name, { name: manifest.name, mode }]
    })).values()]
    return {
      tools: unique,
      suites: {
        textModels: true,
        imageGeneration: unique.some(tool => tool.name === 'generate_banner_image'),
        bannerStudio: unique.some(tool => tool.name === 'list_banner_projects'),
        video: unique.some(tool => tool.name === 'list_video_models'),
        audio: unique.some(tool => tool.name === 'generate_voiceover' || tool.name === 'start_music_generation'),
      },
    }
  },
}

export async function getCapabilities(_args: Args, ctx: ToolContext, deps: CapabilitiesDeps = defaultDeps): Promise<ToolResult> {
  try {
    const inspection = await deps.inspect(ctx)
    return ok({
      identity: {
        id: ctx.userId,
        name: ctx.userName ?? null,
        email: ctx.userEmail ?? null,
        role: ctx.userRole,
      },
      scopes: [...(ctx.mcpScopes ?? [])],
      tools: inspection.tools,
      creationSuites: inspection.suites,
      selectionPolicy: 'capability_driven',
      governance: {
        read: 'executes immediately',
        propose_only: 'creates a reviewable proposal without executing it',
        confirmation: 'requires the authenticated user to confirm a proposal',
        direct_generation: 'may create a billed asset and is rate-limited',
      },
      rateLimits: {
        generation: { maxCalls: MCP_GEN_RATE_MAX, windowMinutes: MCP_GEN_RATE_WINDOW_MIN },
      },
    })
  } catch {
    return fail('Could not inspect MCP capabilities.')
  }
}

export const capabilitiesTool: AiTool<Args> = {
  name: 'get_capabilities',
  description: 'Return the authenticated MCP identity, granted OAuth scopes, exact available tools classified as read/propose-only/confirmation/direct-generation, enabled text/image/Banner Studio/video/audio suites, governance boundaries, and generation rate limits. Call before planning a multi-model or asset-creation workflow.',
  parameters: params,
  handler: (args, ctx) => getCapabilities(args, ctx),
}
