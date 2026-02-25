import type { H3Event } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { retrieveContext } from '~~/server/utils/aiContextRetriever'
import { getRelevantPatterns } from '~~/server/utils/aiFeedbackProcessor'
import type { AiMessage, AiContextSource, AiIntent } from '~/types'

export interface ChatResponse {
  message: AiMessage
  contextSources: AiContextSource[]
}

// Multi-model routing: pick the best model based on intent complexity
function selectModel(intent: AiIntent, contentLength: number): string {
  // Financial queries and complex analysis benefit from the larger model
  if (intent === 'financial_query' || intent === 'process_query') {
    return GROQ_MODELS.LLAMA_70B
  }
  // Simple queries (search, general, brief status checks) can use the faster model
  if (intent === 'general' || intent === 'search') {
    return GROQ_MODELS.LLAMA_8B
  }
  // Long messages or action requests likely need deeper reasoning
  if (contentLength > 500 || intent === 'action_request') {
    return GROQ_MODELS.LLAMA_70B
  }
  // Default: 70B for quality
  return GROQ_MODELS.LLAMA_70B
}

function buildSystemPrompt(
  userRole: string,
  contextItems: AiContextSource[],
  learnedPatterns?: string[],
  intent?: AiIntent,
): string {
  let roleGuidance = ''

  switch (userRole) {
    case 'owner':
    case 'admin':
      roleGuidance = `The user is an agency owner/admin with full access to all data.
You can discuss financial details, team performance, client profitability, ad spend, EOM invoicing, and strategic decisions.
Provide executive-level summaries when appropriate.`
      break
    case 'project_manager':
      roleGuidance = `The user is a project manager. Focus on project status, team workload, task progress, brief pipelines, and client delivery.
You can discuss project budgets and timelines. Avoid sharing sensitive financial details about the business itself.`
      break
    case 'sales':
      roleGuidance = `The user is in sales. Focus on client information, proposals, pricing, and pipeline.
You can discuss client-facing financials like quotes and retainers.`
      break
    default:
      roleGuidance = `The user is a team member. Focus on their assigned tasks, boards, and day-to-day work.
Help them be productive. Only share information relevant to their work.`
  }

  let contextBlock = ''
  if (contextItems.length > 0) {
    contextBlock = `\n\n## Relevant Agency Data\nHere is live data from the agency's systems that may be relevant to the user's question:\n\n`
    for (const item of contextItems) {
      contextBlock += `- **[${item.type}] ${item.title}**: ${item.snippet}\n`
    }
    contextBlock += `\nUse this data to give specific, accurate answers. Reference concrete names, numbers, and statuses when available. If the data doesn't answer the question, say so honestly rather than guessing.`
  }

  // Inject learned patterns from feedback as additional guidance
  let patternsBlock = ''
  if (learnedPatterns && learnedPatterns.length > 0) {
    patternsBlock = `\n\n## Learned Preferences\nBased on previous feedback, keep these corrections and preferences in mind:\n`
    for (const p of learnedPatterns) {
      patternsBlock += `- ${p}\n`
    }
  }

  // Intent-specific formatting guidance
  let formatGuidance = ''
  if (intent) {
    switch (intent) {
      case 'financial_query':
        formatGuidance = `\n\n## Formatting\nFor financial data, use tables or structured lists with dollar amounts. Highlight key numbers in **bold**.`
        break
      case 'task_query':
      case 'project_query':
        formatGuidance = `\n\n## Formatting\nFor task/project lists, use a structured format:\n- **Task Name** — Status | Assignee | Due Date\nGroup by status or board when listing multiple items.`
        break
      case 'team_query':
        formatGuidance = `\n\n## Formatting\nFor team data, summarize capacity and workload clearly. Use a list format with active task counts.`
        break
    }
  }

  return `You are the AI assistant for XeroFlow Agency — an internal operations platform for a digital marketing agency.
You help agency staff with their day-to-day work, providing insights about tasks, clients, projects, budgets, and operations.

## Your Role
- Be professional, concise, and helpful
- Use markdown formatting for readability (headings, lists, bold for emphasis)
- When referencing specific items, link them: mention the item name and its location (board, client, etc.)
- If you don't have enough information to answer accurately, say so
- Never fabricate data — only reference what's provided in the context
- When listing items from the data, include all relevant details (status, assignee, dates)

## User Context
${roleGuidance}
${contextBlock}${patternsBlock}${formatGuidance}`
}

