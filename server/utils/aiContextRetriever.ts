import type { H3Event } from 'h3'
import { queryRows, queryOne } from '~~/server/utils/db'
import { classifyIntent, type AiIntent } from '~~/server/utils/aiIntentClassifier'
import { searchSimilar } from '~~/server/utils/aiVectorize'
import { isUUID } from '~~/server/utils/ids'

export interface ContextItem {
  type: string
  id: string
  title: string
  snippet: string
  url: string
  relevanceScore?: number
  updatedAt?: string
  semanticScore?: number
}

export interface ContextBundle {
  items: ContextItem[]
  tokenEstimate: number
  intent: AiIntent
  intentConfidence: number
  entities: string[]
}

// Simple keyword extraction from user question
export function extractKeywords(question: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'between',
    'through', 'after', 'before', 'during', 'above', 'below', 'up', 'down',
    'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not',
    'only', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but',
    'and', 'or', 'if', 'while', 'what', 'which', 'who', 'whom', 'this',
    'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
    'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they', 'them', 'their',
    'any', 'many', 'much', 'tell', 'show', 'give', 'get', 'let', 'know',
  ])

  return question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
}

// Map AiIntent to retriever data source categories
const INTENT_TO_SOURCES: Record<AiIntent, string[]> = {
  task_query: ['tasks', 'boards'],
  brief_query: ['briefs', 'clients'],
  project_query: ['boards', 'tasks'],
  financial_query: ['financial', 'rate_card', 'saved_plans'],
  team_query: ['team', 'time_tracking'],
  process_query: ['knowledge'],
  time_tracking_query: ['time_tracking', 'team'],
  pricing_query: ['rate_card', 'financial', 'saved_plans'],
  search: ['tasks', 'clients', 'briefs', 'rate_card'],
  action_request: ['tasks', 'boards'],
  code_query: ['codebase'],
  general: ['tasks', 'clients'],
}

// --- Composite Scoring Configuration ---

interface ScoringProfile {
  semantic: number
  recency: number
  importance: number
  intent: number
  entity: number
  recencyHalfLifeDays: number
}

const SCORING_PROFILES: Record<AiIntent, ScoringProfile> = {
  task_query:      { semantic: 0.25, recency: 0.25, importance: 0.15, intent: 0.20, entity: 0.15, recencyHalfLifeDays: 30 },
  brief_query:     { semantic: 0.25, recency: 0.20, importance: 0.15, intent: 0.20, entity: 0.20, recencyHalfLifeDays: 45 },
  project_query:   { semantic: 0.25, recency: 0.20, importance: 0.15, intent: 0.20, entity: 0.20, recencyHalfLifeDays: 30 },
  financial_query: { semantic: 0.35, recency: 0.25, importance: 0.10, intent: 0.20, entity: 0.10, recencyHalfLifeDays: 14 },
  team_query:      { semantic: 0.20, recency: 0.15, importance: 0.15, intent: 0.25, entity: 0.25, recencyHalfLifeDays: 60 },
  process_query:   { semantic: 0.35, recency: 0.10, importance: 0.20, intent: 0.20, entity: 0.15, recencyHalfLifeDays: 90 },
  search:          { semantic: 0.20, recency: 0.10, importance: 0.10, intent: 0.25, entity: 0.35, recencyHalfLifeDays: 30 },
  time_tracking_query: { semantic: 0.15, recency: 0.30, importance: 0.15, intent: 0.25, entity: 0.15, recencyHalfLifeDays: 7 },
  pricing_query:   { semantic: 0.30, recency: 0.10, importance: 0.20, intent: 0.25, entity: 0.15, recencyHalfLifeDays: 180 },
  action_request:  { semantic: 0.20, recency: 0.25, importance: 0.15, intent: 0.25, entity: 0.15, recencyHalfLifeDays: 14 },
  code_query:      { semantic: 0.30, recency: 0.10, importance: 0.20, intent: 0.30, entity: 0.10, recencyHalfLifeDays: 365 },
  general:         { semantic: 0.25, recency: 0.20, importance: 0.15, intent: 0.20, entity: 0.20, recencyHalfLifeDays: 30 },
}

const ENTITY_IMPORTANCE: Record<string, number> = {
  spend: 0.85,
  financial: 0.85,
  knowledge: 0.80,
  client: 0.75,
  task: 0.70,
  brief: 0.65,
  rate_card: 0.70,
  action_plan: 0.90,
  time_tracking: 0.75,
  team: 0.60,
  board: 0.55,
}

// Estimate token count (rough: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

