import { readBody, createError } from 'h3'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { searchSimilar } from '~~/server/utils/aiVectorize'
import { cachedFetch } from '~~/server/utils/kv'
import { getSelectedTenant } from '~~/server/utils/session'

interface ActionPlanRequest {
  type: 'anomaly' | 'recommendation' | 'insight'
  title: string
  description: string
  severity?: string
  category?: string
  metric?: { label: string, value: string | number }
  recommendation?: string
  actionSteps?: string[]
  tags?: string[]
}

interface ActionStep {
  step: number
  action: string
  detail: string
  priority: 'immediate' | 'short-term' | 'medium-term'
  owner?: string
}

interface RegulatoryReference {
  body: string
  relevance: string
  url?: string
}

interface IndustryInsight {
  category: 'benchmark' | 'best-practice' | 'tip'
  title: string
  detail: string
  sourceName?: string
  sourceUrl?: string
}

interface ActionPlanResponse {
  summary: string
  actionSteps: ActionStep[]
  regulatoryContext: string
  references: RegulatoryReference[]
  timeline: string
  riskAssessment: string
  estimatedImpact: string
  xeroDataUsed: string[]
  vectorizeContextUsed: boolean
  industryInsights?: IndustryInsight[]
}

export default eventHandler(async (event) => {
  const body = await readBody<ActionPlanRequest>(event)

  if (!body?.title || !body?.description) {
    throw createError({ statusCode: 400, statusMessage: 'title and description are required' })
  }

  const tenantId = getSelectedTenant(event)

  // Build a cache key from the item title (action plans are deterministic per item)
  const safeTitle = body.title.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 60)
  const cacheKey = `ai:action-plan:${tenantId || 'default'}:${safeTitle}`

  return cachedFetch(event, cacheKey, 1800, async () => {
    // ── 1. Determine which Xero data sources are relevant ──
    const category = (body.category || body.type || '').toLowerCase()
    const xeroDataUsed: string[] = []
    const xeroContext: string[] = []

    // Map category to relevant Xero endpoints
    const fetchMap: Record<string, Array<{ endpoint: string, label: string, query?: Record<string, string> }>> = {
      profitability: [
        { endpoint: '/api/xero/reports/pnl', label: 'Profit & Loss' },
        { endpoint: '/api/xero/expenses', label: 'Expenses' },
      ],
      'cash flow': [
        { endpoint: '/api/xero/bank-monitoring', label: 'Bank Monitoring' },
        { endpoint: '/api/xero/reports/cash-flow-forecast', label: 'Cash Flow Forecast' },
      ],
      cashflow: [
        { endpoint: '/api/xero/bank-monitoring', label: 'Bank Monitoring' },
        { endpoint: '/api/xero/reports/cash-flow-forecast', label: 'Cash Flow Forecast' },
      ],
      revenue: [
        { endpoint: '/api/xero/invoices', label: 'Invoices' },
        { endpoint: '/api/xero/reports/aging', label: 'Aging Receivables', query: { type: 'receivables' } },
      ],
      receivables: [
        { endpoint: '/api/xero/invoices', label: 'Invoices' },
        { endpoint: '/api/xero/reports/aging', label: 'Aging Receivables', query: { type: 'receivables' } },
      ],
      expenses: [
        { endpoint: '/api/xero/expenses', label: 'Expenses' },
        { endpoint: '/api/xero/reports/budget-variance', label: 'Budget Variance' },
      ],
      budget: [
        { endpoint: '/api/xero/reports/budget-variance', label: 'Budget Variance' },
        { endpoint: '/api/xero/expenses', label: 'Expenses' },
      ],
      strategy: [
        { endpoint: '/api/xero/reports/pnl', label: 'Profit & Loss' },
        { endpoint: '/api/xero/bank-monitoring', label: 'Bank Monitoring' },
      ],
    }

    // Default: fetch P&L + bank monitoring for broad context
    const endpointsToFetch = fetchMap[category] || [
      { endpoint: '/api/xero/reports/pnl', label: 'Profit & Loss' },
      { endpoint: '/api/xero/bank-monitoring', label: 'Bank Monitoring' },
    ]

    // Fetch Xero data in parallel
    const xeroResults = await Promise.allSettled(
      endpointsToFetch.map(ep =>
        $fetch<any>(ep.endpoint, { headers: event.headers, query: ep.query }).then(data => ({ label: ep.label, data }))
      )
    )

    for (const result of xeroResults) {
      if (result.status === 'fulfilled' && result.value.data) {
        const { label, data } = result.value
        xeroDataUsed.push(label)
        xeroContext.push(formatXeroData(label, data))
      }
    }

    // ── 2. Query Vectorize for related accounting knowledge ──
    let vectorizeContextUsed = false
    const vectorContext: string[] = []

    try {
      const searchQuery = `${body.title} ${body.description} ${body.category || ''} Australian business accounting`
      const matches = await searchSimilar(event, searchQuery, 5)

      if (matches.length > 0) {
        vectorizeContextUsed = true
        for (const match of matches) {
          if (match.score > 0.5) {
            vectorContext.push(`[Knowledge: ${match.metadata.title || match.id}] ${match.metadata.type || 'general'} — relevance: ${(match.score * 100).toFixed(0)}%`)
          }
        }
      }
    } catch {
      // Vectorize not available — continue without it
    }

    // ── 3. Web research via Perplexity for real-time business intelligence ──
    const webResearch: string[] = []
    let webResearchUsed = false
    try {
      const perplexityResult = await fetchPerplexityInsight(body, category)
      if (perplexityResult) {
        webResearch.push(perplexityResult)
        webResearchUsed = true
        xeroDataUsed.push('Web Research')
      }
    } catch {
      // Perplexity not available — continue without web research
    }

    // ── 4. Build the comprehensive prompt ──
    const prompt = buildActionPlanPrompt(body, xeroContext, vectorContext, webResearch)

    // ── 5. Generate action plan via Groq 70B ──
    try {
      const raw = await generateGroqInsight(prompt, {
        model: GROQ_MODELS.LLAMA_70B,
        temperature: 0.2,
        maxTokens: 3000,
        systemPrompt: SYSTEM_PROMPT,
      })

      // Parse JSON response
      let parsed: any
      try {
        parsed = JSON.parse(raw)
      } catch {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
          parsed = JSON.parse(match[0])
        } else {
          throw new Error('Failed to parse AI response')
        }
      }

      const industryInsights = (parsed.industryInsights || parsed.industry_insights || []).map((ins: any) => ({
        category: ins.category || 'tip',
        title: ins.title || '',
        detail: ins.detail || ins.description || '',
        sourceName: ins.sourceName || ins.source_name || undefined,
        sourceUrl: ins.sourceUrl || ins.source_url || undefined,
      })).filter((ins: any) => ins.title && ins.detail)

      return {
        summary: parsed.summary || 'Action plan generated.',
        actionSteps: (parsed.actionSteps || parsed.action_steps || []).map((s: any, i: number) => ({
          step: i + 1,
          action: s.action || s.title || `Step ${i + 1}`,
          detail: s.detail || s.description || '',
          priority: s.priority || 'short-term',
          owner: s.owner || null,
        })),
        industryInsights: industryInsights.length > 0 ? industryInsights : undefined,
        regulatoryContext: parsed.regulatoryContext || parsed.regulatory_context || '',
        references: (parsed.references || []).map((r: any) => ({
          body: r.body || r.name || 'Reference',
          relevance: r.relevance || r.description || '',
          url: r.url || null,
        })),
        timeline: parsed.timeline || '',
        riskAssessment: parsed.riskAssessment || parsed.risk_assessment || '',
        estimatedImpact: parsed.estimatedImpact || parsed.estimated_impact || '',
        xeroDataUsed,
        vectorizeContextUsed,
      } satisfies ActionPlanResponse
    } catch (err) {
      console.error('[action-plan] Groq generation failed, using rule-based fallback:', err)
      return buildFallbackPlan(body, xeroDataUsed, vectorizeContextUsed)
    }
  })
})

