import { z } from 'zod'
import { listAiModelMap, type AiModelMapRow } from '~~/server/utils/ai/modelRegistry'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { paginateWithCursor } from './responseContract'

const params = z.object({
  modality: z.enum(['text', 'vision', 'image', 'video', 'audio', 'multimodal', 'all']).default('all'),
  feature: z.string().optional(),
  productionOnly: z.boolean().default(true),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
})
type Args = z.infer<typeof params>

export type ModelCapabilitiesDeps = { list: () => AiModelMapRow[] }
const defaultDeps: ModelCapabilitiesDeps = { list: listAiModelMap }

export async function getModelCapabilities(args: Args, _ctx: ToolContext, deps: ModelCapabilitiesDeps = defaultDeps): Promise<ToolResult> {
  try {
    const featureNeedle = args.feature?.trim().toLowerCase()
    const rows = deps.list().filter(row => {
      if (args.modality !== 'all' && row.modality !== args.modality) return false
      if (args.productionOnly && row.status !== 'production') return false
      if (featureNeedle && !`${row.featureKey} ${row.label}`.toLowerCase().includes(featureNeedle)) return false
      return true
    }).map(row => ({
      featureKey: row.featureKey,
      feature: row.label,
      modality: row.modality,
      provider: row.provider,
      modelId: row.modelId,
      fallbackModelId: row.fallback,
      status: row.status,
      riskTier: row.riskTier,
      pricing: row.pricing ?? null,
      warnings: row.warnings,
    }))
    const page = paginateWithCursor(rows, args.cursor, args.limit)
    return ok({
      selectionPolicy: 'capability_driven',
      guidance: 'Choose by required modality, feature runtime support, status, risk and cost; do not hard-code a single provider. Use get_capabilities to confirm which creation tools are enabled in this MCP session.',
      providers: [...new Set(rows.map(row => row.provider))].sort(),
      models: page.items,
      total: page.total,
      appliedLimit: args.limit ?? 25,
      nextCursor: page.nextCursor,
      more: page.more,
    })
  } catch {
    return fail('Could not load the XeroFlow model capability catalogue.')
  }
}

export const modelCapabilitiesTool: AiTool<Args> = {
  name: 'get_model_capabilities',
  description: 'List XeroFlow model/runtime choices by text, vision, image, video, or audio capability across providers, including fallbacks, production status, risk, cost metadata and warnings. Use with get_capabilities before creating assistant brief samples so the workflow selects an eligible model rather than assuming one provider.',
  parameters: params,
  handler: (args, ctx) => getModelCapabilities(args, ctx),
}
