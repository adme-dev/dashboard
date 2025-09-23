import Groq from 'groq-sdk'

// Lazy initialization to avoid startup errors
let groq: Groq | null = null

function getGroqClient() {
  if (!groq) {
    const apiKey = process.env.GROQ_API_KEY || process.env.GROQ_API
    if (!apiKey) {
      throw new Error('GROQ_API_KEY environment variable is required')
    }
    groq = new Groq({ apiKey })
  }
  return groq
}

// Available Groq models optimized for different use cases
export const GROQ_MODELS = {
  // Fast reasoning for financial analysis
  LLAMA_70B: 'llama-3.3-70b-versatile',
  // Faster responses for simple insights
  LLAMA_8B: 'llama-3.1-8b-instant',
  // Balanced performance
  MIXTRAL_8X7B: 'mixtral-8x7b-32768'
} as const

export type GroqModel = typeof GROQ_MODELS[keyof typeof GROQ_MODELS]

interface GroqChatOptions {
  model?: GroqModel
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

/**
 * Generate AI insights using Groq's fast inference
 */
export async function generateGroqInsight(
  prompt: string,
  options: GroqChatOptions = {}
): Promise<string> {
  const {
    model = GROQ_MODELS.LLAMA_70B,
    temperature = 0.1, // Low temperature for consistent financial analysis
    maxTokens = 1000,
    systemPrompt = 'You are a financial analyst AI assistant. Provide clear, actionable insights based on expense data.'
  } = options

  try {
    const groqClient = getGroqClient()
    const completion = await groqClient.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model,
      temperature,
      max_tokens: maxTokens,
      stream: false
    })

    return completion.choices[0]?.message?.content || 'Unable to generate insight'
  } catch (error) {
    console.error('Groq API Error:', error)
    throw new Error('Failed to generate AI insight')
  }
}

/**
 * Analyze expense anomalies using AI
 */
export async function analyzeExpenseAnomalies(expenseData: any[]): Promise<{
  anomalies: Array<{
    type: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    description: string
    amount: number
    suggestion: string
  }>
  summary: string
}> {
  // Summarize data to reduce token usage
  const summary = {
    totalTransactions: expenseData.length,
    totalAmount: expenseData.reduce((sum, item) => sum + (item.total || 0), 0),
    categories: [...new Set(expenseData.map(item => item.category))].slice(0, 10),
    vendors: [...new Set(expenseData.map(item => item.vendor))].slice(0, 10),
    dateRange: {
      earliest: expenseData.reduce((min, item) => item.date < min ? item.date : min, expenseData[0]?.date),
      latest: expenseData.reduce((max, item) => item.date > max ? item.date : max, expenseData[0]?.date)
    },
    largestTransactions: expenseData
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, 5)
      .map(item => ({ vendor: item.vendor, amount: item.total, category: item.category }))
  }

  const prompt = `
Analyze this expense data summary for anomalies and patterns:

Data Summary:
- Total transactions: ${summary.totalTransactions}
- Total amount: $${summary.totalAmount.toLocaleString()}
- Date range: ${summary.dateRange.earliest} to ${summary.dateRange.latest}
- Categories: ${summary.categories.join(', ')}
- Top vendors: ${summary.vendors.join(', ')}
- Largest transactions: ${JSON.stringify(summary.largestTransactions)}

Identify potential anomalies and provide 2-3 key findings in JSON format:
{
  "anomalies": [{"type": "string", "severity": "low|medium|high|critical", "description": "string", "amount": number, "suggestion": "string"}],
  "summary": "Overall assessment"
}
`

  try {
    const response = await generateGroqInsight(prompt, {
      model: GROQ_MODELS.LLAMA_70B,
      temperature: 0.1,
      maxTokens: 2000,
      systemPrompt: 'You are an expert financial auditor. Analyze expense data for anomalies, risks, and optimization opportunities. Always respond in valid JSON format.'
    })

    return JSON.parse(response)
  } catch (error) {
    console.error('Error analyzing expense anomalies:', error)
    return {
      anomalies: [],
      summary: 'Unable to analyze expense data at this time.'
    }
  }
}

