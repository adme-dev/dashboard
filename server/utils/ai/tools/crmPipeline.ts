import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { defaultResolveClient, type ResolveClient } from './clientResolve'

const params = z.object({ clientName: z.string().min(1) })
type Args = z.infer<typeof params>

export type PipelineByStage = Record<string, { count: number, total: number, weighted: number }>
export type CrmPipelineDeps = {
  resolveClient: ResolveClient
  pipeline: (clientId: string, ctx: ToolContext) => Promise<{ byStage: PipelineByStage, openTotal: number, weightedTotal: number }>
  stages: (clientId: string, ctx: ToolContext) => Promise<{ items: { id: string, name: string }[] }>
}

const defaultDeps: CrmPipelineDeps = {
  resolveClient: defaultResolveClient,
  pipeline: (clientId, ctx) => aiInternalFetch('/api/crm/pipeline', { query: { client_id: clientId } }, ctx),
  stages: (clientId, ctx) => aiInternalFetch('/api/crm/stages', { query: { client_id: clientId } }, ctx),
}

export async function getCrmPipeline(args: Args, ctx: ToolContext, deps: CrmPipelineDeps = defaultDeps): Promise<ToolResult> {
  const client = await deps.resolveClient(args.clientName)
  if (!client) return fail(`No matching client for "${args.clientName}".`)
  try {
    const [pipe, st] = await Promise.all([deps.pipeline(client.id, ctx), deps.stages(client.id, ctx)])
    const nameById = new Map((st.items ?? []).map(s => [s.id, s.name]))
    const stages = Object.entries(pipe.byStage ?? {})
      .map(([id, v]) => ({ stage: nameById.get(id) ?? 'Unknown', count: v.count, total: v.total, weighted: v.weighted }))
      .sort((a, b) => b.total - a.total)
    return ok({
      client: client.name, openTotal: pipe.openTotal, weightedTotal: pipe.weightedTotal, stages,
      basis: 'openTotal = sum of open opportunity values; weightedTotal = sum of value × stage probability',
    })
  } catch {
    return fail('Could not load the CRM pipeline — the client may have no opportunities yet.')
  }
}

export const crmPipelineTool: AiTool<Args> = {
  name: 'get_crm_pipeline',
  description: 'Get a client’s sales-pipeline snapshot: number of open opportunities and their total and probability-weighted value, broken down by pipeline stage. Use for "what’s in <client>’s pipeline / how much is in the funnel / pipeline by stage". Returns compact numbers only. To find a specific deal or contact use search_crm.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  handler: (a, c) => getCrmPipeline(a, c),
}