// Post-process AI response: auto-link entity references to their URLs
function autoLinkEntities(content: string, contextSources: AiContextSource[]): string {
  let result = content

  // Build a lookup of entity titles to their URLs
  for (const source of contextSources) {
    if (!source.url || !source.title) continue
    // Only link if the title appears in the response and isn't already in a markdown link
    const escapedTitle = source.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(?<!\\[)\\b(${escapedTitle})\\b(?!\\])`, 'g')
    // Only replace the first occurrence to avoid over-linking
    let replaced = false
    result = result.replace(regex, (match) => {
      if (replaced) return match
      replaced = true
      return `[${match}](${source.url})`
    })
  }

  return result
}

function mapMessageRow(row: any): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    contextSources: row.context_sources || [],
    tokenCount: row.token_count,
    model: row.model,
    latencyMs: row.latency_ms,
    isError: row.is_error,
    createdAt: row.created_at,
  }
}

export async function processUserMessage(
  conversationId: string,
  userId: string,
  userRole: string,
  content: string,
  event?: H3Event
): Promise<ChatResponse> {
  const startTime = Date.now()

  // 1. Load recent conversation history (last 10 messages)
  const historyRows = await queryRows(`
    SELECT role, content
    FROM ai_messages
    WHERE conversation_id = $1
    ORDER BY created_at DESC
    LIMIT 10
  `, [conversationId])

  const history = historyRows.reverse().map(r => ({
    role: r.role as 'user' | 'assistant' | 'system',
    content: r.content as string,
  }))

  // 2. Retrieve relevant context (now intent-aware with relevance scoring)
  const contextBundle = await retrieveContext(userId, userRole, content)
  const contextSources: AiContextSource[] = contextBundle.items.map(item => ({
    type: item.type,
    id: item.id,
    title: item.title,
    snippet: item.snippet,
    url: item.url,
  }))

  // 3. Fetch learned patterns from feedback for system prompt enrichment
  let learnedPatternStrings: string[] = []
  try {
    const patterns = await getRelevantPatterns(content, 3)
    learnedPatternStrings = patterns.map(p => {
      if (p.patternType === 'correction') {
        return `Correction: ${p.content}`
      }
      return p.content.slice(0, 200)
    })
  } catch {
    // Learned patterns table may not exist yet
  }

  // 4. Build system prompt with role, context, learned patterns, and intent-specific formatting
  const systemPrompt = buildSystemPrompt(
    userRole,
    contextSources,
    learnedPatternStrings,
    contextBundle.intent,
  )

  // 5. Build the messages array for the LLM
  const messagesForPrompt = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n')
  const fullPrompt = messagesForPrompt
    ? `${messagesForPrompt}\n\nUser: ${content}`
    : content

  // 6. Save the user message
  const userMsg = await queryOne<any>(`
    INSERT INTO ai_messages (conversation_id, role, content, context_sources)
    VALUES ($1, 'user', $2, '[]'::jsonb)
    RETURNING *
  `, [conversationId, content])

  // 7. Multi-model routing: select the best model based on intent
  const selectedModel = selectModel(contextBundle.intent, content.length)

  // 8. Try LoRA-enhanced generation for simpler queries, then fall back to Groq
  let aiContent: string = ''
  let isError = false
  let usedLora = false
  let loraAdapterId: string | null = null

  // For 8B-eligible queries, try LoRA-enhanced edge inference first
  if (selectedModel === GROQ_MODELS.LLAMA_8B) {
    try {
      const { getActiveAdapter } = await import('~~/server/utils/aiLoraManager')
      const { edgeGenerateWithLoRA } = await import('~~/server/utils/edgeAi')
      const adapter = await getActiveAdapter('chat')
      if (adapter && event) {
        const result = await edgeGenerateWithLoRA(event, fullPrompt, {
          systemPrompt,
          maxTokens: 2000,
          temperature: 0.3,
          loraAdapter: adapter,
        })
        if (result.response) {
          aiContent = result.response
          usedLora = result.usedLora
          loraAdapterId = result.adapterId
        }
      }
    } catch {
      // LoRA unavailable — fall through to Groq
    }
  }

  // Fall back to Groq if LoRA didn't produce a response
  if (!aiContent) {
    try {
      aiContent = await generateGroqInsight(fullPrompt, {
        model: selectedModel,
        temperature: 0.3,
        maxTokens: 2000,
        systemPrompt,
      })
    } catch (err: any) {
      console.error('AI generation error:', err)
      aiContent = 'I apologize, but I encountered an error processing your request. Please try again in a moment.'
      isError = true
    }
  }

  // 9. Post-process: auto-link entity references in the response
  if (!isError && contextSources.length > 0) {
    aiContent = autoLinkEntities(aiContent, contextSources)
  }

  const latencyMs = Date.now() - startTime
  const tokenEstimate = Math.ceil((systemPrompt.length + fullPrompt.length + aiContent.length) / 4)

  // 10. Save the assistant reply (with LoRA tracking)
  const assistantMsg = await queryOne<any>(`
    INSERT INTO ai_messages (conversation_id, role, content, context_sources, token_count, model, latency_ms, is_error, is_lora, lora_adapter_id)
    VALUES ($1, 'assistant', $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    conversationId,
    aiContent,
    JSON.stringify(contextSources),
    tokenEstimate,
    selectedModel,
    latencyMs,
    isError,
    usedLora,
    loraAdapterId,
  ])

  // 11. Update conversation metadata
  const isFirstMessage = history.length === 0

  if (isFirstMessage) {
    // Auto-generate a title from the first user message
    const autoTitle = content.length > 60
      ? content.slice(0, 57) + '...'
      : content
    await execute(`
      UPDATE ai_conversations
      SET title = COALESCE(NULLIF(title, ''), $2),
          message_count = message_count + 2,
          last_message_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `, [conversationId, autoTitle])
  } else {
    await execute(`
      UPDATE ai_conversations
      SET message_count = message_count + 2,
          last_message_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `, [conversationId])
  }

  return {
    message: mapMessageRow(assistantMsg),
    contextSources,
  }
}