/**
 * Generate expense optimization recommendations
 */
export async function generateExpenseOptimization(
  expenseData: any[],
  budgetData?: any[]
): Promise<{
  recommendations: Array<{
    category: string
    type: 'cost_reduction' | 'process_improvement' | 'policy_change' | 'vendor_negotiation'
    impact: 'low' | 'medium' | 'high'
    savings_potential: number
    description: string
    action_steps: string[]
  }>
  summary: string
}> {
  // Create expense summary by category
  const categoryTotals = expenseData.reduce((acc, item) => {
    const category = item.category || 'Other'
    acc[category] = (acc[category] || 0) + (item.total || 0)
    return acc
  }, {} as Record<string, number>)

  const topCategories = Object.entries(categoryTotals)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount }))

  const totalSpend = expenseData.reduce((sum, item) => sum + (item.total || 0), 0)

  const prompt = `
Based on expense analysis, provide optimization recommendations:

Total Spend: $${totalSpend.toLocaleString()}
Top 5 Categories by Spend:
${topCategories.map(cat => `- ${cat.category}: $${cat.amount.toLocaleString()}`).join('\n')}

Number of transactions: ${expenseData.length}
Average transaction: $${(totalSpend / expenseData.length).toFixed(2)}

Provide 2-3 optimization recommendations in JSON format:
{
  "recommendations": [{"category": "string", "type": "cost_reduction|process_improvement|policy_change|vendor_negotiation", "impact": "low|medium|high", "savings_potential": number, "description": "string", "action_steps": ["step1", "step2"]}],
  "summary": "Overall optimization strategy"
}
`

  try {
    const response = await generateGroqInsight(prompt, {
      model: GROQ_MODELS.LLAMA_70B,
      temperature: 0.2,
      maxTokens: 2500,
      systemPrompt: 'You are a strategic financial consultant. Provide actionable cost optimization recommendations based on expense analysis. Focus on practical, implementable solutions. Always respond in valid JSON format.'
    })

    return JSON.parse(response)
  } catch (error) {
    console.error('Error generating expense optimization:', error)
    return {
      recommendations: [],
      summary: 'Unable to generate optimization recommendations at this time.'
    }
  }
}

/**
 * Generate natural language insights for expense trends
 */
export async function generateExpenseInsights(
  currentPeriodData: any[],
  previousPeriodData?: any[]
): Promise<{
  insights: string[]
  trends: string[]
  alerts: string[]
  summary: string
}> {
  const currentTotal = currentPeriodData.reduce((sum, item) => sum + (item.total || 0), 0)
  const currentTransactions = currentPeriodData.length
  
  const previousTotal = previousPeriodData?.reduce((sum, item) => sum + (item.total || 0), 0) || 0
  const previousTransactions = previousPeriodData?.length || 0
  
  const change = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal * 100) : 0

  const prompt = `
Generate executive insights for expense data:

Current Period: $${currentTotal.toLocaleString()} (${currentTransactions} transactions)
${previousPeriodData ? `Previous Period: $${previousTotal.toLocaleString()} (${previousTransactions} transactions)` : ''}
${previousPeriodData ? `Change: ${change > 0 ? '+' : ''}${change.toFixed(1)}%` : ''}

Provide business insights in JSON format:
{
  "insights": ["2-3 key spending insights"],
  "trends": ["1-2 notable trends"],
  "alerts": ["1-2 concerns if any"],
  "summary": "Executive summary paragraph"
}
`

  try {
    const response = await generateGroqInsight(prompt, {
      model: GROQ_MODELS.LLAMA_8B, // Faster model for insights
      temperature: 0.3,
      maxTokens: 1500,
      systemPrompt: 'You are a business intelligence analyst. Generate clear, concise insights about expense data that help executives make informed decisions. Always respond in valid JSON format.'
    })

    return JSON.parse(response)
  } catch (error) {
    console.error('Error generating expense insights:', error)
    return {
      insights: [],
      trends: [],
      alerts: [],
      summary: 'Unable to generate insights at this time.'
    }
  }
}

export default getGroqClient