// ── Helpers ──

const SYSTEM_PROMPT = `You are a senior financial adviser, accountant, and business strategist specialising in Australian advertising and digital marketing agencies. You provide detailed, actionable financial action plans enriched with industry-specific business intelligence.

Key context:
- Jurisdiction: Australia (ATO, ASIC, Fair Work Australia)
- Business type: Advertising / digital marketing agency (services business, logistics adjacent)
- Currency: AUD
- Tax: GST (10%), company tax rate 25% (base rate entity) or 30%
- Reporting: BAS (quarterly or monthly), annual tax return, PAYG withholding
- Superannuation: 11.5% (2024-25 rate)
- Key regulations: Corporations Act, Fair Work Act, Privacy Act, Australian Consumer Law

Industry intelligence sources you should reference:
- Advertising Council Australia (formerly AANA) — industry standards, diversity & inclusion benchmarks
- MFA (Media Federation of Australia) — media agency benchmarks, pitch practices, media transparency
- IMAA (Independent Media Agencies of Australia) — independent agency benchmarks, rate cards
- IAB Australia — digital ad spend reports, programmatic benchmarks, attention metrics
- Mumbrella / AdNews — industry news and agency trends
- WARC / Effie Awards Australia — effectiveness benchmarks, campaign ROI data
- IPA Agency Health & Effectiveness reports — profitability benchmarks, staff utilisation rates
- SBA (Small Business Australia) / ASBFEO — small business advocacy and compliance guidance
- CMA (Communications Council renamed to Advertising Council Australia) — agency business practices
- ACCI (Australian Chamber of Commerce & Industry) — business conditions surveys

Typical Australian agency benchmarks:
- Net profit margin: 10-20% (healthy), <8% needs attention
- Staff costs: 50-65% of revenue (largest cost)
- Billable utilisation: 70-80% target
- Revenue per FTE: $150K-$250K (varies by service mix)
- Client retention: >80% annually is healthy
- Average debtor days: 35-50 days
- Overhead ratio: 20-30% of revenue
- New business win rate: 25-40% of pitched opportunities

Always respond with valid JSON only — no markdown, no code fences.`

