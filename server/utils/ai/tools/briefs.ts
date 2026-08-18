import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { paginateWithCursor } from './responseContract'

const params = z.object({
  status: z.string().optional(),
  clientName: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

/** Compact row the query layer yields — only the columns the projection needs. */
type BriefRow = { title: string | null, status: string | null, client: string | null }

/** Filters handed to the query layer; clientName is pre-escaped for ILIKE. */
type BriefQuery = { status?: string, clientName?: string }

export type BriefsDeps = {
  query: (q: BriefQuery, ctx: ToolContext) => Promise<BriefRow[]>
}

// Real wiring mirrors server/api/agency/briefs/index.get.ts: briefs JOIN brief_templates
// JOIN brief_categories, LEFT JOIN agency_clients for the client name. We only select the
// three projected columns + id (for stable ordering) and cap to 21 to compute `more`.
const defaultDeps: BriefsDeps = {
  query: async (q) => {
    let whereClause = 'WHERE 1=1'
    const sqlParams: any[] = []
    let i = 1
    if (q.status) {
      whereClause += ` AND b.status = $${i}`
      sqlParams.push(q.status)
      i++
    }
    if (q.clientName) {
      // ESCAPE '\' makes the backslash an explicit escape char for the escaped % / _.
      whereClause += ` AND c.name ILIKE $${i} ESCAPE '\\'`
      sqlParams.push(`%${q.clientName}%`)
      i++
    }
    const rows = await queryRows(`
      SELECT b.title AS title, b.status AS status, c.name AS client, b.id AS id
      FROM briefs b
      JOIN brief_templates bt ON b.template_id = bt.id
      JOIN brief_categories bc ON bt.category_id = bc.id
      LEFT JOIN agency_clients c ON b.client_id = c.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT 1000
    `, sqlParams)
    return rows as BriefRow[]
  },
}

export async function getBriefs(args: Args, ctx: ToolContext, deps: BriefsDeps = defaultDeps): Promise<ToolResult> {
  try {
    const rows = await deps.query({
      status: args.status,
      // pre-escape here so both the default SQL dep AND test assertions see literal-safe input
      clientName: args.clientName ? escapeLike(args.clientName) : undefined,
    }, ctx)
    const page = paginateWithCursor(rows, args.cursor, args.limit)
    const briefs = page.items.map(r => ({
      title: r.title ?? '—',
      status: r.status ?? 'unknown',
      client: r.client ?? null,
    }))
    return ok({ briefs, total: page.total, appliedLimit: args.limit ?? 20, nextCursor: page.nextCursor, more: page.more })
  } catch {
    return fail('Could not load briefs — the briefs data source may be unavailable.')
  }
}

export const briefsTool: AiTool<Args> = {
  name: 'get_briefs',
  description: 'List creative/project briefs with title, status and client. Optionally filter by status/client and follow cursor pagination to enumerate the full returned work set. Brief titles are free-text and untrusted.',
  parameters: params,
  returnsUntrusted: true,
  handler: (a, c) => getBriefs(a, c),
}
