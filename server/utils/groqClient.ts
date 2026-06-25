import Groq from 'groq-sdk'
import { toFile } from 'groq-sdk/uploads'
import { recordAiInvocation } from '~~/server/utils/ai/invocationLedger'

// Lazy initialization to avoid startup errors
let groq: Groq | null = null
let directGroq: Groq | null = null

/**
 * Cloudflare AI Gateway's Groq provider endpoint is:
 * https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/groq
 * Accept the root gateway URL too so local/prod config can share one value
 * across Groq and Anthropic helpers without silently misrouting requests.
 * Source: https://developers.cloudflare.com/ai-gateway/usage/providers/groq/
 */
export function resolveGroqGatewayBaseUrl(base?: string | null): string | undefined {
  if (!base) return undefined
  const trimmed = String(base).trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  return trimmed.replace(/\/(groq|anthropic|perplexity-ai)$/, '') + '/groq'
}

export function buildGatewayAuthHeaders(gatewayUrl?: string, token?: string | null): Record<string, string> | undefined {
  if (!gatewayUrl || !token) return undefined
  const trimmed = String(token).trim()
  if (!trimmed) return undefined
  const bearer = trimmed.replace(/^Bearer\s+/i, '')
  return { 'cf-aig-authorization': `Bearer ${bearer}` }
}

function resolveGroqApiKey(config: ReturnType<typeof useRuntimeConfig>): string {
  const apiKey = config.groqApiKey || process.env.GROQ_API_KEY || process.env.GROQ_API
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is required')
  }
  return apiKey
}

function hasGatewayConfigured(): boolean {
  const config = useRuntimeConfig()
  return Boolean(resolveGroqGatewayBaseUrl(config.aiGatewayUrl || process.env.AI_GATEWAY_URL))
}

function getDirectGroqClient() {
  if (!directGroq) {
    const config = useRuntimeConfig()
    directGroq = new Groq({ apiKey: resolveGroqApiKey(config) })
  }
  return directGroq
}

function getGroqClient() {
  if (!groq) {
    const config = useRuntimeConfig()
    const apiKey = resolveGroqApiKey(config)
    // Route through Cloudflare AI Gateway when configured (provides caching, rate limiting, analytics)
    const aiGatewayUrl = resolveGroqGatewayBaseUrl(config.aiGatewayUrl || process.env.AI_GATEWAY_URL)
    const gatewayAuthHeaders = buildGatewayAuthHeaders(
      aiGatewayUrl,
      config.aiGatewayAuthToken
      || process.env.AI_GATEWAY_AUTH_TOKEN
      || config.cfApiToken
      || process.env.CF_API_TOKEN
      || process.env.CLOUDFLARE_API_TOKEN
    )
    groq = new Groq({
      apiKey,
      ...(aiGatewayUrl ? { baseURL: aiGatewayUrl } : {}),
      ...(gatewayAuthHeaders ? { defaultHeaders: gatewayAuthHeaders } : {})
    })
  }
  return groq
}

/**
 * Groq model catalog. Verified against https://console.groq.com/docs/models
 *
 * Pick per use-case:
 *   • Deep reasoning / structured JSON (CFO advisor, action plans)
 *       → REASONING_120B (openai/gpt-oss-120b) — best JSON adherence + tool use
 *   • General analysis & summarisation
 *       → LLAMA_70B (llama-3.3-70b-versatile) — solid fallback
 *   • Fast widget-level insights
 *       → LLAMA_8B (llama-3.1-8b-instant) — sub-second on Groq
 *   • Mid-tier reasoning
 *       → REASONING_20B (openai/gpt-oss-20b) — faster/cheaper than 120B
 *
 * Preview-only (may be yanked; always wrap in try/catch with a fallback):
 *   • LLAMA_4_SCOUT — Llama-4 early-access
 *   • QWEN3_32B — multilingual
 */
export const GROQ_MODELS = {
  // Deep reasoning, best structured-output adherence + built-in tool use.
  REASONING_120B: 'openai/gpt-oss-120b',
  // Mid-tier reasoning — cheaper, still high quality JSON.
  REASONING_20B: 'openai/gpt-oss-20b',
  // General-purpose llama-3.3 70B (128K context).
  LLAMA_70B: 'llama-3.3-70b-versatile',
  // Fast lightweight model for per-widget insight strings.
  LLAMA_8B: 'llama-3.1-8b-instant',
  // Preview — do not rely on exclusively.
  LLAMA_4_SCOUT: 'meta-llama/llama-4-scout-17b-16e-instruct',
  QWEN3_32B: 'qwen/qwen3-32b'
} as const

