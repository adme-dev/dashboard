import { createError } from 'h3'
import Groq from 'groq-sdk'

// Lazy initialization to avoid startup errors
let groq: Groq | null = null

function getGroqClient() {
  if (!groq) {
    const apiKey = useRuntimeConfig().groqApiKey || process.env.GROQ_API_KEY
    if (!apiKey) {
      throw createError({ statusCode: 500, statusMessage: 'AI service not configured - GROQ_API_KEY missing' })
    }
    groq = new Groq({ apiKey })
  }
  return groq
}

interface CashFlowInsightsRequest {
  currentCash: number
  projectedEndBalance: number
  minProjectedBalance: number
  maxProjectedBalance: number
  burnRate: number
  runway: number
  shortfallCount: number
  outstandingReceivables: number
  overdueReceivables: number
  outstandingCount: number
  overdueCount: number
  forecastPeriod: number
  scenarios?: {
    best: { endBalance: number }
    likely: { endBalance: number }
    worst: { endBalance: number }
  }
}

export default eventHandler(async (event) => {
  const body = await readBody<CashFlowInsightsRequest>(event)

  try {
    const groqClient = getGroqClient()
    const prompt = `
You are a senior financial advisor analyzing a business's cash flow. Based on the following data, provide actionable insights and recommendations:

CURRENT FINANCIAL POSITION:
- Current Cash: $${body.currentCash.toLocaleString()}
- ${body.forecastPeriod}-Day Projection: $${body.projectedEndBalance.toLocaleString()}
- Minimum Projected Balance: $${body.minProjectedBalance.toLocaleString()}
- Maximum Projected Balance: $${body.maxProjectedBalance.toLocaleString()}
- Daily Burn Rate: $${body.burnRate.toLocaleString()}
- Cash Runway: ${body.runway} days
- Cash Shortfall Periods: ${body.shortfallCount}

RECEIVABLES STATUS:
- Outstanding Receivables: $${body.outstandingReceivables.toLocaleString()} (${body.outstandingCount} invoices)
- Overdue Receivables: $${body.overdueReceivables.toLocaleString()} (${body.overdueCount} invoices)

${body.scenarios ? `
SCENARIO ANALYSIS:
- Best Case (90 days): $${body.scenarios.best.endBalance.toLocaleString()}
- Most Likely (90 days): $${body.scenarios.likely.endBalance.toLocaleString()}
- Worst Case (90 days): $${body.scenarios.worst.endBalance.toLocaleString()}
` : ''}

Please provide:
1. Overall financial health assessment (1-2 sentences)
2. Top 3 priority actions to improve cash flow
3. Risk assessment and mitigation strategies
4. Opportunities for optimization

Format your response as a JSON object with the following structure:
{
  "healthAssessment": {
    "status": "healthy|concerning|critical",
    "summary": "Brief overall assessment",
    "score": 1-100
  },
  "priorityActions": [
    {
      "title": "Action title",
      "description": "Detailed description",
      "impact": "high|medium|low",
      "timeframe": "immediate|short-term|long-term",
      "category": "collections|expenses|funding|operations"
    }
  ],
  "risks": [
    {
      "risk": "Risk description",
      "probability": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "Mitigation strategy"
    }
  ],
  "opportunities": [
    {
      "opportunity": "Opportunity description",
      "benefit": "Expected benefit",
      "effort": "high|medium|low"
    }
  ]
}

Keep recommendations specific and actionable. Focus on the most impactful suggestions based on the data provided.
`

    const completion = await groqClient.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an expert financial advisor specializing in cash flow management. Provide clear, actionable insights based on financial data. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 2000
    })

    const responseContent = completion.choices[0]?.message?.content
    if (!responseContent) {
      throw createError({ statusCode: 500, statusMessage: 'No response from AI service' })
    }

    // Parse the JSON response
    let insights
    try {
      insights = JSON.parse(responseContent)
    } catch (parseError) {
      // If JSON parsing fails, extract JSON from the response
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0])
      } else {
        throw createError({ statusCode: 500, statusMessage: 'Invalid response format from AI service' })
      }
    }

    // Add metadata
    insights.metadata = {
      generatedAt: new Date().toISOString(),
      model: "llama-3.1-8b-instant",
      dataPoints: {
        currentCash: body.currentCash,
        projectedEndBalance: body.projectedEndBalance,
        runway: body.runway,
        shortfallCount: body.shortfallCount
      }
    }

    return insights

  } catch (error: any) {
    console.error('AI Insights Error:', error)
    
    // Fallback to rule-based insights if AI fails
    return {
      healthAssessment: {
        status: body.shortfallCount > 0 ? 'critical' : body.runway < 30 ? 'concerning' : 'healthy',
        summary: body.shortfallCount > 0 
          ? 'Critical cash flow issues detected requiring immediate attention.'
          : body.runway < 30 
            ? 'Cash flow concerns identified that need monitoring.'
            : 'Cash flow appears stable with room for optimization.',
        score: Math.max(10, Math.min(100, 100 - (body.shortfallCount * 20) - (Math.max(0, 60 - body.runway))))
      },
      priorityActions: [
        ...(body.overdueCount > 0 ? [{
          title: "Accelerate Overdue Collections",
          description: `Follow up on ${body.overdueCount} overdue invoices totaling $${body.overdueReceivables.toLocaleString()}`,
          impact: "high" as const,
          timeframe: "immediate" as const,
          category: "collections" as const
        }] : []),
        ...(body.burnRate > body.currentCash / 60 ? [{
          title: "Reduce Operating Expenses",
          description: "Current burn rate may exhaust cash within 60 days. Review and optimize expenses.",
          impact: "high" as const,
          timeframe: "immediate" as const,
          category: "expenses" as const
        }] : []),
        {
          title: "Improve Cash Flow Forecasting",
          description: "Implement weekly cash flow reviews and scenario planning to avoid surprises.",
          impact: "medium" as const,
          timeframe: "short-term" as const,
          category: "operations" as const
        }
      ],
      risks: [
        ...(body.shortfallCount > 0 ? [{
          risk: "Cash shortfall predicted in forecast period",
          probability: "high" as const,
          impact: "high" as const,
          mitigation: "Secure additional funding or accelerate collections immediately"
        }] : []),
        {
          risk: "Dependence on future receivables",
          probability: "medium" as const,
          impact: "medium" as const,
          mitigation: "Diversify revenue streams and improve collection processes"
        }
      ],
      opportunities: [
        {
          opportunity: "Optimize payment terms with suppliers",
          benefit: "Extended payment terms could improve cash flow timing",
          effort: "medium" as const
        },
        ...(body.outstandingReceivables > body.currentCash ? [{
          opportunity: "Invoice factoring or financing",
          benefit: "Convert receivables to immediate cash flow",
          effort: "low" as const
        }] : [])
      ],
      metadata: {
        generatedAt: new Date().toISOString(),
        model: "rule-based-fallback",
        note: "AI service unavailable, using rule-based analysis"
      }
    }
  }
})