async function searchTasks(userId: string, keywords: string[]): Promise<ContextItem[]> {
  if (keywords.length === 0) {
    // Fallback: get user's recently assigned tasks
    const rows = await queryRows(`
      SELECT t.id, t.name, t.status, d.name as board_name,
             t.due_date, t.updated_at
      FROM tasks t
      JOIN departments d ON t.department_id = d.id
      WHERE t.assignee_id = $1
        AND t.parent_task_id IS NULL
      ORDER BY t.updated_at DESC
      LIMIT 5
    `, [userId])

    return rows.map(r => ({
      type: 'task',
      id: r.id,
      title: r.name,
      snippet: `Status: ${r.status} | Board: ${r.board_name}${r.due_date ? ` | Due: ${r.due_date}` : ''}`,
      url: `/agency/boards/${r.department_id}`,
      updatedAt: r.updated_at,
    }))
  }

  const pattern = keywords.join('|')
  const rows = await queryRows(`
    SELECT t.id, t.name, t.status, d.name as board_name,
           t.due_date, t.department_id, t.updated_at
    FROM tasks t
    JOIN departments d ON t.department_id = d.id
    WHERE t.parent_task_id IS NULL
      AND (
        t.name ~* $1
        OR t.description ~* $1
        OR t.assignee_id = $2
      )
    ORDER BY
      CASE WHEN t.assignee_id = $2 THEN 0 ELSE 1 END,
      t.updated_at DESC
    LIMIT 5
  `, [pattern, userId])

  return rows.map(r => ({
    type: 'task',
    id: r.id,
    title: r.name,
    snippet: `Status: ${r.status} | Board: ${r.board_name}${r.due_date ? ` | Due: ${r.due_date}` : ''}`,
    url: `/agency/boards/${r.department_id}`,
    updatedAt: r.updated_at,
  }))
}

async function searchBriefs(keywords: string[]): Promise<ContextItem[]> {
  const pattern = keywords.length > 0 ? keywords.join('|') : '.*'
  const rows = await queryRows(`
    SELECT b.id, b.title, b.status, b.reference_number, b.priority,
           b.updated_at, b.created_at,
           c.name as client_name,
           bt.name as template_name,
           bc.name as category_name,
           u.name as assignee_name,
           (
             SELECT string_agg(bfv.value, ' | ' ORDER BY btf.sort_order)
             FROM brief_field_values bfv
             JOIN brief_template_fields btf ON btf.id = bfv.field_id
             WHERE bfv.brief_id = b.id
               AND btf.field_type IN ('text', 'textarea', 'richtext')
               AND bfv.value IS NOT NULL AND bfv.value != ''
             LIMIT 3
           ) as field_preview
    FROM briefs b
    LEFT JOIN agency_clients c ON b.client_id = c.id
    LEFT JOIN brief_templates bt ON b.template_id = bt.id
    LEFT JOIN brief_categories bc ON bt.category_id = bc.id
    LEFT JOIN users u ON b.assigned_to = u.id
    WHERE b.title ~* $1
       OR c.name ~* $1
       OR b.reference_number ~* $1
       OR EXISTS (
         SELECT 1 FROM brief_field_values bfv
         WHERE bfv.brief_id = b.id AND bfv.value ~* $1
       )
    ORDER BY b.updated_at DESC NULLS LAST
    LIMIT 8
  `, [pattern])

  return rows.map(r => {
    const parts = [
      r.client_name ? `Client: ${r.client_name}` : null,
      `Status: ${r.status}`,
      r.template_name ? `Type: ${r.template_name}` : null,
      r.category_name ? `Category: ${r.category_name}` : null,
      r.assignee_name ? `Assignee: ${r.assignee_name}` : null,
      r.reference_number ? `Ref: ${r.reference_number}` : null,
    ].filter(Boolean).join(' | ')

    const preview = r.field_preview ? ` — ${String(r.field_preview).slice(0, 200)}` : ''

    return {
      type: 'brief' as const,
      id: r.id,
      title: r.title || 'Untitled Brief',
      snippet: parts + preview,
      url: `/agency/briefs/${r.id}`,
      updatedAt: r.updated_at || r.created_at,
    }
  })
}

async function searchBoards(userId: string): Promise<ContextItem[]> {
  const rows = await queryRows(`
    SELECT d.id, d.name, d.description,
           COUNT(t.id) FILTER (WHERE t.parent_task_id IS NULL) as task_count,
           COUNT(t.id) FILTER (WHERE t.status = 'done' AND t.parent_task_id IS NULL) as done_count,
           MAX(t.updated_at) as latest_activity
    FROM departments d
    LEFT JOIN tasks t ON t.department_id = d.id
    LEFT JOIN department_members dm ON dm.department_id = d.id AND dm.team_member_id = $1
    WHERE dm.team_member_id IS NOT NULL OR d.manager_id = $1
    GROUP BY d.id, d.name, d.description
    ORDER BY MAX(t.updated_at) DESC NULLS LAST
    LIMIT 5
  `, [userId])

  return rows.map(r => ({
    type: 'board',
    id: r.id,
    title: r.name,
    snippet: `${r.task_count} tasks (${r.done_count} done)${r.description ? ` — ${r.description.slice(0, 80)}` : ''}`,
    url: `/agency/boards/${r.id}`,
    updatedAt: r.latest_activity,
  }))
}

async function searchClients(keywords: string[]): Promise<ContextItem[]> {
  const pattern = keywords.length > 0 ? keywords.join('|') : '.*'
  const rows = await queryRows(`
    SELECT c.id, c.name, c.is_active, c.created_at,
           COUNT(DISTINCT b.id) as brief_count
    FROM agency_clients c
    LEFT JOIN briefs b ON b.client_id = c.id
    WHERE c.name ~* $1
    GROUP BY c.id, c.name, c.is_active, c.created_at
    ORDER BY c.name ASC
    LIMIT 5
  `, [pattern])

  return rows.map(r => ({
    type: 'client',
    id: r.id,
    title: r.name,
    snippet: `Status: ${r.is_active === false ? 'inactive' : 'active'} | ${r.brief_count} briefs`,
    url: `/agency/clients/${r.id}`,
    updatedAt: r.created_at,
  }))
}

