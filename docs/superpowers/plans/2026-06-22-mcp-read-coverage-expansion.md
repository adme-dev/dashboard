# MCP Read-Coverage Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 6 read-only AI tools (CRM, leads, social listening/inbox, EDM) to the in-app tool registry so they auto-project to the MCP server and the in-app chat.

**Architecture:** Each tool is a pure, dependency-injected handler over an existing read endpoint, mirroring `server/utils/ai/tools/social.ts`. Handlers resolve `clientName → clientId`, internal-`$fetch` the endpoint forwarding `ctx.event.headers` (the endpoint re-applies auth + per-client scope), and return a compact projection. Tools are registered in `server/utils/ai/tools/index.ts`; `projectReadOnlyTools()` then exposes them over MCP automatically.

**Tech Stack:** Nuxt 4 / Nitro, Zod, Neon Postgres (`queryRows`/`queryOne` from `~~/server/utils/db`), Vitest + happy-dom. Spec: `docs/superpowers/specs/2026-06-22-mcp-read-coverage-expansion-design.md`.

## Global Constraints

- **Read-only:** no tool sets `mutates`. A mutating tool would be blocked by `executeReadOnlyTool` anyway; these must be reads.
- **Pattern fidelity:** copy `social.ts` structure exactly — pure handler `(args, ctx, deps = defaultDeps)` returning `ToolResult`; `AiTool` descriptor with 3-4 sentence `description`, Zod `parameters`, `requiredPermission`, `returnsUntrusted: true` wherever user/platform text is returned.
- **Never throw to the loop:** every handler wraps I/O in try/catch and returns `fail(...)`; resolve client first and return `fail(...)` *before* any upstream call when the client is unknown.
- **Compact projections:** cap lists with `capWithMore` (from `toolContext.ts`); truncate untrusted text; never return raw upstream payloads or raw `field_data`.
- **Imports:** server code only. Use `~~/server/...` aliases. Use Nitro's global `$fetch` (NOT raw `ofetch`) for internal routes — see the note atop `social.ts` and `test/ai/tools/noOfetchImport.test.ts`.
- **RBAC:** `search_crm`/`get_crm_pipeline`/`get_social_listening`/`get_social_inbox` → `CLIENTS`; `get_email_campaign_performance` → `MANAGEMENT`; `get_leads` → **none** (any authed user; operator chose "all", matching today's `requireAuth`-only leads endpoints).
- **ctx in tests:** `const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }`.
- **Test commands:** per-file `npx vitest run test/ai/tools/<file>.test.ts`; full AI suite `npx vitest run test/ai/`. If a fresh worktree, run `npx nuxt prepare` once before vitest.
- **Endpoint return shapes (verified 2026-06-22):** CRM search → `{ results: CrmSearchHit[] }`; CRM pipeline → `{ byStage: Record<stageId,{count,total,weighted}>, openTotal, weightedTotal }`; CRM stages → `{ items: {id,name}[] }`; leads list → `{ items, total, page, page_size }`; listening overview → `{ total, sentiment{positive,neutral,negative,unknown}, shareOfVoice[], topTopics[], topSources[] }`; listening mentions → **bare array** of rows; inbox analytics overview → `{ total, open, responded, avgFirstResponseMinutes, slaTracked, breaches, withinSlaPct, automationRatePct }`; inbox conversations → **bare array** of rows (**no `breached` query param** — filter `sla_breached`/`sla_due_at` in the handler); email campaigns list → `{ campaigns: [...] }` (denormalized counters; filter by `client_id` in the handler); email events → `{ summary, events }`.

---

### Task 1: Shared helpers + `search_crm`

**Files:**
- Create: `server/utils/ai/tools/clientResolve.ts`
- Create: `server/utils/ai/tools/period.ts`
- Create: `server/utils/ai/tools/searchCrm.ts`
- Test: `test/ai/tools/searchCrm.test.ts`

**Interfaces:**
- Produces:
  - `type ResolvedClient = { id: string, name: string }`
  - `type ResolveClient = (name: string) => Promise<ResolvedClient | null>`; `const defaultResolveClient: ResolveClient`
  - `const PERIOD_DAYS: Record<'7d'|'30d'|'90d', number>`; `periodDays(p): number`; `periodSinceISO(p, now?: Date): string`
  - `searchCrm(args, ctx, deps?): Promise<ToolResult>`; `type CrmSearchDeps`; `type CrmSearchHit`; `const searchCrmTool: AiTool<...>`

- [ ] **Step 1: Write the failing test**

```ts
// test/ai/tools/searchCrm.test.ts
import { describe, it, expect, vi } from 'vitest'
import { searchCrm, searchCrmTool, type CrmSearchDeps, type CrmSearchHit } from '~~/server/utils/ai/tools/searchCrm'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const found = { resolveClient: vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' }) }
const hits = (n: number): CrmSearchHit[] =>
  Array.from({ length: n }, (_, i) => ({ type: 'person', id: `p${i}`, title: `Person ${i}`, subtitle: `note ${i}`, rank: 1 }))

describe('search_crm', () => {
  it('resolves the client and returns a compact, capped result list', async () => {
    const deps: CrmSearchDeps = { ...found, search: vi.fn().mockResolvedValue({ results: hits(8) }) }
    const res = await searchCrm({ clientName: 'Acme', query: 'jo', limit: 5 }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.client).toBe('Acme')
    expect(data.results).toHaveLength(5)
    expect(data.more).toBe(3)
    expect(Object.keys(data.results[0]).sort()).toEqual(['id', 'subtitle', 'title', 'type'])
    expect((deps.search as any).mock.calls[0][0]).toBe('c1')
  })

  it('fails without calling search when the client is unknown', async () => {
    const search = vi.fn()
    const deps: CrmSearchDeps = { resolveClient: vi.fn().mockResolvedValue(null), search }
    const res = await searchCrm({ clientName: 'Nope', query: 'x', limit: 20 }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(search).not.toHaveBeenCalled()
  })

  it('returns a recoverable error (never throws) when search rejects', async () => {
    const deps: CrmSearchDeps = { ...found, search: vi.fn().mockRejectedValue(new Error('db down')) }
    const res = await searchCrm({ clientName: 'Acme', query: 'x', limit: 20 }, ctx, deps)
    expect(res.ok).toBe(false)
  })

  it('is read-only, untrusted, and requires CLIENTS', () => {
    expect(searchCrmTool.mutates).toBeUndefined()
    expect(searchCrmTool.returnsUntrusted).toBe(true)
    expect(searchCrmTool.requiredPermission).toBe('CLIENTS')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ai/tools/searchCrm.test.ts`
Expected: FAIL — cannot find module `searchCrm`.

- [ ] **Step 3: Write the shared helpers**

```ts
// server/utils/ai/tools/clientResolve.ts
import { queryOne } from '~~/server/utils/db'
import { escapeLike } from '../toolContext'

export type ResolvedClient = { id: string, name: string }
export type ResolveClient = (name: string) => Promise<ResolvedClient | null>

/** Best single ILIKE match on agency_clients. Reads take the top match (no disambiguation). */
export const defaultResolveClient: ResolveClient = async (name) => {
  const row = await queryOne<ResolvedClient>(
    'SELECT id, name FROM agency_clients WHERE name ILIKE $1 ORDER BY name ASC LIMIT 1',
    [`%${escapeLike(name)}%`],
  )
  return row ?? null
}
```

```ts
// server/utils/ai/tools/period.ts
export const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const
export type Period = keyof typeof PERIOD_DAYS
export const periodDays = (p: Period): number => PERIOD_DAYS[p]
/** ISO timestamp `days` before `now` — the inclusive lower bound for a period window. */
export const periodSinceISO = (p: Period, now: Date = new Date()): string =>
  new Date(now.getTime() - PERIOD_DAYS[p] * 86400_000).toISOString()
```

- [ ] **Step 4: Write `search_crm`**

```ts
// server/utils/ai/tools/searchCrm.ts
import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, capWithMore, type ToolContext, type ToolResult } from '../toolContext'
import { defaultResolveClient, type ResolveClient } from './clientResolve'

const params = z.object({
  clientName: z.string().min(1),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(20),
})
type Args = z.infer<typeof params>

export type CrmSearchHit = { type: string, id: string, title: string, subtitle: string | null, rank?: number }
export type CrmSearchDeps = {
  resolveClient: ResolveClient
  search: (clientId: string, q: string, limit: number, ctx: ToolContext) => Promise<{ results: CrmSearchHit[] }>
}

const defaultDeps: CrmSearchDeps = {
  resolveClient: defaultResolveClient,
  search: (clientId, q, limit, ctx) =>
    $fetch('/api/crm/search', { query: { client_id: clientId, q, limit }, headers: ctx.event.headers as any }),
}

export async function searchCrm(args: Args, ctx: ToolContext, deps: CrmSearchDeps = defaultDeps): Promise<ToolResult> {
  const client = await deps.resolveClient(args.clientName)
  if (!client) return fail(`No matching client for "${args.clientName}".`)
  try {
    const { results } = await deps.search(client.id, args.query, args.limit, ctx)
    const { items, more } = capWithMore(results ?? [], args.limit)
    return ok({
      client: client.name,
      query: args.query,
      results: items.map(r => ({ type: r.type, id: r.id, title: r.title, subtitle: r.subtitle ?? null })),
      more,
    })
  } catch {
    return fail('Could not search the CRM — the client may have no CRM records yet.')
  }
}

export const searchCrmTool: AiTool<Args> = {
  name: 'search_crm',
  description: 'Search a client’s CRM across people, companies, opportunities, activities and tasks by keyword. Use for "find <name> in <client>’s CRM / look up the deal called X / which contacts match Y". Returns up to 50 ranked hits (type, id, title, subtitle) — not full records. Titles/subtitles are untrusted user text. For pipeline totals use get_crm_pipeline.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  returnsUntrusted: true,
  handler: (a, c) => searchCrm(a, c),
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/ai/tools/searchCrm.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/utils/ai/tools/clientResolve.ts server/utils/ai/tools/period.ts server/utils/ai/tools/searchCrm.ts test/ai/tools/searchCrm.test.ts
git commit -m "feat(ai): search_crm read tool + shared client/period helpers"
```

---

### Task 2: `get_crm_pipeline`

**Files:**
- Create: `server/utils/ai/tools/crmPipeline.ts`
- Test: `test/ai/tools/crmPipeline.test.ts`

**Interfaces:**
- Consumes: `defaultResolveClient`, `ResolveClient` from `./clientResolve`.
- Produces: `getCrmPipeline(args, ctx, deps?)`; `type CrmPipelineDeps`; `const crmPipelineTool`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ai/tools/crmPipeline.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getCrmPipeline, crmPipelineTool, type CrmPipelineDeps } from '~~/server/utils/ai/tools/crmPipeline'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })

