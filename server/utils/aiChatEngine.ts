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
  if (intent === 'financial_query' || intent === 'process_query' || intent === 'time_tracking_query') {
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
  pinnedEntityIds?: Set<string>,
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
      const pinMarker = pinnedEntityIds?.has(item.id) ? ' ⭐ (user referenced this directly)' : ''
      contextBlock += `- **[${item.type}] ${item.title}**${pinMarker}: ${item.snippet}\n`
    }
    contextBlock += `\nUse this data to give specific, accurate answers. Reference concrete names, numbers, and statuses when available. Items marked with ⭐ were explicitly referenced by the user — prioritize answering about those. If the data doesn't answer the question, say so honestly rather than guessing.`
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
        formatGuidance = `\n\n## Formatting\nFor financial data:
- Use AUD formatting (e.g. **$12,500**). Highlight key numbers in **bold**.
- Use tables or structured lists with dollar amounts.
- When comparing periods, show both absolute change and percentage (e.g. "+$5,200 (+12.3%)").
- For client financials, always mention payment patterns and outstanding amounts.
- For cash position, always mention the risk level.
- Reference invoice numbers with INV- prefix when available.

## Charts
When presenting breakdowns, comparisons, or trends, include a chart block. The block MUST be valid JSON — no dollar signs, no commas in numbers, no formatting. Only raw numbers.

CORRECT example:
\`\`\`chart
{"type":"bar","title":"Expense Categories","data":[{"label":"Advertising","value":42500},{"label":"Software","value":18200},{"label":"Rent","value":12000}]}
\`\`\`

WRONG — these will break the chart:
- {"value":$42,500} — NO dollar signs or commas in numbers
- {"value":"42500"} — NO strings for numeric values
- {"value":0} when real data exists — use actual numbers from the context

RULES for chart data:
1. Values MUST be plain numbers: 42500 not $42,500 not "42500"
2. Every data item MUST have real values from the financial context provided — never use 0 as a placeholder
3. Include at least 3 data items for bar/donut charts when data is available
4. If you only have data for one category, do NOT generate a chart — use text instead

Chart types: "bar" (category comparison), "donut" (share/proportion), "line" (trends over time), "stacked-bar" (multi-series comparison).
- donut/bar: use "label" and "value" keys
- line: use "label" for x-axis, numeric keys for y-axis (e.g. "revenue", "expenses")
- stacked-bar: use "label" and multiple numeric keys, add "yKeys" and "labels" arrays

Always include a "title" field. Max 8 items. Charts are IN ADDITION to text, not replacements.`
        break
      case 'task_query':
      case 'project_query':
        formatGuidance = `\n\n## Formatting\nFor task/project lists, use a structured format:\n- **Task Name** — Status | Assignee | Due Date\nGroup by status or board when listing multiple items.`
        break
      case 'team_query':
        formatGuidance = `\n\n## Formatting\nFor team data, summarize capacity and workload clearly. Use a list format with active task counts.`
        break
      case 'time_tracking_query':
        formatGuidance = `\n\n## Formatting\nFor time tracking data, use structured lists or tables with hours and dates. Highlight totals in **bold**. Show utilization as percentage when relevant.`
        break
    }
  }

  return `You are the AI assistant for XeroFlow Agency — an internal operations platform for a digital marketing agency.
You help agency staff with their day-to-day work, providing insights about tasks, clients, projects, budgets, and operations.

## Your Role
- Be professional, concise, and helpful
- Use markdown formatting for readability (headings, lists, bold for emphasis)
- When referencing specific items from the data, always use their **exact name** in bold (e.g. **Campaign Launch**, **Acme Corp**). This allows the system to auto-link them for the user.
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

  // Sort sources by title length descending so longer titles match first
  // (prevents "Campaign" matching before "Campaign Launch")
  const sortedSources = [...contextSources].sort((a, b) => (b.title?.length || 0) - (a.title?.length || 0))

  for (const source of sortedSources) {
    if (!source.url || !source.title) continue
    const escapedTitle = source.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Match the title plain or wrapped in **bold**, but not already inside a markdown link [...](...)
    // Use negative lookbehind for [** and negative lookahead for **]( to skip already-linked text
    const regex = new RegExp(
      `(?<!\\[\\*{0,2})\\*{0,2}(${escapedTitle})\\*{0,2}(?!\\*{0,2}\\]\\()`,
      'g'
    )

    let replaced = false
    result = result.replace(regex, (fullMatch, titleText) => {
      if (replaced) return fullMatch
      replaced = true
      return `[**${titleText}**](${source.url})`
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

/**
 * Fetch full details for explicitly @mentioned entities.
 * These get pinned to the top of context so the AI has precise data
 * about what the user is referencing.
 */
async function fetchMentionedEntities(
  entities: Array<{ type: string; id: string }>
): Promise<AiContextSource[]> {
  const results: AiContextSource[] = []

  for (const entity of entities) {
    try {
      let row: any = null

      switch (entity.type) {
        case 'task':
          row = await queryOne(`
            SELECT t.id, t.title, t.status, t.description, t.due_date,
                   p.name as project_name,
                   tm.name as assignee_name
            FROM tasks t
            LEFT JOIN projects p ON p.id = t.project_id
            LEFT JOIN team_members tm ON tm.id = t.assignee_id
            WHERE t.id = $1
          `, [entity.id])
          if (row) {
            const parts = [
              `Status: ${row.status || 'todo'}`,
              row.project_name ? `Project: ${row.project_name}` : null,
              row.assignee_name ? `Assignee: ${row.assignee_name}` : null,
              row.due_date ? `Due: ${new Date(row.due_date).toLocaleDateString()}` : null,
              row.description ? row.description.slice(0, 150) : null,
            ].filter(Boolean)
            results.push({
              type: 'task',
              id: row.id,
              title: row.title,
              snippet: parts.join(' | '),
              url: `/agency/tasks/${row.id}`,
            })
          }
          break

        case 'client':
          row = await queryOne(`
            SELECT ac.id, ac.name, ac.is_active, ac.billing_type,
                   COUNT(DISTINCT br.id)::int as brief_count
            FROM agency_clients ac
            LEFT JOIN briefs br ON br.client_id = ac.id
            WHERE ac.id = $1
            GROUP BY ac.id
          `, [entity.id])
          if (row) {
            const parts = [
              `Status: ${row.is_active ? 'active' : 'inactive'}`,
              row.billing_type ? `Billing: ${row.billing_type}` : null,
              `${row.brief_count} brief${row.brief_count === 1 ? '' : 's'}`,
            ].filter(Boolean)
            results.push({
              type: 'client',
              id: row.id,
              title: row.name,
              snippet: parts.join(' | '),
              url: `/agency/clients/${row.id}`,
            })
          }
          break

        case 'project':
          row = await queryOne(`
            SELECT p.id, p.name, p.status, p.description, p.budget_amount,
                   ac.name as client_name,
                   COUNT(t.id)::int as task_count
            FROM projects p
            LEFT JOIN agency_clients ac ON ac.id = p.client_id
            LEFT JOIN tasks t ON t.project_id = p.id
            WHERE p.id = $1
            GROUP BY p.id, ac.name
          `, [entity.id])
          if (row) {
            const parts = [
              `Status: ${row.status || 'draft'}`,
              row.client_name ? `Client: ${row.client_name}` : null,
              `${row.task_count} tasks`,
              row.budget_amount ? `Budget: $${Number(row.budget_amount).toLocaleString()}` : null,
              row.description ? row.description.slice(0, 100) : null,
            ].filter(Boolean)
            results.push({
              type: 'project',
              id: row.id,
              title: row.name,
              snippet: parts.join(' | '),
              url: `/agency/projects/${row.id}`,
            })
          }
          break

        case 'brief':
          row = await queryOne(`
            SELECT br.id, br.title, br.status, br.description,
                   ac.name as client_name
            FROM briefs br
            LEFT JOIN agency_clients ac ON ac.id = br.client_id
            WHERE br.id = $1
          `, [entity.id])
          if (row) {
            const parts = [
              `Status: ${row.status || 'draft'}`,
              row.client_name ? `Client: ${row.client_name}` : null,
              row.description ? row.description.slice(0, 100) : null,
            ].filter(Boolean)
            results.push({
              type: 'brief',
              id: row.id,
              title: row.title,
              snippet: parts.join(' | '),
              url: `/agency/briefs/${row.id}`,
            })
          }
          break
      }
    } catch (err) {
      console.error(`Failed to fetch mentioned entity ${entity.type}:${entity.id}`, err)
    }
  }

  return results
}

export async function processUserMessage(
  conversationId: string,
  userId: string,
  userRole: string,
  content: string,
  event?: H3Event,
  mentionedEntities?: Array<{ type: string; id: string }>,
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

  // 2b. Fetch explicitly mentioned entities and pin them to top of context
  if (mentionedEntities && mentionedEntities.length > 0) {
    const pinnedSources = await fetchMentionedEntities(mentionedEntities)
    // Deduplicate: remove any auto-retrieved items that match pinned ones
    const pinnedIds = new Set(pinnedSources.map(s => s.id))
    const dedupedContext = contextSources.filter(s => !pinnedIds.has(s.id))
    // Pinned entities go first so the AI sees them prominently
    contextSources.length = 0
    contextSources.push(...pinnedSources, ...dedupedContext)
  }

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
  const pinnedIds = mentionedEntities?.length
    ? new Set(mentionedEntities.map(e => e.id))
    : undefined
  const systemPrompt = buildSystemPrompt(
    userRole,
    contextSources,
    learnedPatternStrings,
    contextBundle.intent,
    pinnedIds,
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

  // 9b. Auto-link invoice number patterns (INV-XXXX) — avoid double-linking inside existing markdown links
  if (!isError) {
    aiContent = aiContent.replace(/(?<!\[)\b(INV-\d{3,})(?!\*{0,2}\])/g, '[$1](/invoices)')
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