async function searchFinancial(keywords: string[], question?: string, event?: H3Event): Promise<ContextItem[]> {
  const items: ContextItem[] = []

  // ─── Live Xero data (primary source for financial queries) ───
  // Use Nitro's auto-imported $fetch with event.headers — this uses localFetch for
  // internal routes (no HTTP roundtrip), matching the working pattern in chat.post.ts.
  if (event) {
    const fetchOpts = { headers: event.headers }

    // Fetch 4 Xero endpoints in parallel — each is independent
    const [bankRes, invoiceRes, expenseRes, pnlRes] = await Promise.allSettled([
      $fetch<any>('/api/xero/bank-monitoring', fetchOpts),
      $fetch<any>('/api/xero/invoices', fetchOpts),
      $fetch<any>('/api/xero/expenses', fetchOpts),
      $fetch<any>('/api/xero/reports/pnl', fetchOpts),
    ])

    // Cash position — response shape: { portfolio: { totalBalance, riskLevel, ... }, accounts: [...], alerts: [...] }
    const bank = bankRes.status === 'fulfilled' ? bankRes.value : null
    if (bank?.portfolio) {
      const p = bank.portfolio
      const accounts = (bank.accounts || []).map((a: any) => `${a.accountName}: $${Math.round(a.currentBalance || 0).toLocaleString()} (${a.healthStatus})`).join(', ')
      const alertList = (bank.alerts || []).map((a: any) => a.message).slice(0, 3).join('; ')
      items.push({
        type: 'financial',
        id: 'xero-cash-position',
        title: 'Cash Position',
        snippet: `Total balance: $${Math.round(p.totalBalance || 0).toLocaleString()} | Risk: ${p.riskLevel || 'unknown'} | Net cash flow (${bank.period?.days || 30}d): $${Math.round(p.netCashFlow || 0).toLocaleString()} | Velocity: ${(p.cashVelocity || 0).toFixed(1)}x | ${bank.accounts?.length || 0} accounts: ${accounts}${alertList ? ` | Alerts: ${alertList}` : ''}`,
        url: '/cashflow',
        updatedAt: bank.asOfDate || new Date().toISOString(),
      })
    }

    // Invoices — response shape: { summary: { outstandingTotal, overdueTotal, ... }, outstanding: [...], overdue: [...], paid: [...] }
    const inv = invoiceRes.status === 'fulfilled' ? invoiceRes.value : null
    if (inv?.summary) {
      const s = inv.summary
      const topCustomers = (s.topCustomers || []).slice(0, 3).map((c: any) => `${c.name}: $${Math.round(c.outstanding || 0).toLocaleString()}`).join(', ')
      items.push({
        type: 'financial',
        id: 'xero-invoices',
        title: 'Invoice Summary',
        snippet: `Outstanding: ${s.outstandingCount || 0} invoices ($${Math.round(s.outstandingTotal || 0).toLocaleString()}) | Overdue: ${s.overdueCount || 0} ($${Math.round(s.overdueTotal || 0).toLocaleString()}) | Due soon: $${Math.round(s.dueSoonTotal || 0).toLocaleString()} | Paid last 30d: ${s.paidLast30Count || 0} ($${Math.round(s.paidLast30Total || 0).toLocaleString()}) | Avg days to pay: ${s.avgDaysToPay ?? 'N/A'}${topCustomers ? ` | Top outstanding: ${topCustomers}` : ''}`,
        url: '/invoices',
        updatedAt: new Date().toISOString(),
      })

      // Individual overdue invoices for detail
      const overdueList = (inv.overdue || []).slice(0, 5)
      if (overdueList.length > 0) {
        const lines = overdueList.map((o: any) => `${o.contact} #${o.number}: $${Math.round(o.amountDue || 0).toLocaleString()} (${o.daysOverdue}d overdue)`)
        items.push({
          type: 'financial',
          id: 'xero-invoices-overdue',
          title: 'Overdue Invoice Details',
          snippet: lines.join(' | '),
          url: '/invoices',
          updatedAt: new Date().toISOString(),
        })
      }
    }

    // Expenses — response shape: { categories: [...], vendors: [...], taxSummary, monthOverMonth, fixedVsVariable, subscriptions }
    const exp = expenseRes.status === 'fulfilled' ? expenseRes.value : null
    if (exp) {
      const cats = exp.categories || []
      const totalNet = exp.taxSummary?.totalNet || cats.reduce((s: number, c: any) => s + (c.amount || 0), 0)
      const mom = exp.monthOverMonth || {}
      const topCats = cats.slice(0, 5).map((c: any) => `${c.name}: $${Math.round(c.amount || 0).toLocaleString()}`).join(', ')
      const topVendors = (exp.vendors || []).slice(0, 5).map((v: any) => `${v.name}: $${Math.round(v.amount || 0).toLocaleString()}`).join(', ')
      const fv = exp.fixedVsVariable || {}
      const subs = exp.subscriptions || {}
      items.push({
        type: 'financial',
        id: 'xero-expenses',
        title: 'Expense Summary',
        snippet: `Total: $${Math.round(totalNet).toLocaleString()} (ex GST) | MoM change: ${mom.change ?? 0}% ($${Math.round(mom.changeAmount || 0).toLocaleString()}) | Top categories: ${topCats || 'N/A'} | Top vendors: ${topVendors || 'N/A'} | Fixed: $${Math.round(fv.fixed?.total || 0).toLocaleString()} Variable: $${Math.round(fv.variable?.total || 0).toLocaleString()} | Subscriptions: ${subs.items?.length || 0} vendors ($${Math.round(subs.total || 0).toLocaleString()}/mo)`,
        url: '/expenses',
        updatedAt: new Date().toISOString(),
      })

      // Subscription detail
      if (subs.items?.length > 0) {
        const subLines = subs.items.slice(0, 8).map((s: any) => `${s.vendor}: $${Math.round(s.amount || 0).toLocaleString()}/${s.frequency || 'mo'}`)
        items.push({
          type: 'financial',
          id: 'xero-subscriptions',
          title: 'Subscription Costs',
          snippet: subLines.join(' | '),
          url: '/expenses',
          updatedAt: new Date().toISOString(),
        })
      }
    }

    // P&L — response shape: { revenueTotal, expensesTotal, netProfit, profitMargin, periods: [...], expensesByCategory: [...] }
    const pnl = pnlRes.status === 'fulfilled' ? pnlRes.value : null
    if (pnl && (pnl.revenueTotal || pnl.expensesTotal)) {
      const revenue = pnl.revenueTotal || 0
      const expenses = pnl.expensesTotal || 0
      const net = pnl.netProfit ?? (revenue - expenses)
      const margin = pnl.profitMargin != null ? (pnl.profitMargin * 100).toFixed(1) : (revenue > 0 ? ((net / revenue) * 100).toFixed(1) : '0')
      const expCats = (pnl.expensesByCategory || []).slice(0, 5).map((c: any) => `${c.name}: $${Math.round(c.value || 0).toLocaleString()}`).join(', ')
      const periods = (pnl.periods || []).map((p: any) => `${p.label}: Rev $${Math.round(p.revenue || 0).toLocaleString()} / Exp $${Math.round(p.expenses || 0).toLocaleString()} / Net $${Math.round(p.netProfit || 0).toLocaleString()}`).join(' | ')
      items.push({
        type: 'financial',
        id: 'xero-pnl',
        title: 'Profit & Loss',
        snippet: `Revenue: $${Math.round(revenue).toLocaleString()} | Expenses: $${Math.round(expenses).toLocaleString()} | Net profit: $${Math.round(net).toLocaleString()} | Margin: ${margin}% | Period: ${pnl.fromDate} to ${pnl.toDate}${expCats ? ` | Expense breakdown: ${expCats}` : ''}${periods ? ` | Periods: ${periods}` : ''}`,
        url: '/profit-loss',
        updatedAt: new Date().toISOString(),
      })
    }
  }

  // ─── DB sources (EOM runs + ad spend) ───

  // Recent EOM runs
  try {
    const eomRows = await queryRows(`
      SELECT id, month, year, status, total_ex_gst, invoice_count, line_item_count
      FROM eom_runs
      ORDER BY year DESC, month DESC
      LIMIT 3
    `)

    for (const r of eomRows) {
      items.push({
        type: 'spend',
        id: r.id,
        title: `EOM Run ${r.year}-${String(r.month).padStart(2, '0')}`,
        snippet: `Status: ${r.status} | ${r.invoice_count} invoices | ${r.line_item_count} line items${r.total_ex_gst ? ` | $${Number(r.total_ex_gst).toLocaleString()} ex GST` : ''}`,
        url: `/agency/eom/${r.id}`,
        updatedAt: new Date(r.year, r.month - 1).toISOString(),
      })
    }
  } catch {
    // eom_runs table may not exist yet
  }

  // Recent media spend summary
  try {
    const spendRows = await queryRows(`
      SELECT platform, SUM(actual_spend) as total_spend,
             COUNT(DISTINCT client_id) as client_count,
             MAX(period) as latest_period
      FROM media_spend
      GROUP BY platform
      ORDER BY total_spend DESC
      LIMIT 3
    `)

    for (const r of spendRows) {
      items.push({
        type: 'spend',
        id: `spend-${r.platform}`,
        title: `${r.platform} Ad Spend`,
        snippet: `$${Number(r.total_spend).toLocaleString()} total | ${r.client_count} clients | Latest: ${r.latest_period}`,
        url: `/agency/social/spend`,
        updatedAt: r.latest_period ? new Date(r.latest_period).toISOString() : undefined,
      })
    }
  } catch {
    // media_spend table may not exist yet
  }

  // ─── Vectorize embeddings (richer historical data if available) ───
  if (question) {
    try {
      const finResults = await searchFinancialEmbeddings(question, event)
      items.push(...finResults)
    } catch {
      // Vectorize not available — continue with live + DB results
    }
  }

  return items.slice(0, 12)
}