function buildActionPlanPrompt(
  item: ActionPlanRequest,
  xeroContext: string[],
  vectorContext: string[],
  webResearch: string[] = []
): string {
  const parts: string[] = []

  parts.push(`FINANCIAL ISSUE:\nTitle: ${item.title}\nDescription: ${item.description}`)

  if (item.severity) parts.push(`Severity: ${item.severity}`)
  if (item.category) parts.push(`Category: ${item.category}`)
  if (item.metric) parts.push(`Key Metric: ${item.metric.label} = ${item.metric.value}`)
  if (item.recommendation) parts.push(`Current Recommendation: ${item.recommendation}`)
  if (item.actionSteps?.length) parts.push(`Existing Steps: ${item.actionSteps.join('; ')}`)
  if (item.tags?.length) parts.push(`Tags: ${item.tags.join(', ')}`)

  if (xeroContext.length > 0) {
    parts.push(`\nLIVE FINANCIAL DATA (from Xero):\n${xeroContext.join('\n\n')}`)
  }

  if (vectorContext.length > 0) {
    parts.push(`\nRELATED KNOWLEDGE BASE ENTRIES:\n${vectorContext.join('\n')}`)
  }

  if (webResearch.length > 0) {
    parts.push(`\nWEB RESEARCH (current Australian agency industry intelligence):\n${webResearch.join('\n\n')}`)
  }

  parts.push(`
Generate a detailed action plan in JSON format:
{
  "summary": "<2-3 sentence overview of the situation and recommended approach>",
  "actionSteps": [
    {
      "action": "<concise action title>",
      "detail": "<specific instructions on what to do, including Australian-specific guidance>",
      "priority": "immediate|short-term|medium-term",
      "owner": "<suggested role: Finance Manager, Account Manager, Director, Bookkeeper>"
    }
  ],
  "industryInsights": [
    {
      "category": "benchmark|best-practice|tip",
      "title": "<short insight title>",
      "detail": "<detailed explanation with specific numbers/percentages where relevant>",
      "sourceName": "<source organisation: IAB Australia, MFA, IMAA, IPA, Advertising Council Australia, WARC, etc.>",
      "sourceUrl": "<URL to the relevant resource if known, otherwise omit>"
    }
  ],
  "regulatoryContext": "<relevant Australian regulatory considerations — ATO obligations, BAS implications, GST treatment, Fair Work requirements, ASIC compliance, etc.>",
  "references": [
    {
      "body": "<regulatory body: ATO, ASIC, Fair Work, ACCC, etc.>",
      "relevance": "<how this body's rules apply to this issue>",
      "url": "<official guidance URL if known>"
    }
  ],
  "timeline": "<recommended timeline for implementation, e.g. 'Complete within 2 weeks, review monthly'>",
  "riskAssessment": "<what happens if this is not addressed — financial, compliance, and operational risks>",
  "estimatedImpact": "<quantified benefit where possible, e.g. 'Potential $X,000 improvement in cash position'>"
}

Rules:
- Provide 4-8 actionable steps, ordered by priority
- Provide 2-4 industry insights that are relevant to this specific issue
- All amounts in AUD
- Reference specific Australian regulations where applicable
- Be specific to a digital marketing/advertising agency context (staff costs, contractor payments, media spend, client retainers)
- Include ATO references for tax-related issues (PAYG, BAS, GST, FBT)
- For cash flow issues, reference typical agency billing cycles (30-day terms, retainer vs project)
- For expense issues, consider typical agency cost structure (salaries 50-60%, tools/SaaS 10-15%, contractors 15-20%)
- For industry insights, reference specific Australian industry bodies (MFA, IMAA, IAB Australia, Advertising Council Australia, IPA)
- Include benchmarks from agency effectiveness reports where relevant (profitability, utilisation, debtor days, retention)
- Reference WARC/Effie data for campaign effectiveness insights where relevant`)

  return parts.join('\n')
}

