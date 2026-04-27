import type { H3Event } from 'h3'
import { edgeClassify, edgeGenerateWithLoRA } from '~~/server/utils/edgeAi'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'

export type AiIntent =
  | 'task_query'
  | 'brief_query'
  | 'project_query'
  | 'financial_query'
  | 'team_query'
  | 'process_query'
  | 'search'
  | 'time_tracking_query'
  | 'pricing_query'
  | 'action_request'
  | 'code_query'
  | 'general'

export interface IntentResult {
  intent: AiIntent
  confidence: number
  entities: string[]
}

interface PatternRule {
  intent: AiIntent
  pattern: RegExp
  weight: number
}

const INTENT_PATTERNS: PatternRule[] = [
  { intent: 'task_query', pattern: /\b(tasks?|todo|assigned|overdue|due|deadline|blocked|work items?)\b/i, weight: 0.8 },
  { intent: 'brief_query', pattern: /\b(briefs?|creative|campaigns?|brand|deliverables?|proofs?)\b/i, weight: 0.8 },
  { intent: 'project_query', pattern: /\b(projects?|boards?|workflows?|status|pipeline|kanban)\b/i, weight: 0.75 },
  { intent: 'financial_query', pattern: /\b(invoices?|spend|budget|revenue|costs?|eom|profit|cash|billing|expenses?|retainers?|financial)\b/i, weight: 0.85 },
  { intent: 'team_query', pattern: /\b(teams?|who|capacity|workload|available|members?|staff|people)\b/i, weight: 0.75 },
  { intent: 'process_query', pattern: /\b(how\s+(do|does|to|can)|process|procedure|steps?|guide|documentation|sop)\b/i, weight: 0.7 },
  { intent: 'search', pattern: /\b(find|search|look\s*(for|up)|where\s+(is|are)|list\s+(all|my|the))\b/i, weight: 0.7 },
  { intent: 'time_tracking_query', pattern: /\b(hours?|time\s*(logged|tracking|entries|sheets?)|timesheets?|timer|utilization|billable|logged\s*time|capacity|overtime)\b/i, weight: 0.85 },
  { intent: 'pricing_query', pattern: /\b(rate\s*card|pricing|how\s+much|cost\s+of|service\s+price|setup?\s*fee|price\s+list|rates?|charge\s+for)\b/i, weight: 0.85 },
  { intent: 'action_request', pattern: /\b(create|add|update|change|move|assign|delete|remove|set|mark|complete)\b/i, weight: 0.65 },
  { intent: 'code_query', pattern: /\b(code\s|codebase|source\s+code|repo(sitory)?|implementation|component\b|function\b|method\b|module\b|class\b|file\b|where\s+(is|are)\s+\w+\s+(defined|implemented|located|written)|how\s+does\s+\w+\s+(work|function))\b/i, weight: 0.8 },
]

// Extract potential entity names (capitalized words that aren't common English)
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'my', 'your', 'their', 'our',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some',
  'any', 'many', 'much', 'about', 'from', 'with', 'for', 'not', 'but',
  'and', 'or', 'if', 'then', 'than', 'too', 'very', 'just', 'also',
  'new', 'old', 'last', 'next', 'first', 'second', 'third',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'today', 'tomorrow', 'yesterday', 'week', 'month', 'year',
])

function extractEntities(message: string): string[] {
  const entities: string[] = []

  // Extract quoted strings as entities
  const quoted = message.match(/"([^"]+)"|'([^']+)'/g)
  if (quoted) {
    for (const q of quoted) {
      entities.push(q.replace(/['"]/g, ''))
    }
  }

  // Extract capitalized multi-word sequences (likely proper nouns / names)
  const capitalizedPhrases = message.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g)
  if (capitalizedPhrases) {
    for (const phrase of capitalizedPhrases) {
      if (!entities.includes(phrase)) {
        entities.push(phrase)
      }
    }
  }

  // Extract standalone capitalized words that aren't common or at sentence start
  const words = message.split(/\s+/)
  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z]/g, '')
    if (
      word.length > 2 &&
      /^[A-Z]/.test(word) &&
      !COMMON_WORDS.has(word.toLowerCase()) &&
      // Skip if it's the first word after sentence boundary (likely just capitalization)
      !(i === 0 || /[.!?]\s*$/.test(words[i - 1] || ''))
    ) {
      if (!entities.includes(word)) {
        entities.push(word)
      }
    }
  }

  return entities.slice(0, 10)
}

function classifyByPatterns(message: string): IntentResult | null {
  const scores: Map<AiIntent, number> = new Map()

  for (const rule of INTENT_PATTERNS) {
    const matches = message.match(new RegExp(rule.pattern, 'gi'))
    if (matches) {
      const matchCount = matches.length
      const currentScore = scores.get(rule.intent) || 0
      // More keyword matches increase confidence, capped at the rule weight
      scores.set(rule.intent, Math.min(currentScore + matchCount * 0.15 + rule.weight * 0.5, rule.weight))
    }
  }

  if (scores.size === 0) return null

  // Find the best matching intent
  let bestIntent: AiIntent = 'general'
  let bestScore = 0

  for (const [intent, score] of scores) {
    if (score > bestScore) {
      bestScore = score
      bestIntent = intent
    }
  }

  return {
    intent: bestIntent,
    confidence: Math.min(bestScore, 1.0),
    entities: extractEntities(message),
  }
}