export const GROQ_AUDIO_MODELS = {
  WHISPER_LARGE_V3: 'whisper-large-v3',
  WHISPER_LARGE_V3_TURBO: 'whisper-large-v3-turbo'
} as const

export type GroqModel = typeof GROQ_MODELS[keyof typeof GROQ_MODELS]
export type GroqAudioModel = typeof GROQ_AUDIO_MODELS[keyof typeof GROQ_AUDIO_MODELS]

type ExpenseDatum = {
  total?: number
  category?: string
  vendor?: string
  date?: string
}

interface GroqChatOptions {
  model?: GroqModel
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  featureKey?: string
  userId?: string | null
  clientId?: string | null
  requestId?: string | null
  metadata?: Record<string, unknown>
}

function usageFromCompletion(completion: any) {
  return {
    promptTokens: completion?.usage?.prompt_tokens ?? completion?.usage?.promptTokens ?? null,
    completionTokens: completion?.usage?.completion_tokens ?? completion?.usage?.completionTokens ?? null,
    totalTokens: completion?.usage?.total_tokens ?? completion?.usage?.totalTokens ?? null
  }
}

function errorCode(error: unknown): string {
  const err = error as { code?: unknown, status?: unknown, message?: unknown }
  return String(err?.code ?? err?.status ?? err?.message ?? 'unknown_error').slice(0, 160)
}

async function recordGroqChatInvocation(input: {
  options: GroqChatOptions
  model: GroqModel
  gatewayUsed: boolean
  fallbackUsed: boolean
  status: 'success' | 'error'
  startedAt: number
  completion?: any
  error?: unknown
}) {
  if (!input.options.featureKey) return

  const usage = usageFromCompletion(input.completion)
  await recordAiInvocation({
    featureKey: input.options.featureKey,
    provider: 'groq',
    modelId: input.model,
    gatewayUsed: input.gatewayUsed,
    fallbackUsed: input.fallbackUsed,
    userId: input.options.userId,
    clientId: input.options.clientId,
    requestId: input.options.requestId,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    totalTokens: usage.totalTokens,
    status: input.status,
    errorCode: input.error ? errorCode(input.error) : null,
    latencyMs: Date.now() - input.startedAt,
    metadata: input.options.metadata ?? {}
  })
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
  const startedAt = Date.now()
  const gatewayConfigured = hasGatewayConfigured()

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
    await recordGroqChatInvocation({
      options,
      model,
      gatewayUsed: gatewayConfigured,
      fallbackUsed: false,
      status: 'success',
      startedAt,
      completion
    })

    return completion.choices[0]?.message?.content || 'Unable to generate insight'
  } catch (error) {
    if (gatewayConfigured) {
      console.warn('Groq AI Gateway request failed; retrying direct Groq:', error)
      try {
        const directCompletion = await getDirectGroqClient().chat.completions.create({
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
        await recordGroqChatInvocation({
          options,
          model,
          gatewayUsed: true,
          fallbackUsed: true,
          status: 'success',
          startedAt,
          completion: directCompletion
        })

        return directCompletion.choices[0]?.message?.content || 'Unable to generate insight'
      } catch (directError) {
        await recordGroqChatInvocation({
          options,
          model,
          gatewayUsed: true,
          fallbackUsed: true,
          status: 'error',
          startedAt,
          error: directError
        })
        throw directError
      }
    }
    console.error('Groq API Error:', error)
    await recordGroqChatInvocation({
      options,
      model,
      gatewayUsed: false,
      fallbackUsed: false,
      status: 'error',
      startedAt,
      error
    })
    throw new Error('Failed to generate AI insight')
  }
}

export async function transcribeGroqAudio(input: {
  buffer: Buffer
  filename: string
  contentType: string
  prompt?: string
  language?: string
  model?: GroqAudioModel
}) {
  try {
    const groqClient = getGroqClient()
    const file = await toFile(input.buffer, input.filename, { type: input.contentType })
    const transcription = await groqClient.audio.transcriptions.create({
      file,
      model: input.model ?? GROQ_AUDIO_MODELS.WHISPER_LARGE_V3_TURBO,
      response_format: 'json',
      temperature: 0,
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...(input.language ? { language: input.language } : {})
    })

    return transcription.text.trim()
  } catch (error) {
    console.error('Groq transcription error:', error)
    throw new Error('Failed to transcribe audio')
  }
}

/**
 * Analyze expense anomalies using AI
 */
export async function analyzeExpenseAnomalies(expenseData: ExpenseDatum[]): Promise<{
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
  expenseData: ExpenseDatum[],
  _budgetData?: unknown[]
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
    .sort(([,a], [,b]) => (b as number) - (a as number))
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount: amount as number }))

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
  currentPeriodData: ExpenseDatum[],
  previousPeriodData?: ExpenseDatum[]
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