// Search Vectorize for financial embedding vectors (type prefix 'fin-')
async function searchFinancialEmbeddings(question: string, event?: H3Event): Promise<ContextItem[]> {
  const results = event ? await searchSimilar(event, question, 8) : await searchSimilar(question, 8)
  const items: ContextItem[] = []

  for (const match of results) {
    const type = match.metadata?.type || ''
    if (!type.startsWith('fin-')) continue
    if (match.score < 0.5) continue

    // Map financial types to URLs
    let url = '/expenses'
    if (type === 'fin-invoices') url = '/invoices'
    else if (type === 'fin-pnl') url = '/profit-loss'
    else if (type === 'fin-cash') url = '/cashflow'
    else if (type === 'fin-client' && match.metadata?.clientId) url = `/agency/clients/${match.metadata.clientId}`

    items.push({
      type: 'financial',
      id: match.id,
      title: match.metadata?.title || `Financial Data (${type})`,
      snippet: `Period: ${match.metadata?.period || 'current'} | Semantic match: ${Math.round(match.score * 100)}%`,
      url,
      semanticScore: match.score,
      updatedAt: match.metadata?.period ? new Date(match.metadata.period).toISOString() : undefined,
    })
  }

  return items
}

async function searchTeam(keywords: string[]): Promise<ContextItem[]> {
  const pattern = keywords.length > 0 ? keywords.join('|') : '.*'
  const rows = await queryRows(`
    SELECT tm.id, tm.name, tm.role, tm.email, tm.created_at,
           COUNT(t.id) FILTER (WHERE t.status NOT IN ('done', 'complete', 'skipped')) as active_tasks
    FROM team_members tm
    LEFT JOIN tasks t ON t.assignee_id = tm.id AND t.parent_task_id IS NULL
    WHERE tm.is_active = true
      AND (tm.name ~* $1 OR tm.role ~* $1)
    GROUP BY tm.id, tm.name, tm.role, tm.email, tm.created_at
    ORDER BY active_tasks DESC
    LIMIT 5
  `, [pattern])

  return rows.map(r => ({
    type: 'team',
    id: r.id,
    title: r.name,
    snippet: `Role: ${r.role} | ${r.active_tasks} active tasks`,
    url: `/agency/team`,
    updatedAt: r.created_at,
  }))
}