async function classifyByLLM(message: string, event?: H3Event): Promise<IntentResult> {
  const validIntents: AiIntent[] = [
    'task_query', 'brief_query', 'project_query', 'financial_query',
    'team_query', 'process_query', 'time_tracking_query', 'pricing_query', 'search', 'action_request', 'code_query', 'general',
  ]

  // Try LoRA-enhanced intent classification first
  if (event) {
    try {
      const { getActiveAdapter } = await import('~~/server/utils/aiLoraManager')
      const adapter = await getActiveAdapter('intent')
      if (adapter) {
        const classifyPrompt = `Classify this message into exactly ONE category. Respond with ONLY valid JSON: {"intent":"<category>","confidence":<0.0-1.0>}\n\nCategories: ${validIntents.join(', ')}\n\nMessage: "${message}"`
        const result = await edgeGenerateWithLoRA(event, classifyPrompt, {
          systemPrompt: 'You are a message classifier. Respond only with valid JSON.',
          maxTokens: 100,
          temperature: 0.1,
          loraAdapter: adapter,
        })
        if (result.response) {
          const cleaned = result.response.replace(/```json\n?|\n?```/g, '').trim()
          const parsed = JSON.parse(cleaned)
          if (parsed.intent && validIntents.includes(parsed.intent)) {
            return {
              intent: parsed.intent,
              confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.7,
              entities: extractEntities(message),
            }
          }
        }
      }
    } catch {
      // LoRA unavailable or failed — fall through to standard edge AI
    }
  }

  // Try Workers AI edge inference (<50ms vs 1-3s Groq)
  if (event) {
    const edgeResult = await edgeClassify(event, message, validIntents)
    if (edgeResult && validIntents.includes(edgeResult.category as AiIntent)) {
      return {
        intent: edgeResult.category as AiIntent,
        confidence: edgeResult.confidence,
        entities: extractEntities(message),
      }
    }
    // Edge AI unavailable or returned invalid result — fall through to Groq
  }

  const prompt = `Classify this user message into exactly ONE intent category. Also extract any entity names (client names, project names, people names, etc).

Message: "${message}"

Intent categories:
- task_query: questions about tasks, assignments, deadlines, work items
- brief_query: questions about briefs, campaigns, creative work, deliverables
- project_query: questions about projects, boards, workflows, pipelines
- financial_query: questions about money, invoices, spend, budgets, revenue, costs
- team_query: questions about team members, capacity, workload, availability
- time_tracking_query: questions about hours logged, timesheets, timers, utilization, billable hours
- process_query: questions about how to do something, procedures, documentation
- pricing_query: questions about rate card, pricing, service costs, setup fees, how much something costs
- search: requests to find or list specific items
- action_request: requests to create, update, delete, or modify something
- general: anything that doesn't fit the above categories

Respond in this exact JSON format only, no other text:
{"intent":"<category>","confidence":<0.0-1.0>,"entities":["entity1","entity2"]}`

  try {
    const response = await generateGroqInsight(prompt, {
      model: GROQ_MODELS.LLAMA_8B,
      temperature: 0.1,
      maxTokens: 150,
      systemPrompt: 'You are a message classifier. Respond only with valid JSON. No explanations.',
    })

    // Parse the JSON response, handling potential markdown code blocks
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    const intent = validIntents.includes(parsed.intent) ? parsed.intent : 'general'
    const confidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.6
    const entities = Array.isArray(parsed.entities)
      ? parsed.entities.filter((e: any) => typeof e === 'string').slice(0, 10)
      : []

    return { intent, confidence, entities }
  } catch (err) {
    console.error('LLM intent classification failed:', err)
    return {
      intent: 'general',
      confidence: 0.3,
      entities: extractEntities(message),
    }
  }
}

/**
 * Classify a user message into an intent category.
 * Uses fast keyword matching first, falls back to LLM if confidence is low.
 */
export async function classifyIntent(message: string, event?: H3Event): Promise<IntentResult> {
  // Fast path: keyword + regex matching
  const patternResult = classifyByPatterns(message)

  if (patternResult && patternResult.confidence >= 0.6) {
    return patternResult
  }

  // Slow path: use Groq LLAMA_8B for classification
  const llmResult = await classifyByLLM(message, event)

  // If pattern matching gave a partial result, merge entities
  if (patternResult) {
    const mergedEntities = [...new Set([...llmResult.entities, ...patternResult.entities])]
    return {
      ...llmResult,
      entities: mergedEntities.slice(0, 10),
    }
  }

  return llmResult
}
