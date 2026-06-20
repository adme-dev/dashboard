import type { ToolContext } from '../toolContext'
import type { ActionExecutor, ExecutorResult } from './types'

/**
 * Executors for the Sales/CRM write tools. Each runs the real mutation on a confirmed proposal via the
 * existing /api/crm/* endpoints, forwarding the caller's headers (the endpoint's own
 * requireWriteAccess / requirePricingAccess re-runs as the real user). POST injected for unit-testing.
 */

export type Poster = (url: string, body: any, ctx: ToolContext) => Promise<any>
const defaultPost: Poster = (url, body, ctx) => $fetch(url, { method: 'POST', body, headers: ctx.event.headers as any })

export function makeOpportunityExecutor(post: Poster = defaultPost): ActionExecutor {
  return {
    toolName: 'propose_opportunity',
    label: 'opportunity',
    riskTier: 'confirm',
    async execute(p: any, ctx: ToolContext): Promise<ExecutorResult> {
      const r = await post('/api/crm/opportunities', {
        client_id: p.client_id, name: p.name, stage_id: p.stage_id,
        amount: p.amount ?? 0, person_id: p.person_id ?? undefined,
      }, ctx)
      const id = r?.item?.id ?? r?.id
      if (!id) throw new Error('opportunity create returned no id')
      return { resultRef: String(id), summary: `✅ Created opportunity “${p.name}” for ${p.clientName} (${p.stageName}).` }
    },
  }
}

export function makeLogActivityExecutor(post: Poster = defaultPost): ActionExecutor {
  return {
    toolName: 'log_crm_activity',
    label: 'CRM activity',
    riskTier: 'confirm',
    async execute(p: any, ctx: ToolContext): Promise<ExecutorResult> {
      const r = await post('/api/crm/activities', {
        client_id: p.client_id, target_type: p.target_type, target_id: p.target_id,
        type: p.type, title: p.title, body: p.body ?? undefined,
      }, ctx)
      const id = r?.item?.id ?? r?.id
      if (!id) throw new Error('activity create returned no id')
      return { resultRef: String(id), summary: `✅ Logged ${p.type} “${p.title}” on ${p.targetName}.` }
    },
  }
}

export function makeQuoteExecutor(post: Poster = defaultPost): ActionExecutor {
  return {
    toolName: 'propose_quote',
    label: 'quote',
    riskTier: 'confirm',
    requiredPermission: 'MANAGEMENT',
    async execute(p: any, ctx: ToolContext): Promise<ExecutorResult> {
      const r = await post(`/api/crm/opportunities/${p.opportunity_id}/create-quote`, { client_id: p.client_id }, ctx)
      const id = r?.quote_id ?? r?.quote?.id
      if (!id) throw new Error('quote create returned no id')
      return { resultRef: String(id), summary: `✅ Created a quote from opportunity “${p.opportunityName}”.` }
    },
  }
}

export const opportunityExecutor: ActionExecutor = makeOpportunityExecutor()
export const logActivityExecutor: ActionExecutor = makeLogActivityExecutor()
export const quoteExecutor: ActionExecutor = makeQuoteExecutor()