// Search knowledge base articles for process/SOP queries
async function searchKnowledge(keywords: string[], question: string, event?: H3Event): Promise<ContextItem[]> {
  const items: ContextItem[] = []

  // Text search
  if (keywords.length > 0) {
    const pattern = keywords.join('|')
    try {
      const rows = await queryRows(`
        SELECT id, title, content, category, tags, view_count, updated_at
        FROM ai_knowledge_articles
        WHERE is_published = true
          AND (title ~* $1 OR content ~* $1)
        ORDER BY usefulness_score DESC, view_count DESC
        LIMIT 3
      `, [pattern])

      for (const r of rows) {
        items.push({
          type: 'knowledge',
          id: r.id,
          title: r.title,
          snippet: r.content.length > 200 ? r.content.slice(0, 200) + '...' : r.content,
          url: `/agency/ai/knowledge`,
          relevanceScore: 0.7,
          updatedAt: r.updated_at,
        })
      }
    } catch {
      // ai_knowledge_articles may not exist yet
    }
  }

  // Semantic search via Vectorize (complements text search)
  try {
    const semanticResults = event ? await searchSimilar(event, question, 3) : await searchSimilar(question, 3)
    for (const match of semanticResults) {
      if (match.metadata?.type === 'knowledge_article' && match.score > 0.6) {
        // Avoid duplicates from text search
        const existing = items.find(i => i.id === match.metadata.id)
        if (existing) {
          existing.semanticScore = match.score
        } else {
          items.push({
            type: 'knowledge',
            id: match.metadata.id || '',
            title: match.metadata.title || 'Knowledge Article',
            snippet: `Category: ${match.metadata.category || 'General'} (semantic match: ${Math.round(match.score * 100)}%)`,
            url: `/agency/ai/knowledge`,
            semanticScore: match.score,
          })
        }
      }
    }
  } catch {
    // Vectorize not available
  }

  return items.slice(0, 3)
}

async function searchRateCards(keywords: string[]): Promise<ContextItem[]> {
  const items: ContextItem[] = []

  try {
    if (keywords.length === 0) {
      // No keywords — return top categories summary
      const rows = await queryRows(`
        SELECT c.name AS category_name, COUNT(i.id) AS item_count,
               MIN(i.price) AS min_price, MAX(i.price) AS max_price
        FROM rate_card_categories c
        JOIN rate_card_items i ON i.category_id = c.id AND i.is_active = true
        WHERE c.is_active = true
        GROUP BY c.name
        ORDER BY c.name ASC
        LIMIT 5
      `)
      for (const r of rows) {
        items.push({
          type: 'rate_card',
          id: `cat-${r.category_name}`,
          title: `Rate Card: ${r.category_name}`,
          snippet: `${r.item_count} services, $${Number(r.min_price).toFixed(0)}–$${Number(r.max_price).toFixed(0)}`,
          url: '/agency/rate-cards',
        })
      }
      return items
    }

    const pattern = keywords.join('|')

    const rows = await queryRows(`
      SELECT i.id, i.service_name, i.price, i.price_unit, i.setup_fee, i.notes,
             c.name AS category_name, i.updated_at
      FROM rate_card_items i
      JOIN rate_card_categories c ON c.id = i.category_id
      WHERE i.is_active = true
        AND (i.service_name ~* $1 OR c.name ~* $1)
      ORDER BY i.service_name ASC
      LIMIT 5
    `, [pattern])

    for (const r of rows) {
      const priceStr = r.price_unit === 'POA' ? 'POA' : `$${Number(r.price).toFixed(2)} ${r.price_unit}`
      const setupStr = r.setup_fee > 0 ? ` + $${Number(r.setup_fee).toFixed(2)} setup` : ''
      items.push({
        type: 'rate_card',
        id: r.id,
        title: `${r.category_name}: ${r.service_name}`,
        snippet: `${priceStr}${setupStr}${r.notes ? ` | ${r.notes}` : ''}`,
        url: '/agency/rate-cards',
        updatedAt: r.updated_at,
      })
    }
  } catch {
    // rate_card tables may not exist yet
  }

  return items
}

