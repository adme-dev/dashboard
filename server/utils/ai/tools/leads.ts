import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import { ok, fail, capWithMore, type ToolContext, type ToolResult } from '../toolContext'
import { aiInternalFetch } from '../internalFetch'
import { defaultResolveClient, type ResolveClient } from './clientResolve'
import { periodSinceISO, type Period } from './period'

const params = z.object({
  clientName: z.string().min(1),
  summary: z.boolean().default(false),
  status: z.enum(['new', 'contacted', 'qualified', 'won', 'lost', 'spam_suspected']).optional(),
  source: z.enum(['meta', 'google', 'manual', 'webhook', 'csv']).optional(),
  period: z.enum(['7d', '30d', '90d']).default('30d'),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

export type LeadRow = { id: string, submitted_at: string, source: string, status: string, campaign_name: string | null, field_data: Record<string, unknown> | null }
export type LeadCount = { status: string, source: string, count: number }
export type LeadsDeps = {
  resolveClient: ResolveClient
  list: (q: { clientId: string, status?: string, source?: string, fromISO: string, limit: number }, ctx: ToolContext) => Promise<{ items: LeadRow[], total: number }>
  summary: (clientId: string, fromISO: string) => Promise<LeadCount[]>
}

const defaultDeps: LeadsDeps = {
  resolveClient: defaultResolveClient,
  list: ({ clientId, status, source, fromISO, limit }, ctx) =>
    aiInternalFetch('/api/leads/list', { query: { client_id: clientId, status, source, from: fromISO, page_size: limit } }, ctx),
  summary: (clientId, fromISO) =>
    queryRows<LeadCount>(
      `SELECT status, source, COUNT(*)::int AS count FROM leads
       WHERE client_id = $1 AND deleted_at IS NULL AND is_test = false AND submitted_at >= $2
       GROUP BY status, source`,
      [clientId, fromISO],
    ),
}

/** Pull a display name from a lead's advertiser-defined field_data. Pure. */
export function leadName(fd: Record<string, unknown> | null): string {
  if (!fd) return 'Unknown'
  for (const k of ['full_name', 'name', 'first_name', 'fullName']) {
    const v = fd[k]
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 80)
  }
  return 'Unknown'
}
/** Mask the lead's contact (email→j***@d, else phone→***NNN) for PII hygiene over the wire. Pure. */
export function maskContact(fd: Record<string, unknown> | null): string | null {
  if (!fd) return null
  const email = ['email', 'email_address'].map(k => fd[k]).find(v => typeof v === 'string' && (v as string).includes('@')) as string | undefined
  if (email) { const [u, d] = email.split('@'); return `${u.slice(0, 1)}***@${d}` }
  const phone = ['phone_number', 'phone', 'mobile'].map(k => fd[k]).find(v => typeof v === 'string' && (v as string).length >= 4) as string | undefined
  if (phone) return `***${phone.slice(-3)}`
  return null
}

function sumBy(rows: LeadCount[], field: 'status' | 'source'): Record<string, number> {
  const m: Record<string, number> = {}
  for (const r of rows) m[r[field]] = (m[r[field]] ?? 0) + r.count
  return m
}

export async function getLeads(args: Args, ctx: ToolContext, deps: LeadsDeps = defaultDeps, now: Date = new Date()): Promise<ToolResult> {
  const client = await deps.resolveClient(args.clientName)
  if (!client) return fail(`No matching client for "${args.clientName}".`)
  const fromISO = periodSinceISO(args.period as Period, now)
  try {
    if (args.summary) {
      const rows = await deps.summary(client.id, fromISO)
      const total = rows.reduce((n, r) => n + r.count, 0)
      return ok({
        client: client.name, period: args.period, total,
        byStatus: Object.entries(sumBy(rows, 'status')).map(([status, count]) => ({ status, count })),
        bySource: Object.entries(sumBy(rows, 'source')).map(([source, count]) => ({ source, count })),
      })
    }
    const { items, total } = await deps.list({ clientId: client.id, status: args.status, source: args.source, fromISO, limit: args.limit }, ctx)
    const { items: capped, more } = capWithMore(items ?? [], args.limit)
    return ok({
      client: client.name, period: args.period, total,
      leads: capped.map(l => ({ id: l.id, submittedAt: l.submitted_at, source: l.source, status: l.status, name: leadName(l.field_data), contact: maskContact(l.field_data), campaignName: l.campaign_name ?? null })),
      more,
    })
  } catch {
    return fail('Could not load leads for this client.')
  }
}

export const leadsTool: AiTool<Args> = {
  name: 'get_leads',
  description: 'Read a client’s inbound leads from the lead inbox — either a recent list (default) or a counts summary by status and source (summary:true). Use for "show <client>’s new leads / how many leads this week / lead breakdown by source". Test leads are excluded. Returns compact rows: names and a MASKED contact only (never full PII). Period is 7d/30d/90d.',
  parameters: params,
  returnsUntrusted: true,
  handler: (a, c) => getLeads(a, c),
}