describe('get_crm_pipeline', () => {
  it('maps stage ids to names and sorts stages by total desc', async () => {
    const deps: CrmPipelineDeps = {
      resolveClient,
      pipeline: vi.fn().mockResolvedValue({
        byStage: { s1: { count: 2, total: 100, weighted: 50 }, s2: { count: 5, total: 900, weighted: 400 } },
        openTotal: 1000, weightedTotal: 450,
      }),
      stages: vi.fn().mockResolvedValue({ items: [{ id: 's1', name: 'Lead' }, { id: 's2', name: 'Proposal' }] }),
    }
    const res = await getCrmPipeline({ clientName: 'Acme' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.openTotal).toBe(1000)
    expect(data.stages.map((s: any) => s.stage)).toEqual(['Proposal', 'Lead'])
    expect(data.stages[0]).toEqual({ stage: 'Proposal', count: 5, total: 900, weighted: 400 })
  })

  it('labels unknown stage ids as "Unknown"', async () => {
    const deps: CrmPipelineDeps = {
      resolveClient,
      pipeline: vi.fn().mockResolvedValue({ byStage: { sx: { count: 1, total: 10, weighted: 5 } }, openTotal: 10, weightedTotal: 5 }),
      stages: vi.fn().mockResolvedValue({ items: [] }),
    }
    const res = await getCrmPipeline({ clientName: 'Acme' }, ctx, deps)
    expect((res as any).data.stages[0].stage).toBe('Unknown')
  })

  it('fails without calling pipeline when the client is unknown', async () => {
    const pipeline = vi.fn()
    const deps: CrmPipelineDeps = { resolveClient: vi.fn().mockResolvedValue(null), pipeline, stages: vi.fn() }
    const res = await getCrmPipeline({ clientName: 'Nope' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(pipeline).not.toHaveBeenCalled()
  })

  it('is read-only and requires CLIENTS', () => {
    expect(crmPipelineTool.mutates).toBeUndefined()
    expect(crmPipelineTool.requiredPermission).toBe('CLIENTS')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ai/tools/crmPipeline.test.ts`
Expected: FAIL — cannot find module `crmPipeline`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/ai/tools/crmPipeline.ts
import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
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
  pipeline: (clientId, ctx) => $fetch('/api/crm/pipeline', { query: { client_id: clientId }, headers: ctx.event.headers as any }),
  stages: (clientId, ctx) => $fetch('/api/crm/stages', { query: { client_id: clientId }, headers: ctx.event.headers as any }),
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
    return ok({ client: client.name, openTotal: pipe.openTotal, weightedTotal: pipe.weightedTotal, stages })
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ai/tools/crmPipeline.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/crmPipeline.ts test/ai/tools/crmPipeline.test.ts
git commit -m "feat(ai): get_crm_pipeline read tool"
```

---

### Task 3: `get_leads`

**Files:**
- Create: `server/utils/ai/tools/leads.ts`
- Test: `test/ai/tools/leads.test.ts`

**Interfaces:**
- Consumes: `defaultResolveClient`, `ResolveClient`; `PERIOD_DAYS`, `periodSinceISO`, `type Period`.
- Produces: `getLeads(args, ctx, deps?, now?)`; pure helpers `leadName(fd)`, `maskContact(fd)`; `type LeadsDeps`, `type LeadRow`, `type LeadCount`; `const leadsTool`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ai/tools/leads.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getLeads, leadName, maskContact, leadsTool, type LeadsDeps, type LeadRow } from '~~/server/utils/ai/tools/leads'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const now = new Date('2026-06-22T00:00:00.000Z')
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })
const row = (i: number): LeadRow => ({
  id: `l${i}`, submitted_at: '2026-06-20T00:00:00.000Z', source: 'meta', status: 'new',
  campaign_name: 'Winter', field_data: { full_name: `Lead ${i}`, email: `lead${i}@acme.com`, phone_number: '0400123456' },
})

describe('leadName / maskContact (pure)', () => {
  it('extracts a name from varied field_data keys', () => {
    expect(leadName({ full_name: 'Jane Doe' })).toBe('Jane Doe')
    expect(leadName({ name: 'Bob' })).toBe('Bob')
    expect(leadName(null)).toBe('Unknown')
  })
  it('masks email then phone, never returning raw PII', () => {
    expect(maskContact({ email: 'jane@acme.com' })).toBe('j***@acme.com')
    expect(maskContact({ phone_number: '0400123456' })).toBe('***456')
    expect(maskContact({})).toBeNull()
  })
})

describe('get_leads — list mode', () => {
  it('returns a compact, capped, masked lead list', async () => {
    const deps: LeadsDeps = { resolveClient, list: vi.fn().mockResolvedValue({ items: [row(0), row(1), row(2)], total: 3 }), summary: vi.fn() }
    const res = await getLeads({ clientName: 'Acme', summary: false, period: '30d', limit: 2 }, ctx, deps, now)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.leads).toHaveLength(2)
    expect(data.more).toBe(1)
    expect(data.leads[0]).toEqual({ id: 'l0', submittedAt: '2026-06-20T00:00:00.000Z', source: 'meta', status: 'new', name: 'Lead 0', contact: 'l***@acme.com', campaignName: 'Winter' })
    expect((deps.summary as any)).not.toHaveBeenCalled()
  })
})

describe('get_leads — summary mode', () => {
  it('rolls counts up by status and source', async () => {
    const counts = [
      { status: 'new', source: 'meta', count: 3 },
      { status: 'new', source: 'google', count: 2 },
      { status: 'contacted', source: 'meta', count: 1 },
    ]
    const deps: LeadsDeps = { resolveClient, list: vi.fn(), summary: vi.fn().mockResolvedValue(counts) }
    const res = await getLeads({ clientName: 'Acme', summary: true, period: '7d', limit: 20 }, ctx, deps, now)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.total).toBe(6)
    expect(data.byStatus).toContainEqual({ status: 'new', count: 5 })
    expect(data.bySource).toContainEqual({ source: 'meta', count: 4 })
    expect((deps.list as any)).not.toHaveBeenCalled()
  })
})

describe('get_leads — guards', () => {
  it('fails without any upstream call when the client is unknown', async () => {
    const list = vi.fn(); const summary = vi.fn()
    const deps: LeadsDeps = { resolveClient: vi.fn().mockResolvedValue(null), list, summary }
    const res = await getLeads({ clientName: 'Nope', summary: false, period: '30d', limit: 20 }, ctx, deps, now)
    expect(res.ok).toBe(false)
    expect(list).not.toHaveBeenCalled()
    expect(summary).not.toHaveBeenCalled()
  })
  it('is read-only, untrusted, and has no required permission (any authed user)', () => {
    expect(leadsTool.mutates).toBeUndefined()
    expect(leadsTool.returnsUntrusted).toBe(true)
    expect(leadsTool.requiredPermission).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ai/tools/leads.test.ts`
Expected: FAIL — cannot find module `leads`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/ai/tools/leads.ts
import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import { ok, fail, capWithMore, type ToolContext, type ToolResult } from '../toolContext'
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
    $fetch('/api/leads/list', { query: { client_id: clientId, status, source, from: fromISO, page_size: limit }, headers: ctx.event.headers as any }),
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ai/tools/leads.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/leads.ts test/ai/tools/leads.test.ts
git commit -m "feat(ai): get_leads read tool (list + summary, masked PII)"
```

---

### Task 4: `get_social_listening`

**Files:**
- Create: `server/utils/ai/tools/socialListening.ts`
- Test: `test/ai/tools/socialListening.test.ts`

**Interfaces:**
- Consumes: `defaultResolveClient`, `ResolveClient`; `periodDays`, `type Period`.
- Produces: `getSocialListening(args, ctx, deps?)`; `type SocialListeningDeps`, `type ListeningOverview`, `type ListeningMention`; `const socialListeningTool`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ai/tools/socialListening.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getSocialListening, socialListeningTool, type SocialListeningDeps, type ListeningOverview } from '~~/server/utils/ai/tools/socialListening'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })
const overview = (): ListeningOverview => ({
  total: 120, sentiment: { positive: 60, neutral: 40, negative: 18, unknown: 2 },
  shareOfVoice: [{ category: 'brand', count: 80 }], topTopics: [{ topic: 'pricing', count: 12 }],
  topSources: [{ source: 'reddit', count: 50 }],
})

describe('get_social_listening', () => {
  it('returns the overview plus up to 5 notable negative mentions (excerpted)', async () => {
    const mentions = Array.from({ length: 7 }, (_, i) => ({ source: 'reddit', sentiment: 'negative', content: `bad thing ${i} ${'x'.repeat(400)}`, title: `t${i}`, url: `https://r/${i}` }))
    const deps: SocialListeningDeps = { resolveClient, overview: vi.fn().mockResolvedValue(overview()), recentNegative: vi.fn().mockResolvedValue(mentions) }
    const res = await getSocialListening({ clientName: 'Acme', period: '30d' }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.total).toBe(120)
    expect(data.sentiment.negative).toBe(18)
    expect(data.notableMentions).toHaveLength(5)
    expect(data.notableMentions[0].excerpt.length).toBeLessThanOrEqual(200)
    expect((deps.overview as any).mock.calls[0]).toEqual(['c1', 30, ctx])
  })

  it('still returns the overview if notable-mentions fetch fails', async () => {
    const deps: SocialListeningDeps = { resolveClient, overview: vi.fn().mockResolvedValue(overview()), recentNegative: vi.fn().mockRejectedValue(new Error('x')) }
    const res = await getSocialListening({ clientName: 'Acme', period: '30d' }, ctx, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.notableMentions).toEqual([])
  })

  it('fails (no fetch) on unknown client; is read-only/untrusted/CLIENTS', async () => {
    const overviewFn = vi.fn()
    const deps: SocialListeningDeps = { resolveClient: vi.fn().mockResolvedValue(null), overview: overviewFn, recentNegative: vi.fn() }
    const res = await getSocialListening({ clientName: 'Nope', period: '30d' }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(overviewFn).not.toHaveBeenCalled()
    expect(socialListeningTool.mutates).toBeUndefined()
    expect(socialListeningTool.returnsUntrusted).toBe(true)
    expect(socialListeningTool.requiredPermission).toBe('CLIENTS')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ai/tools/socialListening.test.ts`
Expected: FAIL — cannot find module `socialListening`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/ai/tools/socialListening.ts
import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { defaultResolveClient, type ResolveClient } from './clientResolve'
import { periodDays, type Period } from './period'

const params = z.object({ clientName: z.string().min(1), period: z.enum(['7d', '30d', '90d']).default('30d') })
type Args = z.infer<typeof params>

export type ListeningOverview = {
  total: number
  sentiment: { positive: number, neutral: number, negative: number, unknown: number }
  shareOfVoice: { category: string, count: number }[]
  topTopics: { topic: string, count: number }[]
  topSources: { source: string, count: number }[]
}
export type ListeningMention = { source: string, sentiment: string, content: string | null, title: string | null, url: string | null }
export type SocialListeningDeps = {
  resolveClient: ResolveClient
  overview: (clientId: string, days: number, ctx: ToolContext) => Promise<ListeningOverview>
  recentNegative: (clientId: string, limit: number, ctx: ToolContext) => Promise<ListeningMention[]>
}

const defaultDeps: SocialListeningDeps = {
  resolveClient: defaultResolveClient,
  overview: (clientId, days, ctx) => $fetch('/api/agency/social/listening/overview', { query: { clientId, days }, headers: ctx.event.headers as any }),
  // mentions endpoint returns a BARE ARRAY of rows.
  recentNegative: (clientId, limit, ctx) => $fetch('/api/agency/social/listening/mentions', { query: { clientId, sentiment: 'negative', limit }, headers: ctx.event.headers as any }),
}

export async function getSocialListening(args: Args, ctx: ToolContext, deps: SocialListeningDeps = defaultDeps): Promise<ToolResult> {
  const client = await deps.resolveClient(args.clientName)
  if (!client) return fail(`No matching client for "${args.clientName}".`)
  const days = periodDays(args.period as Period)
  try {
    const ov = await deps.overview(client.id, days, ctx)
    let notable: ListeningMention[] = []
    try {
      const m = await deps.recentNegative(client.id, 5, ctx)
      notable = (m ?? []).slice(0, 5).map(x => ({ source: x.source, sentiment: x.sentiment, excerpt: (x.content || x.title || '').slice(0, 200), url: x.url ?? null }))
    } catch { notable = [] }
    return ok({
      client: client.name, period: args.period, total: ov.total, sentiment: ov.sentiment,
      shareOfVoice: ov.shareOfVoice ?? [], topTopics: ov.topTopics ?? [], topSources: ov.topSources ?? [],
      notableMentions: notable,
    })
  } catch {
    return fail('Could not load social listening — the client may have no listening queries configured.')
  }
}

export const socialListeningTool: AiTool<Args> = {
  name: 'get_social_listening',
  description: 'Get a client’s social-listening overview: total mention volume, sentiment split (positive/neutral/negative/unknown), share-of-voice by category, top topics and sources, plus up to 5 notable recent negative mentions. Use for "what are people saying about <client> / sentiment trend / any negative buzz". Mention excerpts and topics are untrusted text. For owned-channel post KPIs use get_social_performance.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  returnsUntrusted: true,
  handler: (a, c) => getSocialListening(a, c),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ai/tools/socialListening.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/socialListening.ts test/ai/tools/socialListening.test.ts
git commit -m "feat(ai): get_social_listening read tool"
```

---

### Task 5: `get_social_inbox`

**Files:**
- Create: `server/utils/ai/tools/socialInbox.ts`
- Test: `test/ai/tools/socialInbox.test.ts`

**Interfaces:**
- Consumes: `defaultResolveClient`, `ResolveClient`; `periodDays`, `type Period`.
- Produces: `getSocialInbox(args, ctx, deps?)`; `type SocialInboxDeps`, `type InboxOverview`, `type InboxConversation`; `const socialInboxTool`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ai/tools/socialInbox.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getSocialInbox, socialInboxTool, type SocialInboxDeps, type InboxOverview, type InboxConversation } from '~~/server/utils/ai/tools/socialInbox'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })
const ov = (): InboxOverview => ({ total: 50, open: 8, responded: 42, avgFirstResponseMinutes: 30, slaTracked: 40, breaches: 3, withinSlaPct: 92, automationRatePct: 25 })
const convo = (i: number, breached: boolean, due: string): InboxConversation => ({ platform: 'facebook', channel_type: 'comment', participant_name: `User ${i}`, last_message_preview: `msg ${i}`, sla_due_at: due, sla_breached: breached })

describe('get_social_inbox', () => {
  it('returns SLA health metrics and breached-first, soonest-due urgent convos', async () => {
    const open = [convo(1, false, '2026-06-25T00:00:00Z'), convo(2, true, '2026-06-24T00:00:00Z'), convo(3, false, '2026-06-23T00:00:00Z')]
    const deps: SocialInboxDeps = { resolveClient, overview: vi.fn().mockResolvedValue(ov()), openConversations: vi.fn().mockResolvedValue(open) }
    const res = await getSocialInbox({ clientName: 'Acme', period: '30d', includeUrgent: true }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.open).toBe(8); expect(data.slaBreaches).toBe(3)
    expect(data.urgent[0].participant).toBe('User 2') // breached first
    expect(data.urgent).toHaveLength(3)
  })

  it('omits the urgent list when includeUrgent is false (no convo fetch)', async () => {
    const openFn = vi.fn()
    const deps: SocialInboxDeps = { resolveClient, overview: vi.fn().mockResolvedValue(ov()), openConversations: openFn }
    const res = await getSocialInbox({ clientName: 'Acme', period: '30d', includeUrgent: false }, ctx, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.urgent).toEqual([])
    expect(openFn).not.toHaveBeenCalled()
  })

  it('fails (no fetch) on unknown client; is read-only/untrusted/CLIENTS', async () => {
    const overviewFn = vi.fn()
    const deps: SocialInboxDeps = { resolveClient: vi.fn().mockResolvedValue(null), overview: overviewFn, openConversations: vi.fn() }
    const res = await getSocialInbox({ clientName: 'Nope', period: '30d', includeUrgent: true }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(overviewFn).not.toHaveBeenCalled()
    expect(socialInboxTool.mutates).toBeUndefined()
    expect(socialInboxTool.returnsUntrusted).toBe(true)
    expect(socialInboxTool.requiredPermission).toBe('CLIENTS')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ai/tools/socialInbox.test.ts`
Expected: FAIL — cannot find module `socialInbox`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/ai/tools/socialInbox.ts
import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'
import { defaultResolveClient, type ResolveClient } from './clientResolve'
import { periodDays, type Period } from './period'

const params = z.object({
  clientName: z.string().min(1),
  period: z.enum(['7d', '30d', '90d']).default('30d'),
  includeUrgent: z.boolean().default(true),
})
type Args = z.infer<typeof params>

export type InboxOverview = { total: number, open: number, responded: number, avgFirstResponseMinutes: number, slaTracked: number, breaches: number, withinSlaPct: number, automationRatePct: number }
export type InboxConversation = { platform: string, channel_type: string, participant_name: string | null, last_message_preview: string | null, sla_due_at: string | null, sla_breached: boolean | null }
export type SocialInboxDeps = {
  resolveClient: ResolveClient
  overview: (clientId: string, days: number, ctx: ToolContext) => Promise<InboxOverview>
  openConversations: (clientId: string, limit: number, ctx: ToolContext) => Promise<InboxConversation[]>
}

const defaultDeps: SocialInboxDeps = {
  resolveClient: defaultResolveClient,
  overview: (clientId, days, ctx) => $fetch('/api/agency/social/inbox/analytics/overview', { query: { clientId, days }, headers: ctx.event.headers as any }),
  // conversations endpoint returns a BARE ARRAY; it has no `breached` param — we sort/flag in the handler.
  openConversations: (clientId, limit, ctx) => $fetch('/api/agency/social/inbox/conversations', { query: { clientId, status: 'open', limit }, headers: ctx.event.headers as any }),
}

/** Breached first, then soonest SLA due. Pure. */
export function rankUrgent(rows: InboxConversation[]): InboxConversation[] {
  const due = (c: InboxConversation) => c.sla_due_at ? new Date(c.sla_due_at).getTime() : Number.MAX_SAFE_INTEGER
  return [...rows].sort((a, b) => (Number(!!b.sla_breached) - Number(!!a.sla_breached)) || (due(a) - due(b)))
}

export async function getSocialInbox(args: Args, ctx: ToolContext, deps: SocialInboxDeps = defaultDeps): Promise<ToolResult> {
  const client = await deps.resolveClient(args.clientName)
  if (!client) return fail(`No matching client for "${args.clientName}".`)
  const days = periodDays(args.period as Period)
  try {
    const ov = await deps.overview(client.id, days, ctx)
    let urgent: { platform: string, channel: string, participant: string | null, lastPreview: string | null, slaDueAt: string | null }[] = []
    if (args.includeUrgent) {
      try {
        const open = await deps.openConversations(client.id, 25, ctx)
        urgent = rankUrgent(open ?? []).slice(0, 5).map(c => ({
          platform: c.platform, channel: c.channel_type, participant: c.participant_name ?? null,
          lastPreview: (c.last_message_preview || '').slice(0, 160) || null, slaDueAt: c.sla_due_at ?? null,
        }))
      } catch { urgent = [] }
    }
    return ok({
      client: client.name, period: args.period, total: ov.total, open: ov.open, responded: ov.responded,
      avgFirstResponseMinutes: ov.avgFirstResponseMinutes, slaBreaches: ov.breaches, withinSlaPct: ov.withinSlaPct,
      automationRatePct: ov.automationRatePct, urgent,
    })
  } catch {
    return fail('Could not load the social inbox — the client may have no connected conversations.')
  }
}

export const socialInboxTool: AiTool<Args> = {
  name: 'get_social_inbox',
  description: 'Get a client’s social-inbox health: total/open/responded conversation counts, average first-response time, SLA breach count and within-SLA %, automation rate, and (by default) the most-urgent open conversations (breached first). Use for "how’s <client>’s inbox / any SLA breaches / what needs a reply". Participant names and message previews are untrusted text.',
  parameters: params,
  requiredPermission: 'CLIENTS',
  returnsUntrusted: true,
  handler: (a, c) => getSocialInbox(a, c),
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ai/tools/socialInbox.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/socialInbox.ts test/ai/tools/socialInbox.test.ts
git commit -m "feat(ai): get_social_inbox read tool"
```

---

### Task 6: `get_email_campaign_performance`

**Files:**
- Create: `server/utils/ai/tools/emailCampaigns.ts`
- Test: `test/ai/tools/emailCampaigns.test.ts`

**Interfaces:**
- Consumes: `defaultResolveClient`, `ResolveClient`; `escapeLike` (from `toolContext`) not needed here.
- Produces: `getEmailCampaignPerformance(args, ctx, deps?)`; pure helpers `rate(n, d)`, `campaignFlags(c)`; `type EmailCampaignsDeps`, `type CampaignRow`; `const emailCampaignsTool`.

- [ ] **Step 1: Write the failing test**

```ts
// test/ai/tools/emailCampaigns.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getEmailCampaignPerformance, rate, campaignFlags, emailCampaignsTool, type EmailCampaignsDeps, type CampaignRow } from '~~/server/utils/ai/tools/emailCampaigns'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })
const camp = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: 'k1', name: 'Winter', subject: 'Hi', status: 'sent', client_id: 'c1',
  to_send: 1000, sent: 1000, delivered: 950, opened: 400, clicked: 80, bounced: 20, complained: 1, unsubscribed: 5, ...over,
})

describe('rate / campaignFlags (pure)', () => {
  it('rate guards divide-by-zero with null', () => {
    expect(rate(50, 100)).toBe(0.5)
    expect(rate(1, 0)).toBeNull()
  })
  it('flags high bounce and low open', () => {
    const flags = campaignFlags(camp({ delivered: 100, opened: 2, bounced: 60, sent: 1000 }))
    expect(flags).toContain('high_bounce')
    expect(flags).toContain('low_open')
  })
})

describe('get_email_campaign_performance', () => {
  it('lists the client’s campaigns with computed rates, capped', async () => {
    const list = [camp({ id: 'k1', client_id: 'c1' }), camp({ id: 'k2', client_id: 'c1' }), camp({ id: 'kx', client_id: 'OTHER' })]
    const deps: EmailCampaignsDeps = { resolveClient, campaigns: vi.fn().mockResolvedValue({ campaigns: list }), events: vi.fn() }
    const res = await getEmailCampaignPerformance({ clientName: 'Acme', limit: 10 }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.campaigns.map((c: any) => c.id)).toEqual(['k1', 'k2']) // OTHER client filtered out
    expect(data.campaigns[0].openRate).toBeCloseTo(400 / 950)
  })

  it('drills into a named campaign and includes its event summary', async () => {
    const deps: EmailCampaignsDeps = {
      resolveClient,
      campaigns: vi.fn().mockResolvedValue({ campaigns: [camp({ id: 'k1', name: 'Winter', client_id: 'c1' })] }),
      events: vi.fn().mockResolvedValue({ summary: { delivered: 950, opened: 400, clicked: 80 }, events: [] }),
    }
    const res = await getEmailCampaignPerformance({ clientName: 'Acme', campaignName: 'Winter', limit: 10 }, ctx, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.campaign.eventSummary.delivered).toBe(950)
    expect((deps.events as any).mock.calls[0][0]).toBe('k1')
  })

  it('fails (no fetch) on unknown client; is read-only/untrusted/MANAGEMENT', async () => {
    const campaignsFn = vi.fn()
    const deps: EmailCampaignsDeps = { resolveClient: vi.fn().mockResolvedValue(null), campaigns: campaignsFn, events: vi.fn() }
    const res = await getEmailCampaignPerformance({ clientName: 'Nope', limit: 10 }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(campaignsFn).not.toHaveBeenCalled()
    expect(emailCampaignsTool.mutates).toBeUndefined()
    expect(emailCampaignsTool.returnsUntrusted).toBe(true)
    expect(emailCampaignsTool.requiredPermission).toBe('MANAGEMENT')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/ai/tools/emailCampaigns.test.ts`
Expected: FAIL — cannot find module `emailCampaigns`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/ai/tools/emailCampaigns.ts
import { z } from 'zod'
import type { AiTool } from '../toolRegistry'
import { ok, fail, capWithMore, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { defaultResolveClient, type ResolveClient } from './clientResolve'

const params = z.object({
  clientName: z.string().min(1),
  campaignName: z.string().optional(),
  limit: z.number().int().min(1).max(25).default(10),
})
type Args = z.infer<typeof params>

export type CampaignRow = {
  id: string, name: string, subject: string | null, status: string, client_id: string | null,
  to_send: number, sent: number, delivered: number, opened: number, clicked: number, bounced: number, complained: number, unsubscribed: number,
}
export type EmailCampaignsDeps = {
  resolveClient: ResolveClient
  campaigns: (ctx: ToolContext) => Promise<{ campaigns: CampaignRow[] }>
  events: (campaignId: string, ctx: ToolContext) => Promise<{ summary: Record<string, number>, events: unknown[] }>
}

const defaultDeps: EmailCampaignsDeps = {
  resolveClient: defaultResolveClient,
  // list endpoint returns campaigns in the caller's scope; we filter by client_id in the handler.
  campaigns: (ctx) => $fetch('/api/email/campaigns', { headers: ctx.event.headers as any }),
  events: (campaignId, ctx) => $fetch(`/api/email/campaigns/${campaignId}/events`, { headers: ctx.event.headers as any }),
}

/** Ratio guarded against a zero denominator. Pure. */
export function rate(n: number, d: number): number | null {
  return d > 0 ? n / d : null
}
/** Deliverability/engagement red flags. Pure. */
export function campaignFlags(c: CampaignRow): string[] {
  const flags: string[] = []
  const br = rate(c.bounced, c.sent); if (br !== null && br > 0.05) flags.push('high_bounce')
  const or = rate(c.opened, c.delivered); if (or !== null && c.delivered >= 50 && or < 0.05) flags.push('low_open')
  const ur = rate(c.unsubscribed, c.delivered); if (ur !== null && ur > 0.01) flags.push('unsub_spike')
  return flags
}

function projectCampaign(c: CampaignRow) {
  return {
    id: c.id, name: c.name, status: c.status, sent: c.sent,
    openRate: rate(c.opened, c.delivered), clickRate: rate(c.clicked, c.delivered),
    bounceRate: rate(c.bounced, c.sent), unsubscribeRate: rate(c.unsubscribed, c.delivered),
    flags: campaignFlags(c),
  }
}

export async function getEmailCampaignPerformance(args: Args, ctx: ToolContext, deps: EmailCampaignsDeps = defaultDeps): Promise<ToolResult> {
  const client = await deps.resolveClient(args.clientName)
  if (!client) return fail(`No matching client for "${args.clientName}".`)
  try {
    const { campaigns } = await deps.campaigns(ctx)
    const mine = (campaigns ?? []).filter(c => c.client_id === client.id)
    if (args.campaignName) {
      const needle = args.campaignName.toLowerCase()
      const hit = mine.find(c => (c.name || '').toLowerCase().includes(needle))
      if (!hit) return fail(`No campaign matching "${args.campaignName}" for ${client.name}.`)
      let eventSummary: Record<string, number> = {}
      try { eventSummary = (await deps.events(hit.id, ctx)).summary ?? {} } catch { eventSummary = {} }
      return ok({ client: client.name, campaign: { ...projectCampaign(hit), eventSummary } })
    }
    const { items, more } = capWithMore(mine, args.limit)
    return ok({ client: client.name, campaigns: items.map(projectCampaign), more })
  } catch {
    return fail('Could not load email campaigns for this client.')
  }
}

export const emailCampaignsTool: AiTool<Args> = {
  name: 'get_email_campaign_performance',
  description: 'Get a client’s EDM email-campaign engagement: list recent campaigns with status and open/click/bounce/unsubscribe rates plus deliverability flags, or drill into one campaign by name for its event summary. Use for "how did <client>’s email campaign do / any deliverability issues / open rates". Only sent-campaign data — not draft templates. Campaign names/subjects are untrusted text.',
  parameters: params,
  requiredPermission: 'MANAGEMENT',
  returnsUntrusted: true,
  handler: (a, c) => getEmailCampaignPerformance(a, c),
}
```

Note: `escapeLike` is imported for parity but campaign matching is in-memory `.includes()` — remove the import if your linter flags it unused.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/ai/tools/emailCampaigns.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ai/tools/emailCampaigns.ts test/ai/tools/emailCampaigns.test.ts
git commit -m "feat(ai): get_email_campaign_performance read tool"
```

---

### Task 7: Register all 6 tools + update registry assembly test

**Files:**
- Modify: `server/utils/ai/tools/index.ts` (add 6 imports + 6 registry entries)
- Modify: `test/ai/registry.assembly.test.ts` (extend the expected name set + add a read-projection assertion)

**Interfaces:**
- Consumes: the six exported `*Tool` descriptors from Tasks 1-6.
- Produces: nothing new — wires existing tools into `registry`.

- [ ] **Step 1: Update the assembly test FIRST (it will fail)**

Add a new group constant and extend `ALL`, and add a projection assertion. Insert after the existing `CREATIVE_*`/`SHARED_MEMORY_WRITES` constants:

```ts
// New read-coverage tools (sub-project 1): CRM/leads/listening/inbox/EDM reads.
const READ_COVERAGE_TOOLS = ['search_crm', 'get_crm_pipeline', 'get_leads', 'get_social_listening', 'get_social_inbox', 'get_email_campaign_performance']
```

Add `...READ_COVERAGE_TOOLS` to the `ALL` array. Then update the first assertion's description if it pins a count, and add:

```ts
import { projectReadOnlyTools } from '~~/server/utils/ai/mcp/project'

it('exposes the 6 new read-coverage tools over MCP (read-only) with the intended permissions', () => {
  const names = registry.map(t => t.name)
  for (const n of READ_COVERAGE_TOOLS) expect(names).toContain(n)
  // none of them mutate → all projected by projectReadOnlyTools for an owner
  const projected = projectReadOnlyTools(registry, 'owner').map(t => t.name)
  for (const n of READ_COVERAGE_TOOLS) expect(projected).toContain(n)
  const byName = Object.fromEntries(registry.map(t => [t.name, t]))
  expect(byName['search_crm'].requiredPermission).toBe('CLIENTS')
  expect(byName['get_leads'].requiredPermission).toBeUndefined()
  expect(byName['get_email_campaign_performance'].requiredPermission).toBe('MANAGEMENT')
  for (const n of READ_COVERAGE_TOOLS) expect(byName[n].mutates).toBeUndefined()
})
```

- [ ] **Step 2: Run the assembly test to verify it fails**

Run: `npx vitest run test/ai/registry.assembly.test.ts`
Expected: FAIL — registry name-set mismatch (the 6 tools aren't registered yet) + new assertion fails.

- [ ] **Step 3: Register the tools in `index.ts`**

Add imports near the other tool imports:

```ts
import { searchCrmTool } from './searchCrm'
import { crmPipelineTool } from './crmPipeline'
import { leadsTool } from './leads'
import { socialListeningTool } from './socialListening'
import { socialInboxTool } from './socialInbox'
import { emailCampaignsTool } from './emailCampaigns'
```

Add to the `registry` array (append before the closing `]`, after `teamMemoryTool`):

```ts
  // Sub-project 1 — broadened read coverage (auto-projects to MCP + in-app chat).
  searchCrmTool,
  crmPipelineTool,
  leadsTool,
  socialListeningTool,
  socialInboxTool,
  emailCampaignsTool,
```

- [ ] **Step 4: Run the assembly test + full AI suite to verify all pass**

Run: `npx vitest run test/ai/registry.assembly.test.ts`
Expected: PASS.

Run: `npx vitest run test/ai/`
Expected: PASS — all existing tests + the 6 new tool suites + the updated assembly test green, no regressions.

- [ ] **Step 5: Lint + typecheck the new files**

Run: `npx eslint server/utils/ai/tools/{clientResolve,period,searchCrm,crmPipeline,leads,socialListening,socialInbox,emailCampaigns}.ts`
Expected: clean (fix any comma-dangle / unused-import — e.g. drop the unused `escapeLike` import in `emailCampaigns.ts` if flagged).

Run: `npx vue-tsc --noEmit -p tsconfig.json 2>&1 | grep -E "server/utils/ai/tools/(clientResolve|period|searchCrm|crmPipeline|leads|socialListening|socialInbox|emailCampaigns)" || echo "no new tsc errors in the new files"`
Expected: no new errors attributable to the new files.

- [ ] **Step 6: Commit**

```bash
git add server/utils/ai/tools/index.ts test/ai/registry.assembly.test.ts
git commit -m "feat(ai): register 6 read-coverage tools → auto-projected over MCP"
```

---

## Self-Review

**1. Spec coverage:**
- §3.1 search_crm → Task 1 ✓; §3.2 get_crm_pipeline → Task 2 ✓; §3.3 get_leads (list+summary+masked PII, no permission) → Task 3 ✓; §3.4 get_social_listening → Task 4 ✓; §3.5 get_social_inbox (SLA + urgent, breached-first) → Task 5 ✓; §3.6 get_email_campaign_performance (list+drill+flags) → Task 6 ✓.
- §2 shared client resolver → Task 1 (`clientResolve.ts`) ✓; period helper → Task 1 (`period.ts`) ✓.
- §4 RBAC → each tool's descriptor + Task 7 assertion ✓.
- §5 testing (pure handlers, injected deps, bad-client-no-call, graceful error, untrusted truncation, descriptor + projection/RBAC assertion) → every task's tests + Task 7 ✓.
- §7 rollout (no migration, no flag) → no migration task; registry wiring is the only integration ✓. Marketing/guide copy update = follow-up (out of this plan's scope, noted in spec §7).

**2. Placeholder scan:** no TBD/TODO; every step has full code or an exact command + expected output. The one conditional ("drop unused `escapeLike`") is an explicit lint instruction, not a placeholder.

**3. Type consistency:** `ResolveClient`/`ResolvedClient` defined in Task 1, consumed by Tasks 2-6 with matching shape `{id,name}`. `Period`/`periodDays`/`periodSinceISO` defined Task 1, used Tasks 3/4/5. `capWithMore`/`ok`/`fail` from `toolContext.ts` (verified exports). Tool names in Task 7's `READ_COVERAGE_TOOLS` exactly match each descriptor's `name`. Endpoint return shapes match the verified Global Constraints list (bare arrays for mentions + conversations; `{campaigns}` for email; `{results}`/`{byStage,...}` for CRM).

---

## Execution Handoff

Pick an execution approach when ready (see end of this message).