async function searchTimeTracking(userId: string, keywords: string[]): Promise<ContextItem[]> {
  const items: ContextItem[] = []

  // 1. Recent time entries (last 14 days)
  const entryRows = await queryRows(`
    SELECT te.id, te.date, te.hours, te.billable, te.description, te.status,
           p.name AS project_name, t.title AS task_title,
           tm.name AS user_name
    FROM time_entries te
    LEFT JOIN projects p ON te.project_id = p.id
    LEFT JOIN tasks t ON te.task_id = t.id
    LEFT JOIN team_members tm ON te.user_id = tm.id
    WHERE te.user_id = $1
      AND te.date >= NOW() - INTERVAL '14 days'
    ORDER BY te.date DESC
    LIMIT 10
  `, [userId])

  if (entryRows.length > 0) {
    const totalHours = entryRows.reduce((sum, r) => sum + Number(r.hours), 0)
    const billableHours = entryRows.filter(r => r.billable).reduce((sum, r) => sum + Number(r.hours), 0)
    items.push({
      type: 'time_tracking',
      id: 'recent-entries',
      title: 'Recent Time Entries (Last 14 Days)',
      snippet: `${totalHours.toFixed(1)}h total (${billableHours.toFixed(1)}h billable) across ${entryRows.length} entries. Latest: ${entryRows.slice(0, 3).map(r => `${r.project_name || 'No project'} — ${r.hours}h on ${r.date}`).join('; ')}`,
      url: '/agency/time',
      updatedAt: entryRows[0]?.date,
    })
  }

  // 2. Timesheet status for current/recent periods
  const tsRows = await queryRows(`
    SELECT tp.id, tp.period_start, tp.period_end, tp.status,
           tp.total_hours, tp.billable_hours,
           tm.name AS user_name
    FROM timesheet_periods tp
    LEFT JOIN team_members tm ON tp.user_id = tm.id
    WHERE tp.user_id = $1
    ORDER BY tp.period_start DESC
    LIMIT 3
  `, [userId])

  for (const r of tsRows) {
    items.push({
      type: 'time_tracking',
      id: r.id,
      title: `Timesheet ${r.period_start} to ${r.period_end}`,
      snippet: `Status: ${r.status} | ${Number(r.total_hours || 0).toFixed(1)}h total (${Number(r.billable_hours || 0).toFixed(1)}h billable)`,
      url: '/agency/time',
      updatedAt: r.period_start,
    })
  }

  // 3. Active timers
  try {
    const timerRows = await queryRows(`
      SELECT at.id, at.started_at, at.description,
             p.name AS project_name, t.title AS task_title
      FROM active_timers at
      LEFT JOIN projects p ON at.project_id = p.id
      LEFT JOIN tasks t ON at.task_id = t.id
      WHERE at.user_id = $1
    `, [userId])

    for (const r of timerRows) {
      const elapsed = Math.floor((Date.now() - new Date(r.started_at).getTime()) / (1000 * 60 * 60))
      items.push({
        type: 'time_tracking',
        id: r.id,
        title: 'Active Timer',
        snippet: `Running for ${elapsed}h on ${r.project_name || 'No project'}${r.task_title ? ` — ${r.task_title}` : ''}. ${r.description || ''}`,
        url: '/agency/time',
        updatedAt: r.started_at,
      })
    }
  } catch {
    // active_timers table may not exist
  }

  return items.slice(0, 5)
}

async function searchSavedActionPlans(userId: string, keywords: string[]): Promise<ContextItem[]> {
  const items: ContextItem[] = []

  try {
    const rows = await queryRows(`
      SELECT id, source_type, source_title, source_category, source_severity,
             plan_data, note, status, created_at, updated_at
      FROM saved_action_plans
      WHERE user_id = $1
        AND status IN ('active', 'in_progress')
      ORDER BY updated_at DESC
      LIMIT 10
    `, [userId])

    for (const r of rows) {
      const plan = typeof r.plan_data === 'string' ? JSON.parse(r.plan_data) : r.plan_data
      const summary = plan?.summary || ''
      const stepCount = plan?.actionSteps?.length || 0
      const impact = plan?.estimatedImpact || ''
      const statusLabel = r.status === 'in_progress' ? 'In Progress' : 'Active'

      items.push({
        type: 'action_plan',
        id: r.id,
        title: `Saved Plan: ${r.source_title}`,
        snippet: `[${statusLabel}] ${r.source_category ? `Category: ${r.source_category}. ` : ''}${summary} (${stepCount} action steps)${impact ? `. Impact: ${impact}` : ''}${r.note ? `. Note: ${r.note}` : ''}`,
        url: '/insights',
        updatedAt: r.updated_at || r.created_at,
      })
    }
  } catch {
    // saved_action_plans table may not exist yet
  }

  return items
}

// Attach semantic scores from Vectorize to DB-sourced items (single query)
async function semanticRerank(items: ContextItem[], question: string, event?: H3Event): Promise<ContextItem[]> {
  if (items.length === 0) return items

  try {
    const topK = Math.min(items.length * 2, 20)
    const results = event ? await searchSimilar(event, question, topK) : await searchSimilar(question, topK)
    if (results.length === 0) return items

    const scoreMap = new Map<string, number>()
    for (const r of results) {
      const type = r.metadata?.type === 'knowledge_article' ? 'knowledge' : (r.metadata?.type || '')
      const id = r.metadata?.id || r.id
      scoreMap.set(`${type}:${id}`, r.score)
    }

    return items.map(item => {
      const key = `${item.type}:${item.id}`
      const score = scoreMap.get(key)
      return score !== undefined ? { ...item, semanticScore: Math.max(item.semanticScore || 0, score) } : item
    })
  } catch {
    // Vectorize unavailable — return items unmodified
    return items
  }
}