function formatXeroData(label: string, data: any): string {
  switch (label) {
    case 'Profit & Loss': {
      const parts = [`P&L Summary:`]
      if (typeof data.revenueTotal === 'number') parts.push(`  Revenue: $${data.revenueTotal.toLocaleString()}`)
      if (typeof data.expensesTotal === 'number') parts.push(`  Expenses: $${data.expensesTotal.toLocaleString()}`)
      if (typeof data.netProfit === 'number') parts.push(`  Net Profit: $${data.netProfit.toLocaleString()}`)
      if (typeof data.profitMargin === 'number') parts.push(`  Margin: ${(data.profitMargin * 100).toFixed(1)}%`)
      return parts.join('\n')
    }
    case 'Bank Monitoring': {
      const p = data.portfolio || data
      const parts = ['Bank Summary:']
      if (typeof p.totalBalance === 'number') parts.push(`  Total Balance: $${p.totalBalance.toLocaleString()}`)
      if (typeof p.totalInflows === 'number') parts.push(`  Inflows: $${p.totalInflows.toLocaleString()}`)
      if (typeof p.totalOutflows === 'number') parts.push(`  Outflows: $${p.totalOutflows.toLocaleString()}`)
      if (typeof p.netCashFlow === 'number') parts.push(`  Net Cash Flow: $${p.netCashFlow.toLocaleString()}`)
      return parts.join('\n')
    }
    case 'Cash Flow Forecast': {
      const parts = ['Cash Forecast:']
      if (typeof data.projectedEndBalance === 'number') parts.push(`  Projected End Balance: $${data.projectedEndBalance.toLocaleString()}`)
      if (data.shortfallDates?.length > 0) parts.push(`  Shortfall Dates: ${data.shortfallDates.join(', ')}`)
      return parts.join('\n')
    }
    case 'Invoices': {
      const s = data.summary || data
      const parts = ['Invoice Summary:']
      if (typeof s.outstandingTotal === 'number') parts.push(`  Outstanding: $${s.outstandingTotal.toLocaleString()} (${s.outstandingCount || 0} invoices)`)
      if (typeof s.overdueTotal === 'number') parts.push(`  Overdue: $${s.overdueTotal.toLocaleString()} (${s.overdueCount || 0} invoices)`)
      if (typeof s.avgDaysToPay === 'number') parts.push(`  Avg Days to Pay: ${Math.round(s.avgDaysToPay)}`)
      return parts.join('\n')
    }
    case 'Aging Receivables': {
      const parts = ['Aging Receivables:']
      if (typeof data.totalOutstanding === 'number') parts.push(`  Total Outstanding: $${data.totalOutstanding.toLocaleString()}`)
      if (typeof data.criticalAmount === 'number') parts.push(`  Critical (90+ days): $${data.criticalAmount.toLocaleString()}`)
      if (data.agingSummary?.length) {
        for (const b of data.agingSummary.slice(0, 5)) {
          parts.push(`  ${b.bucket}: $${(b.amount || 0).toLocaleString()}`)
        }
      }
      return parts.join('\n')
    }
    case 'Expenses': {
      const cats = (data.categories || []).slice(0, 5)
      const total = cats.reduce((s: number, c: any) => s + (c.amount || 0), 0)
      const parts = [`Expenses (total $${total.toLocaleString()}):`]
      for (const c of cats) {
        parts.push(`  ${c.name}: $${(c.amount || 0).toLocaleString()}`)
      }
      const mom = data.monthOverMonth
      if (mom && typeof mom.change === 'number') {
        parts.push(`  MoM Change: ${mom.change > 0 ? '+' : ''}${mom.change.toFixed(1)}%`)
      }
      return parts.join('\n')
    }
    case 'Budget Variance': {
      const s = data.summary || {}
      const parts = ['Budget Variance:']
      if (typeof s.totalActual === 'number') parts.push(`  Actual: $${s.totalActual.toLocaleString()}`)
      if (typeof s.totalBudget === 'number') parts.push(`  Budget: $${s.totalBudget.toLocaleString()}`)
      if (typeof s.totalVariancePercent === 'number') parts.push(`  Variance: ${s.totalVariancePercent.toFixed(0)}%`)
      if (typeof s.overBudgetCount === 'number') parts.push(`  Categories Over Budget: ${s.overBudgetCount}`)
      return parts.join('\n')
    }
    default:
      return `${label}: ${JSON.stringify(data).slice(0, 500)}`
  }
}

