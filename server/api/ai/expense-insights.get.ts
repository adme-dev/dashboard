import { createError } from 'h3'
import { getActiveTokenForSession } from '~~/server/utils/tokenStore'
import { getSelectedTenant } from '~~/server/utils/session'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { cachedFetch } from '~~/server/utils/kv'

export default defineEventHandler(async (event) => {
  const tokenSet = await getActiveTokenForSession(event)
  const tenantId = getSelectedTenant(event)

  if (!tokenSet?.access_token || !tenantId) {
    throw createError({ statusCode: 401, statusMessage: 'Xero authentication required' })
  }

  // Fetch real expense data from the expenses endpoint (same period as the UI)
  const now = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Use internal fetch to get the enriched expense data (already cached by the expenses endpoint)
  let expenseData: any
  try {
    expenseData = await $fetch('/api/xero/expenses', {
      headers: event.headers,
      query: { from, to },
    })
  } catch {
    throw createError({ statusCode: 502, statusMessage: 'Failed to fetch expense data' })
  }

  if (!expenseData?.categories?.length) {
    return {
      success: true,
      data: {
        insights: { insights: ['No expense data available for this period.'], trends: [], alerts: [], summary: 'No expense data found for the current month.' },
        anomalies: { anomalies: [], summary: 'No data to analyze.' },
        optimization: { recommendations: [], summary: 'No data to analyze.' },
        generatedAt: new Date().toISOString(),
        model: 'N/A',
      },
    }
  }

  // Build a data summary for the prompt
  const categories = (expenseData.categories || []).slice(0, 15)
  const vendors = (expenseData.vendors || []).slice(0, 15)
  const totalSpend = categories.reduce((s: number, c: any) => s + (c.amount || 0), 0)
  const mom = expenseData.monthOverMonth
  const fv = expenseData.fixedVsVariable
  const tax = expenseData.taxSummary
  const subs = expenseData.subscriptions
  const txCount = (expenseData.transactions || []).length

  const dataSummary = [
    `Period: ${from} to ${to}`,
    `Total spend: $${totalSpend.toFixed(0)} AUD across ${categories.length} categories and ${(expenseData.vendors || []).length} vendors`,
    `Transaction count: ${txCount}`,
    '',
    'Top categories:',
    ...categories.map((c: any) => `  - ${c.name}: $${(c.amount || 0).toFixed(0)}`),
    '',
    'Top vendors:',
    ...vendors.map((v: any) => `  - ${v.name}: $${(v.amount || 0).toFixed(0)}`),
  ]

  if (mom) {
    dataSummary.push('', `Month-over-month: ${mom.change >= 0 ? '+' : ''}${mom.change.toFixed(1)}% ($${Math.abs(mom.changeAmount || 0).toFixed(0)} ${mom.changeAmount >= 0 ? 'increase' : 'decrease'})`)
    dataSummary.push(`Previous period total: $${(mom.previous?.total || 0).toFixed(0)}`)
  }

  if (fv) {
    dataSummary.push('', `Fixed costs: $${(fv.fixed?.total || 0).toFixed(0)}`)
    dataSummary.push(`Variable costs: $${(fv.variable?.total || 0).toFixed(0)}`)
  }

  if (tax) {
    dataSummary.push('', `GST total: $${(tax.totalTax || 0).toFixed(0)}, Net: $${(tax.totalNet || 0).toFixed(0)}`)
  }

  if (subs?.items?.length) {
    dataSummary.push('', `Recurring subscriptions: ${subs.items.length} vendors totaling $${(subs.total || 0).toFixed(0)}/month`)
    dataSummary.push(...subs.items.slice(0, 5).map((s: any) => `  - ${s.vendor}: $${(s.amount || 0).toFixed(0)} (${s.frequency})`))
  }

  const prompt = `Analyze this agency's expense data and provide financial insights in JSON format.

DATA:
${dataSummary.join('\n')}

Respond ONLY with valid JSON in this exact structure (no markdown, no code fences):
{
  "insights": {
    "insights": ["<3-5 specific data-driven observations about spending patterns>"],
    "trends": ["<2-3 spending trends based on the numbers>"],
    "alerts": ["<1-3 items that need attention — empty array if none>"],
    "summary": "<2-3 sentence executive summary>"
  },
  "anomalies": {
    "anomalies": [
      {
        "type": "<category name>",
        "severity": "low|medium|high|critical",
        "description": "<what was detected>",
        "amount": <number>,
        "suggestion": "<actionable recommendation>"
      }
    ],
    "summary": "<1-2 sentence anomaly overview>"
  },
  "optimization": {
    "recommendations": [
      {
        "category": "<area>",
        "type": "cost_reduction|process_improvement|policy_change|vendor_negotiation",
        "impact": "low|medium|high",
        "savings_potential": <number>,
        "description": "<what to do>",
        "action_steps": ["<step 1>", "<step 2>", "<step 3>"]
      }
    ],
    "summary": "<1-2 sentence optimization overview>"
  }
}

Rules:
- All amounts in AUD
- Be specific — reference actual category names, vendor names, and dollar amounts from the data
- savings_potential should be realistic estimates based on the actual amounts
- Flag anything unusual: large MoM swings, single-vendor concentration, high fixed cost ratio
- If subscriptions are a significant portion of spend, recommend a subscription audit`

  const systemPrompt = 'You are a senior financial analyst for an Australian digital marketing agency. You analyze expense data and provide actionable, data-driven insights. Always respond with valid JSON only — no explanations, no markdown.'

  // Try Groq, fall back to static summary
  try {
    const cacheKey = `ai:expense-insights:${tenantId}:${from}`
    const result = await cachedFetch(event, cacheKey, 3600, async () => {
      const raw = await generateGroqInsight(prompt, {
        model: GROQ_MODELS.LLAMA_70B,
        temperature: 0.2,
        maxTokens: 2000,
        systemPrompt,
      })

      // Parse JSON — handle potential markdown fences
      let parsed: any
      try {
        parsed = JSON.parse(raw)
      } catch {
        const match = raw.match(/\{[\s\S]*\}/)
        if (match) {
          parsed = JSON.parse(match[0])
        } else {
          throw new Error('Failed to parse AI response as JSON')
        }
      }

      return {
        ...parsed,
        period: {
          current: { start: from, end: to, total: totalSpend, transactionCount: txCount },
          previous: { start: mom?.previous?.from || null, end: mom?.previous?.to || null, total: mom?.previous?.total || 0, transactionCount: 0 },
          change: { amount: mom?.changeAmount || 0, percentage: mom?.change || 0 }
        },
        generatedAt: new Date().toISOString(),
        model: 'Groq Llama 3.3 70B',
      }
    })

    return { success: true, data: result }
  } catch (err) {
    console.error('Groq expense insights failed, using rule-based fallback:', err)

    // Rule-based fallback using real data
    const avgPerVendor = totalSpend / Math.max((expenseData.vendors || []).length, 1)
    const topCat = categories[0]
    const topCatPct = totalSpend > 0 ? ((topCat?.amount || 0) / totalSpend * 100) : 0
    const momChange = mom?.change || 0

    const insights: string[] = [
      `Total spending of $${totalSpend.toFixed(0)} across ${categories.length} categories and ${(expenseData.vendors || []).length} vendors.`,
    ]
    if (topCat) insights.push(`${topCat.name} is the largest expense category at $${topCat.amount.toFixed(0)} (${topCatPct.toFixed(1)}% of total).`)
    if (fv) insights.push(`Fixed costs are $${fv.fixed.total.toFixed(0)} (${totalSpend > 0 ? (fv.fixed.total / totalSpend * 100).toFixed(0) : 0}%) and variable costs are $${fv.variable.total.toFixed(0)}.`)

    const trends: string[] = []
    if (Math.abs(momChange) >= 2) {
      trends.push(`Spending ${momChange > 0 ? 'increased' : 'decreased'} ${Math.abs(momChange).toFixed(1)}% compared to the previous period.`)
    }

    const alerts: string[] = []
    if (momChange > 20) alerts.push(`Spending is up ${momChange.toFixed(0)}% month-over-month — investigate the increase.`)
    if (topCatPct > 40) alerts.push(`${topCat?.name} accounts for ${topCatPct.toFixed(0)}% of spending — high single-category concentration.`)

    const anomalies: any[] = []
    if (momChange > 15) {
      anomalies.push({
        type: 'Spending Spike',
        severity: momChange > 30 ? 'high' : 'medium',
        description: `Month-over-month spending increased ${momChange.toFixed(1)}%`,
        amount: Math.abs(mom?.changeAmount || 0),
        suggestion: 'Review the largest category and vendor changes to identify the driver.',
      })
    }
    if (topCatPct > 50) {
      anomalies.push({
        type: 'Category Concentration',
        severity: 'medium',
        description: `${topCat?.name} represents ${topCatPct.toFixed(0)}% of all expenses`,
        amount: topCat?.amount || 0,
        suggestion: 'Diversify spend or negotiate better terms for this category.',
      })
    }

    const recommendations: any[] = []
    if (subs?.items?.length > 5) {
      recommendations.push({
        category: 'Subscriptions',
        type: 'cost_reduction',
        impact: subs.total > totalSpend * 0.1 ? 'high' : 'medium',
        savings_potential: Math.round(subs.total * 0.15),
        description: `${subs.items.length} recurring vendors totaling $${subs.total.toFixed(0)}/month — audit for unused or redundant subscriptions.`,
        action_steps: ['List all active subscriptions', 'Identify unused or low-value tools', 'Cancel or downgrade underutilized services'],
      })
    }
    if (avgPerVendor > 5000) {
      recommendations.push({
        category: 'Vendor Consolidation',
        type: 'vendor_negotiation',
        impact: 'medium',
        savings_potential: Math.round(totalSpend * 0.05),
        description: 'High average vendor spend — negotiate volume discounts with top vendors.',
        action_steps: ['Rank vendors by total spend', 'Request proposals for annual agreements', 'Consolidate similar vendors where possible'],
      })
    }

    return {
      success: true,
      data: {
        insights: {
          insights,
          trends,
          alerts,
          summary: `Current month spending is $${totalSpend.toFixed(0)} across ${categories.length} categories.${Math.abs(momChange) >= 2 ? ` Spending ${momChange > 0 ? 'increased' : 'decreased'} ${Math.abs(momChange).toFixed(1)}% vs last period.` : ''} ${subs?.items?.length ? `${subs.items.length} recurring subscriptions total $${subs.total.toFixed(0)}/month.` : ''}`,
        },
        anomalies: { anomalies, summary: anomalies.length ? `${anomalies.length} item(s) flagged for review.` : 'No significant anomalies detected.' },
        optimization: { recommendations, summary: recommendations.length ? `${recommendations.length} optimization opportunity(s) identified.` : 'No immediate optimizations identified.' },
        period: {
          current: { start: from, end: to, total: totalSpend, transactionCount: txCount },
          previous: { start: mom?.previous?.from || null, end: mom?.previous?.to || null, total: mom?.previous?.total || 0, transactionCount: 0 },
          change: { amount: mom?.changeAmount || 0, percentage: mom?.change || 0 }
        },
        generatedAt: new Date().toISOString(),
        model: 'Rule-based (Groq unavailable)',
      },
    }
  }
})
