import { e as eventHandler, r as readBody, c as createError, u as useRuntimeConfig } from '../../../nitro/nitro.mjs';
import Groq from 'groq-sdk';
import 'xero-node';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import '@iconify/utils';
import 'consola';

let groq = null;
function getGroqClient() {
  if (!groq) {
    const apiKey = useRuntimeConfig().groqApiKey || process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw createError({ statusCode: 500, statusMessage: "AI service not configured - GROQ_API_KEY missing" });
    }
    groq = new Groq({ apiKey });
  }
  return groq;
}
const cashflowInsights_post = eventHandler(async (event) => {
  var _a, _b;
  const body = await readBody(event);
  try {
    const groqClient = getGroqClient();
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
` : ""}

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
`;
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
      max_tokens: 2e3
    });
    const responseContent = (_b = (_a = completion.choices[0]) == null ? void 0 : _a.message) == null ? void 0 : _b.content;
    if (!responseContent) {
      throw createError({ statusCode: 500, statusMessage: "No response from AI service" });
    }
    let insights;
    try {
      insights = JSON.parse(responseContent);
    } catch (parseError) {
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0]);
      } else {
        throw createError({ statusCode: 500, statusMessage: "Invalid response format from AI service" });
      }
    }
    insights.metadata = {
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      model: "llama-3.1-8b-instant",
      dataPoints: {
        currentCash: body.currentCash,
        projectedEndBalance: body.projectedEndBalance,
        runway: body.runway,
        shortfallCount: body.shortfallCount
      }
    };
    return insights;
  } catch (error) {
    console.error("AI Insights Error:", error);
    return {
      healthAssessment: {
        status: body.shortfallCount > 0 ? "critical" : body.runway < 30 ? "concerning" : "healthy",
        summary: body.shortfallCount > 0 ? "Critical cash flow issues detected requiring immediate attention." : body.runway < 30 ? "Cash flow concerns identified that need monitoring." : "Cash flow appears stable with room for optimization.",
        score: Math.max(10, Math.min(100, 100 - body.shortfallCount * 20 - Math.max(0, 60 - body.runway)))
      },
      priorityActions: [
        ...body.overdueCount > 0 ? [{
          title: "Accelerate Overdue Collections",
          description: `Follow up on ${body.overdueCount} overdue invoices totaling $${body.overdueReceivables.toLocaleString()}`,
          impact: "high",
          timeframe: "immediate",
          category: "collections"
        }] : [],
        ...body.burnRate > body.currentCash / 60 ? [{
          title: "Reduce Operating Expenses",
          description: "Current burn rate may exhaust cash within 60 days. Review and optimize expenses.",
          impact: "high",
          timeframe: "immediate",
          category: "expenses"
        }] : [],
        {
          title: "Improve Cash Flow Forecasting",
          description: "Implement weekly cash flow reviews and scenario planning to avoid surprises.",
          impact: "medium",
          timeframe: "short-term",
          category: "operations"
        }
      ],
      risks: [
        ...body.shortfallCount > 0 ? [{
          risk: "Cash shortfall predicted in forecast period",
          probability: "high",
          impact: "high",
          mitigation: "Secure additional funding or accelerate collections immediately"
        }] : [],
        {
          risk: "Dependence on future receivables",
          probability: "medium",
          impact: "medium",
          mitigation: "Diversify revenue streams and improve collection processes"
        }
      ],
      opportunities: [
        {
          opportunity: "Optimize payment terms with suppliers",
          benefit: "Extended payment terms could improve cash flow timing",
          effort: "medium"
        },
        ...body.outstandingReceivables > body.currentCash ? [{
          opportunity: "Invoice factoring or financing",
          benefit: "Convert receivables to immediate cash flow",
          effort: "low"
        }] : []
      ],
      metadata: {
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        model: "rule-based-fallback",
        note: "AI service unavailable, using rule-based analysis"
      }
    };
  }
});

export { cashflowInsights_post as default };
//# sourceMappingURL=cashflow-insights.post.mjs.map