/**
 * Search the connected codebases (graphify graphs in R2) for nodes
 * matching the user's keywords.
 *
 * Scope rules:
 *  - If `boardId` is provided, only the repo connected to that board is searched.
 *  - Otherwise fans out to repos the user can access, capped to the most
 *    recently synced 3 to bound R2 cost (admins might have many repos).
 */
const MAX_FANOUT_REPOS = 3

async function searchCodebase(
  userId: string,
  userRole: string,
  keywords: string[],
  boardId?: string,
): Promise<ContextItem[]> {
  if (keywords.length === 0) return []

  const isAdmin = userRole === 'owner' || userRole === 'admin'

  // Resolve boardId to a canonical UUID (callers may pass either form).
  let resolvedBoardId: string | undefined
  if (boardId) {
    if (isUUID(boardId)) {
      resolvedBoardId = boardId
    } else {
      const dept = await queryOne<{ id: string }>(
        'SELECT id FROM departments WHERE slug = $1',
        [boardId],
      )
      if (dept) resolvedBoardId = dept.id
      // If slug doesn't resolve, treat as no board context — fall through to fan-out.
    }
  }

  // 1) board-scoped: prefer the explicit board context if supplied
  let sql: string
  let params: any[]
  if (resolvedBoardId) {
    // Still respect access — admin sees any, member must be in department_members.
    if (isAdmin) {
      sql = `SELECT pr.graphify_path, d.id AS dept_id, d.name AS board_name
               FROM project_repos pr
               JOIN departments d ON d.id = pr.department_id
              WHERE pr.graphify_path IS NOT NULL
                AND pr.department_id = $1
              LIMIT 1`
      params = [resolvedBoardId]
    } else {
      sql = `SELECT pr.graphify_path, d.id AS dept_id, d.name AS board_name
               FROM project_repos pr
               JOIN departments d ON d.id = pr.department_id
              WHERE pr.graphify_path IS NOT NULL
                AND pr.department_id = $1
                AND EXISTS (
                  SELECT 1 FROM department_members dm
                   WHERE dm.department_id = pr.department_id
                     AND dm.team_member_id = $2
                )
              LIMIT 1`
      params = [resolvedBoardId, userId]
    }
  } else if (isAdmin) {
    sql = `SELECT pr.graphify_path, d.id AS dept_id, d.name AS board_name
             FROM project_repos pr
             JOIN departments d ON d.id = pr.department_id
            WHERE pr.graphify_path IS NOT NULL
            ORDER BY pr.graphify_last_synced_at DESC NULLS LAST, pr.updated_at DESC
            LIMIT $1`
    params = [MAX_FANOUT_REPOS]
  } else {
    sql = `SELECT pr.graphify_path, d.id AS dept_id, d.name AS board_name
             FROM project_repos pr
             JOIN departments d ON d.id = pr.department_id
            WHERE pr.graphify_path IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM department_members dm
                 WHERE dm.department_id = pr.department_id
                   AND dm.team_member_id = $1
              )
            ORDER BY pr.graphify_last_synced_at DESC NULLS LAST, pr.updated_at DESC
            LIMIT $2`
    params = [userId, MAX_FANOUT_REPOS]
  }

  let repos: { graphify_path: string; dept_id: string; board_name: string }[]
  try {
    repos = await queryRows<{ graphify_path: string; dept_id: string; board_name: string }>(
      sql,
      params,
    )
  } catch (err) {
    console.error('[searchCodebase] repo lookup failed', err)
    return []
  }
  if (repos.length === 0) return []

  // Lazy-import to avoid loading the AWS SDK when no code questions are asked.
  const { searchNodes, GraphifyError } = await import('~~/server/utils/graphify')

  const items: ContextItem[] = []
  // Top 3 keywords — keeps cost bounded across multiple repos.
  const topKeywords = keywords.slice(0, 3)

  for (const repo of repos) {
    for (const kw of topKeywords) {
      try {
        const nodes = await searchNodes(repo.graphify_path, kw, 5)
        for (const n of nodes) {
          items.push({
            type: 'codebase',
            id: `${repo.dept_id}:${n.id}`,
            title: n.label,
            snippet: `${n.source_file ?? 'unknown source'}${n.source_location ? ` (${n.source_location})` : ''} · board: ${repo.board_name}`,
            url: `/agency/boards/${repo.dept_id}`,
            relevanceScore: 0.6,
          })
        }
      } catch (err) {
        if (err instanceof GraphifyError && err.status === 404) {
          // Artifact missing in R2 (graphify_path probably stale) — skip silently
          continue
        }
        // Real errors get a stack so they show up in observability.
        console.error(
          `[searchCodebase] graphify search failed for path=${repo.graphify_path} kw="${kw}":`,
          err,
        )
      }
    }
  }

  return items
}