function buildFallbackPlan(item: ActionPlanRequest, xeroDataUsed: string[], vectorizeContextUsed: boolean): ActionPlanResponse {
  const isHighSeverity = item.severity === 'critical' || item.severity === 'warning'
  const category = (item.category || '').toLowerCase()

  const steps: ActionStep[] = []
  let regulatoryContext = ''
  const references: RegulatoryReference[] = []
  const industryInsights: IndustryInsight[] = []

  // Common first step
  steps.push({
    step: 1,
    action: 'Review the current data',
    detail: `Log into Xero and review the source data related to "${item.title}". Cross-reference with the dashboard figures to confirm accuracy.`,
    priority: 'immediate',
    owner: 'Finance Manager',
  })

  // Category-specific steps + industry insights
  if (category.includes('cash') || category.includes('bank')) {
    steps.push(
      { step: 2, action: 'Review accounts receivable', detail: 'Identify overdue invoices and prioritise collection calls. Consider offering early payment discounts (2/10 net 30).', priority: 'immediate', owner: 'Account Manager' },
      { step: 3, action: 'Assess upcoming obligations', detail: 'Map out upcoming BAS payment, superannuation deadlines, and payroll dates. Ensure sufficient cash reserves.', priority: 'short-term', owner: 'Finance Manager' },
      { step: 4, action: 'Negotiate payment terms', detail: 'Contact major suppliers to negotiate extended payment terms (45-60 days) to improve cash flow timing.', priority: 'short-term', owner: 'Director' },
    )
    regulatoryContext = 'ATO requires timely BAS lodgement and payment (quarterly or monthly). Late payment incurs GIC (General Interest Charge). Superannuation must be paid by the 28th of the month following the quarter. Director penalty notices may apply for unpaid PAYG and super.'
    references.push(
      { body: 'ATO', relevance: 'BAS lodgement and payment obligations', url: 'https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas' },
      { body: 'ATO', relevance: 'Superannuation guarantee obligations', url: 'https://www.ato.gov.au/businesses-and-organisations/super-for-employers' },
    )
    industryInsights.push(
      { category: 'benchmark', title: 'Agency debtor days benchmark', detail: 'Australian advertising agencies typically see 35-50 debtor days. Top-performing agencies maintain under 35 days through upfront deposits and tighter payment terms. MFA members report average 42-day collection cycles.', sourceName: 'MFA / IPA Benchmarks' },
      { category: 'best-practice', title: 'Retainer billing for cash stability', detail: 'Leading agencies shift 60-70% of revenue to retainer-based models for predictable cash flow. Project-based work should require 30-50% upfront deposits. Consider milestone billing for large campaigns.', sourceName: 'IMAA Agency Best Practices' },
    )
  } else if (category.includes('profit') || category.includes('margin')) {
    steps.push(
      { step: 2, action: 'Analyse service line profitability', detail: 'Break down revenue and costs by service line (SEO, PPC, social, creative). Identify underperforming lines.', priority: 'immediate', owner: 'Director' },
      { step: 3, action: 'Review pricing structure', detail: 'Compare hourly rates and retainer pricing against industry benchmarks. Consider value-based pricing for high-impact services.', priority: 'short-term', owner: 'Director' },
      { step: 4, action: 'Optimise staff utilisation', detail: 'Target 75-80% billable utilisation. Review time tracking data for non-billable activities that can be reduced.', priority: 'medium-term', owner: 'Account Manager' },
    )
    regulatoryContext = 'Company tax rate is 25% for base rate entities (aggregated turnover < $50M, passive income test). Ensure correct classification for tax planning. Consider R&D tax incentive (43.5% offset) for qualifying activities.'
    references.push(
      { body: 'ATO', relevance: 'Company tax rate and base rate entity eligibility', url: 'https://www.ato.gov.au/businesses-and-organisations/income-deductions-and-concessions/company-tax-rate' },
    )
    industryInsights.push(
      { category: 'benchmark', title: 'Agency profit margin targets', detail: 'Healthy Australian agencies target 10-20% net profit margin. IPA Agency Census data shows median agency net margin at 11-15%. Agencies below 8% should urgently review pricing and overhead structures.', sourceName: 'IPA Agency Health Report' },
      { category: 'benchmark', title: 'Revenue per FTE', detail: 'Australian agency revenue per full-time equivalent ranges from $150K-$250K depending on service mix. Digital-first agencies trend higher ($200K+). Below $130K indicates overstaffing or underpricing.', sourceName: 'IMAA Agency Benchmarks' },
      { category: 'best-practice', title: 'Value-based pricing shift', detail: 'High-performing agencies are moving from hourly billing to value-based or output-based pricing. WARC effectiveness data shows agencies using value pricing achieve 15-25% higher margins than those billing hourly.', sourceName: 'WARC / Advertising Council Australia' },
    )
  } else if (category.includes('expense') || category.includes('budget')) {
    steps.push(
      { step: 2, action: 'Categorise and audit expenses', detail: 'Review all expenses for correct GST classification (GST-free, input-taxed, BAS excluded). Ensure all claims are substantiated with receipts.', priority: 'immediate', owner: 'Bookkeeper' },
      { step: 3, action: 'Review subscription stack', detail: 'Audit all SaaS tools and subscriptions. Cancel underutilised tools and consolidate where possible.', priority: 'short-term', owner: 'Finance Manager' },
      { step: 4, action: 'Implement spending controls', detail: 'Set category-level budgets in the dashboard. Configure alerts at 80% threshold to prevent overruns.', priority: 'short-term', owner: 'Finance Manager' },
    )
    regulatoryContext = 'GST credits can only be claimed on business expenses with valid tax invoices (ABN, GST amount stated). FBT may apply to staff entertainment, car parking, and devices. Ensure correct treatment on BAS.'
    references.push(
      { body: 'ATO', relevance: 'GST credits and tax invoice requirements', url: 'https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst' },
      { body: 'ATO', relevance: 'Fringe Benefits Tax obligations', url: 'https://www.ato.gov.au/businesses-and-organisations/hiring-and-paying-your-workers/fringe-benefits-tax' },
    )
    industryInsights.push(
      { category: 'benchmark', title: 'Agency cost structure benchmarks', detail: 'Typical Australian agency cost split: staff 50-65%, overheads 20-30%, tools/SaaS 10-15%, contractors 5-15%. If staff costs exceed 65% of revenue, review headcount against billable utilisation rates.', sourceName: 'IPA / IMAA Agency Census' },
      { category: 'tip', title: 'SaaS tool consolidation opportunity', detail: 'Average mid-size agency spends $2K-5K/month on overlapping SaaS tools. Audit for overlap between project management, time tracking, reporting, and analytics platforms. Consolidation typically saves 20-30%.', sourceName: 'IMAA Member Insights' },
    )
  } else if (category.includes('receiv') || category.includes('invoice') || category.includes('revenue')) {
    steps.push(
      { step: 2, action: 'Contact overdue clients', detail: 'Prioritise collection on 60+ day invoices. Send formal payment demand letters for 90+ day invoices.', priority: 'immediate', owner: 'Account Manager' },
      { step: 3, action: 'Review credit terms', detail: 'Consider tightening payment terms for high-risk clients (7 or 14 days). Implement upfront deposits for new clients.', priority: 'short-term', owner: 'Director' },
      { step: 4, action: 'Automate payment reminders', detail: 'Set up automated email reminders at 7, 14, and 30 days past due. Include direct payment links.', priority: 'short-term', owner: 'Finance Manager' },
    )
    regulatoryContext = 'Bad debts can be written off for GST purposes once proven unrecoverable. Debt collection must comply with Australian Consumer Law and ASIC debt collection guidelines. Consider Personal Property Securities Register (PPSR) for large outstanding amounts.'
    references.push(
      { body: 'ATO', relevance: 'Bad debt GST adjustments', url: 'https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/adjustments/bad-debts' },
      { body: 'ACCC', relevance: 'Debt collection practices under Australian Consumer Law' },
    )
    industryInsights.push(
      { category: 'benchmark', title: 'Client retention drives revenue stability', detail: 'Australian agencies with >80% annual client retention rate show 2-3x higher profitability than those below 70%. Acquiring a new client costs 5-7x more than retaining existing ones. Focus collection efforts on preserving the relationship.', sourceName: 'Advertising Council Australia' },
      { category: 'best-practice', title: 'Structured payment terms by client tier', detail: 'Top agencies tier their payment terms: enterprise clients (30-45 days), mid-market (14-30 days), SMB (7-14 days with deposit). MFA pitch guidelines recommend discussing payment terms as part of the agency-client agreement.', sourceName: 'MFA Pitch Guidelines' },
    )
  } else {
    steps.push(
      { step: 2, action: 'Quantify the impact', detail: `Determine the financial impact of "${item.title}" on the business. Calculate the cost if no action is taken.`, priority: 'immediate', owner: 'Finance Manager' },
      { step: 3, action: 'Develop a remediation plan', detail: 'Based on the analysis, create a targeted plan with specific actions, deadlines, and responsible owners.', priority: 'short-term', owner: 'Director' },
      { step: 4, action: 'Monitor and review', detail: 'Set up a fortnightly review cadence to track progress. Adjust the plan based on results.', priority: 'medium-term', owner: 'Finance Manager' },
    )
    regulatoryContext = 'As a company director, you have obligations under the Corporations Act 2001 to ensure the company is solvent and can pay debts as they fall due. Review ASIC guidance on director duties.'
    references.push(
      { body: 'ASIC', relevance: 'Director duties under the Corporations Act 2001', url: 'https://asic.gov.au/for-business/running-a-company/company-officeholder-duties/' },
    )
    industryInsights.push(
      { category: 'benchmark', title: 'Agency health check indicators', detail: 'Key financial health metrics for Australian agencies: net margin >10%, debtor days <45, staff costs <65% of revenue, utilisation >75%. Track these monthly against industry benchmarks from IPA and IMAA surveys.', sourceName: 'IPA Agency Health Report' },
      { category: 'tip', title: 'Leverage industry associations', detail: 'Join IMAA (independent agencies) or engage with Advertising Council Australia for access to benchmarking data, legal templates, and peer networking. Membership costs are tax-deductible and provide valuable commercial intelligence.', sourceName: 'IMAA / Advertising Council Australia' },
    )
  }

  // Final review step
  steps.push({
    step: steps.length + 1,
    action: 'Schedule follow-up review',
    detail: 'Book a review meeting in 2 weeks to assess progress. Update the dashboard anomaly status once resolved.',
    priority: 'short-term',
    owner: 'Director',
  })

  return {
    summary: `This ${item.severity || 'flagged'} issue requires ${isHighSeverity ? 'immediate' : 'timely'} attention. "${item.title}" — ${item.description} Review the action steps below and assign to the appropriate team members.`,
    actionSteps: steps,
    industryInsights,
    regulatoryContext,
    references,
    timeline: isHighSeverity ? 'Begin immediately. Complete initial actions within 1 week, full remediation within 1 month.' : 'Address within 2 weeks. Review progress monthly.',
    riskAssessment: isHighSeverity ? 'High risk if unaddressed. Could impact cash flow, profitability, or compliance obligations.' : 'Moderate risk. Addressing proactively will prevent escalation.',
    estimatedImpact: item.metric ? `Relates to ${item.metric.label}: ${item.metric.value}. Addressing this could improve this metric significantly.` : 'Impact will be quantified once the initial review is complete.',
    xeroDataUsed,
    vectorizeContextUsed,
  }
}

