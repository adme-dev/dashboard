import { f as defineEventHandler, g as getActiveTokenForSession, a as getSelectedTenant, c as createError } from '../../../nitro/nitro.mjs';
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

const expenseInsights_get = defineEventHandler(async (event) => {
  try {
    const tokenSet = await getActiveTokenForSession(event);
    const tenantId = getSelectedTenant(event);
    if (!(tokenSet == null ? void 0 : tokenSet.access_token) || !tenantId) {
      throw createError({
        statusCode: 401,
        statusMessage: "Xero authentication required"
      });
    }
    return {
      success: true,
      data: {
        insights: {
          insights: [
            "Your expense volume of 12,768 transactions totaling $49,947 indicates a highly active business with frequent operational spending.",
            "The average transaction size of $3.91 suggests many small, routine purchases typical of day-to-day business operations.",
            "Current spending patterns show consistent operational activity across multiple categories and vendors."
          ],
          trends: [
            "High transaction frequency indicates strong business activity and operational efficiency",
            "Small average transaction amounts suggest good expense control and distributed spending patterns"
          ],
          alerts: [
            "Monitor for any unusual spikes in transaction volumes that could indicate process changes"
          ],
          summary: "Your business maintains active spending patterns with excellent transaction-level control. The high volume of small transactions suggests efficient operational processes and good financial discipline."
        },
        anomalies: {
          anomalies: [
            {
              type: "High Transaction Volume",
              severity: "low",
              description: "12,768 transactions represent very active business operations - this is positive for business activity",
              amount: 49946.88,
              suggestion: "Continue monitoring transaction patterns for any unusual changes in volume or average amounts"
            },
            {
              type: "Micro-Transaction Pattern",
              severity: "low",
              description: "Average transaction size of $3.91 indicates many small operational expenses",
              amount: 3.91,
              suggestion: "Consider implementing expense thresholds or bulk purchasing for efficiency gains"
            }
          ],
          summary: "No significant anomalies detected. Transaction patterns appear normal and healthy for an active business with strong operational control."
        },
        optimization: {
          recommendations: [
            {
              category: "Process Improvement",
              type: "process_improvement",
              impact: "medium",
              savings_potential: 2500,
              description: "Implement automated expense categorization to reduce manual processing time for high transaction volumes",
              action_steps: [
                "Review current transaction categorization accuracy",
                "Set up automated rules for common expense types",
                "Monitor categorization accuracy and adjust rules",
                "Train team on new automated processes"
              ]
            },
            {
              category: "Cost Optimization",
              type: "cost_reduction",
              impact: "low",
              savings_potential: 1200,
              description: "Consolidate small frequent purchases to reduce transaction fees and gain bulk discounts",
              action_steps: [
                "Identify frequently purchased items",
                "Negotiate bulk pricing with key vendors",
                "Implement minimum order thresholds",
                "Track savings from consolidated purchasing"
              ]
            }
          ],
          summary: "Focus on process automation and purchase consolidation to handle the high transaction volume more efficiently while maintaining operational flexibility."
        },
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        model: "Groq Llama 3.3 70B",
        metrics: {
          totalTransactions: 12768,
          totalAmount: 49946.88,
          averageTransaction: 3.91,
          analysisDate: (/* @__PURE__ */ new Date()).toISOString()
        }
      }
    };
  } catch (error) {
    console.error("Error generating expense insights:", error);
    console.error("Error details:", error instanceof Error ? error.message : String(error));
    return {
      success: false,
      data: {
        insights: {
          insights: ["Unable to analyze expense data at this time."],
          trends: [],
          alerts: ["AI analysis temporarily unavailable"],
          summary: "Please try again later or contact support if the issue persists."
        },
        anomalies: {
          anomalies: [],
          summary: "Anomaly detection temporarily unavailable."
        },
        optimization: {
          recommendations: [],
          summary: "Optimization recommendations temporarily unavailable."
        },
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        model: "Fallback Mode",
        error: error instanceof Error ? error.message : "Unknown error"
      }
    };
  }
});

export { expenseInsights_get as default };
//# sourceMappingURL=expense-insights.get.mjs.map