// 5-signal composite scoring: semantic + recency + importance + intent + entity
function compositeScore(items: ContextItem[], intent: AiIntent, entities: string[]): ContextItem[] {
  const profile = SCORING_PROFILES[intent] || SCORING_PROFILES.general
  const primarySources = INTENT_TO_SOURCES[intent] || ['tasks', 'clients']
  const lambda = Math.LN2 / profile.recencyHalfLifeDays
  const now = Date.now()
  const entitiesLower = entities.map(e => e.toLowerCase())

  return items.map(item => {
    // 1. Semantic signal
    const semantic = item.semanticScore || 0

    // 2. Recency signal (exponential decay)
    let recency = 0.5 // neutral default when no timestamp
    if (item.updatedAt) {
      const ageDays = Math.max(0, (now - new Date(item.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
      recency = Math.exp(-lambda * ageDays)
    }

    // 3. Importance signal (entity-type static weight)
    const importance = ENTITY_IMPORTANCE[item.type] || 0.50

    // 4. Intent match signal (binary: is this type a primary source for the intent?)
    const intentMatch = primarySources.includes(item.type) ? 1.0 : 0.0

    // 5. Entity overlap signal (fraction of entities found in item text)
    let entityOverlap = 0
    if (entitiesLower.length > 0) {
      const itemText = `${item.title} ${item.snippet}`.toLowerCase()
      let matchCount = 0
      for (const e of entitiesLower) {
        if (itemText.includes(e)) matchCount++
      }
      entityOverlap = matchCount / entitiesLower.length
    }

    const score =
      (profile.semantic * semantic) +
      (profile.recency * recency) +
      (profile.importance * importance) +
      (profile.intent * intentMatch) +
      (profile.entity * entityOverlap)

    return { ...item, relevanceScore: Math.min(score, 1.0) }
  }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
}

// Penalize over-representation of a single type in top results.
// For code_query, codebase items are SUPPOSED to dominate, so we raise
// the cap for them to avoid starving the answer.
function applyDiversityPenalty(items: ContextItem[], intent: AiIntent): ContextItem[] {
  const typeCounts = new Map<string, number>()
  const primarySources = INTENT_TO_SOURCES[intent] || []
  const penalized = items.map(item => {
    const count = (typeCounts.get(item.type) || 0) + 1
    typeCounts.set(item.type, count)
    // Allow up to 10 of the intent's primary type, 3 of every other.
    const cap = primarySources.includes(item.type) ? 10 : 3
    if (count > cap) {
      const penalty = 0.08 * (count - cap)
      return { ...item, relevanceScore: Math.max(0, (item.relevanceScore || 0) - penalty) }
    }
    return item
  })
  return penalized.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
}

export async function retrieveContext(
  userId: string,
  userRole: string,
  question: string,
  event?: H3Event,
  boardId?: string,
): Promise<ContextBundle> {
  const keywords = extractKeywords(question)

  // Use the intent classifier for smarter source selection
  const intentResult = await classifyIntent(question)
  const sources = new Set(INTENT_TO_SOURCES[intentResult.intent] || ['tasks', 'clients'])

  // If entities were detected, also search clients and tasks for those names
  if (intentResult.entities.length > 0) {
    sources.add('clients')
    sources.add('tasks')
  }

  const queryPromises: Promise<ContextItem[]>[] = []

  if (sources.has('tasks')) {
    queryPromises.push(searchTasks(userId, keywords).catch(() => []))
  }
  if (sources.has('briefs')) {
    queryPromises.push(searchBriefs(keywords).catch(() => []))
  }
  if (sources.has('boards')) {
    queryPromises.push(searchBoards(userId).catch(() => []))
  }
  if (sources.has('clients')) {
    queryPromises.push(searchClients(keywords).catch(() => []))
  }
  if (sources.has('financial')) {
    queryPromises.push(searchFinancial(keywords, question, event).catch(() => []))
  }
  if (sources.has('team')) {
    queryPromises.push(searchTeam(keywords).catch(() => []))
  }
  if (sources.has('knowledge')) {
    queryPromises.push(searchKnowledge(keywords, question, event).catch(() => []))
  }
  if (sources.has('time_tracking')) {
    queryPromises.push(searchTimeTracking(userId, keywords).catch(() => []))
  }
  if (sources.has('rate_card')) {
    queryPromises.push(searchRateCards(keywords).catch(() => []))
  }
  if (sources.has('saved_plans')) {
    queryPromises.push(searchSavedActionPlans(userId, keywords).catch(() => []))
  }
  if (sources.has('codebase')) {
    queryPromises.push(searchCodebase(userId, userRole, keywords, boardId).catch(() => []))
  }

  const results = await Promise.all(queryPromises)
  const allItems = results.flat()

  // Deduplicate by id
  const seen = new Set<string>()
  const unique: ContextItem[] = []
  for (const item of allItems) {
    const key = `${item.type}:${item.id}`
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }

  // Composite scoring pipeline
  const reranked = await semanticRerank(unique, question, event)
  const scored = compositeScore(reranked, intentResult.intent, intentResult.entities)
  const diverse = applyDiversityPenalty(scored, intentResult.intent)

  // Token budget: ~3000 tokens for context
  let tokenCount = 0
  const budgetItems: ContextItem[] = []
  for (const item of diverse) {
    const itemTokens = estimateTokens(`${item.type}: ${item.title} — ${item.snippet}`)
    if (tokenCount + itemTokens > 3000) break
    budgetItems.push(item)
    tokenCount += itemTokens
  }

  return {
    items: budgetItems,
    tokenEstimate: tokenCount,
    intent: intentResult.intent,
    intentConfidence: intentResult.confidence,
    entities: intentResult.entities,
  }
}