/**
 * Fetch real-time business intelligence from Perplexity AI (routed through CF AI Gateway).
 * Returns a concise research summary relevant to the financial issue.
 */
async function fetchPerplexityInsight(item: ActionPlanRequest, category: string): Promise<string | null> {
  const config = useRuntimeConfig()
  const apiKey = config.perplexityApiKey || process.env.PERPLEXITY_API_KEY
  if (!apiKey) return null

  // Route through CF AI Gateway when configured, otherwise direct to Perplexity
  const aiGatewayUrl = config.aiGatewayUrl || process.env.AI_GATEWAY_URL
  const baseUrl = aiGatewayUrl
    ? `${aiGatewayUrl.replace(/\/+$/, '')}/perplexity-ai`
    : 'https://api.perplexity.ai'

  // Build a focused search query for the Australian advertising agency context
  const searchTopics: Record<string, string> = {
    profitability: 'Australian advertising agency profit margins benchmarks best practices',
    'cash flow': 'Australian advertising agency cash flow management billing retainers',
    cashflow: 'Australian advertising agency cash flow management billing retainers',
    revenue: 'Australian advertising agency revenue growth client retention pricing strategies',
    receivables: 'Australian business accounts receivable collection debt management agency',
    expenses: 'Australian advertising agency cost management overhead reduction SaaS tools',
    budget: 'Australian advertising agency budget planning financial forecasting',
    strategy: 'Australian advertising agency business strategy growth trends 2024 2025',
  }
  const searchQuery = searchTopics[category] || `Australian advertising agency ${item.title} financial best practices`

  try {
    const response = await $fetch<any>(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a business intelligence researcher for an Australian advertising agency. Provide concise, factual findings with specific numbers and sources. Focus on Australian industry data from MFA, IMAA, IAB Australia, Advertising Council Australia, WARC, and IPA. Keep responses under 500 words.'
          },
          {
            role: 'user',
            content: `Research the following for an Australian advertising agency:\n\nIssue: ${item.title}\nContext: ${item.description}\n\nSearch focus: ${searchQuery}\n\nProvide:\n1. Current Australian industry benchmarks relevant to this issue\n2. Best practices from leading Australian agencies\n3. Any recent regulatory changes or industry trends that apply\n4. Specific data points with sources where available`
          }
        ],
        max_tokens: 800,
        temperature: 0.1,
      },
      signal: AbortSignal.timeout(10000), // 10s timeout — don't block the whole plan generation
    })

    const content = response?.choices?.[0]?.message?.content
    if (content && content.length > 50) {
      return content
    }
    return null
  } catch (err) {
    console.warn('[action-plan] Perplexity research failed (non-critical):', (err as Error).message)
    return null
  }
}
