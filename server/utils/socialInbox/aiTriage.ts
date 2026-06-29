import { GROQ_MODELS } from '~~/server/utils/groqClient'
import { generateModelRoutedGroqInsight } from '~~/server/utils/ai/resolvedGroq'
import type { SocialInboxPriority } from './conversationPatch'

export type SocialInboxTriageSentiment = 'positive' | 'neutral' | 'negative' | 'urgent'
export type SocialInboxTriageRisk = 'low' | 'medium' | 'high'

export interface SocialInboxTriageContext {
  conversation: {
    id: string
    clientId?: string | null
    clientName: string | null
    platform: string
    channelType: string
    participantName: string | null
    rating: number | null
    priority: SocialInboxPriority | null
    tags: string[]
    linkedTaskId: string | null
    linkedClientRequestId: string | null
  }
  messages: Array<{
    direction: 'in' | 'out'
    authorName: string | null
    content: string | null
    occurredAt: string | null
    isInternal: boolean
  }>
  candidateTasks: Array<{
    id: string
    title: string
    statusName: string | null
    projectName: string | null
  }>
}

export type SocialInboxTriageAction
  = | { type: 'link_task', taskId: string, reason: string }
    | { type: 'create_social_case', title: string, description: string, reason: string }
    | { type: 'client_approval', reason: string }

export interface SocialInboxTriageResult {
  summary: string
  sentiment: SocialInboxTriageSentiment
  riskLevel: SocialInboxTriageRisk
  suggestedPriority: SocialInboxPriority | null
  suggestedTags: string[]
  approvalRecommended: boolean
  actions: SocialInboxTriageAction[]
}

const PRIORITIES = new Set(['low', 'medium', 'high', 'urgent'])
const SENTIMENTS = new Set(['positive', 'neutral', 'negative', 'urgent'])
const RISK_LEVELS = new Set(['low', 'medium', 'high'])

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function clampList(values: unknown, limit: number) {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const tag = asString(value).toLowerCase()
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    out.push(tag.slice(0, 40))
    if (out.length >= limit) break
  }
  return out
}

function fallbackTriage(): SocialInboxTriageResult {
  return {
    summary: 'No AI triage summary available.',
    sentiment: 'neutral',
    riskLevel: 'medium',
    suggestedPriority: null,
    suggestedTags: [],
    approvalRecommended: false,
    actions: []
  }
}

export function parseSocialInboxAiTriageResponse(raw: string, allowedTaskIds: Set<string>): SocialInboxTriageResult {
  const match = raw?.match(/\{[\s\S]*\}/)
  if (!match) return fallbackTriage()

  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(match[0])
  } catch {
    return fallbackTriage()
  }

  const sentiment = asString(obj.sentiment)
  const riskLevel = asString(obj.riskLevel)
  const suggestedPriority = asString(obj.suggestedPriority)
  const actions: SocialInboxTriageAction[] = []

  if (Array.isArray(obj.actions)) {
    for (const item of obj.actions) {
      if (!item || typeof item !== 'object') continue
      const action = item as Record<string, unknown>
      const type = asString(action.type)
      const reason = asString(action.reason, 'Recommended by AI triage.')
      if (type === 'link_task') {
        const taskId = asString(action.taskId)
        if (allowedTaskIds.has(taskId)) actions.push({ type, taskId, reason })
      } else if (type === 'create_social_case') {
        const title = asString(action.title)
        const description = asString(action.description)
        if (title && description) actions.push({ type, title: title.slice(0, 160), description: description.slice(0, 2000), reason })
      } else if (type === 'client_approval') {
        actions.push({ type, reason })
      }
      if (actions.length >= 4) break
    }
  }

  return {
    summary: asString(obj.summary, 'AI triage completed.').slice(0, 500),
    sentiment: SENTIMENTS.has(sentiment) ? sentiment as SocialInboxTriageSentiment : 'neutral',
    riskLevel: RISK_LEVELS.has(riskLevel) ? riskLevel as SocialInboxTriageRisk : 'medium',
    suggestedPriority: PRIORITIES.has(suggestedPriority) ? suggestedPriority as SocialInboxPriority : null,
    suggestedTags: clampList(obj.suggestedTags, 6),
    approvalRecommended: obj.approvalRecommended === true,
    actions
  }
}

export function buildSocialInboxAiTriagePrompt(context: SocialInboxTriageContext): string {
  const conversation = context.conversation
  const messages = context.messages
    .map(message => `${message.occurredAt ?? 'unknown'} ${message.direction}${message.isInternal ? ' internal' : ''} ${message.authorName ?? 'unknown'}: ${message.content ?? ''}`)
    .join('\n')
  const candidates = context.candidateTasks.length
    ? context.candidateTasks.map(task => `- ${task.id}: ${task.title} (${task.statusName ?? 'unknown'}${task.projectName ? `, ${task.projectName}` : ''})`).join('\n')
    : '- none'

  return [
    'You are triaging a social inbox conversation for an agency operations team.',
    'Recommend staff-safe next actions. Never claim an action has already happened.',
    '',
    `Conversation id: ${conversation.id}`,
    `Client: ${conversation.clientName ?? 'Unknown'}`,
    `Platform/channel: ${conversation.platform}/${conversation.channelType}`,
    `Participant: ${conversation.participantName ?? 'Unknown'}`,
    `Rating: ${conversation.rating ?? 'n/a'}`,
    `Current priority: ${conversation.priority ?? 'none'}`,
    `Current tags: ${conversation.tags.join(', ') || 'none'}`,
    `Linked task: ${conversation.linkedTaskId ?? 'none'}`,
    `Linked client request: ${conversation.linkedClientRequestId ?? 'none'}`,
    '',
    'Recent messages:',
    messages || 'none',
    '',
    'Candidate tasks for link_task actions. You may only recommend one of these exact ids:',
    candidates,
    '',
    'Action rules:',
    '- Use link_task only when an existing candidate task clearly matches.',
    '- Use create_social_case when staff should create a new native task/case.',
    '- Use client_approval when the reply should be client-approved before sending.',
    '',
    'Respond with STRICT JSON only, no prose, no code fences:',
    '{"summary":"short staff summary","sentiment":"positive|neutral|negative|urgent","riskLevel":"low|medium|high","suggestedPriority":"low|medium|high|urgent|null","suggestedTags":["tag"],"approvalRecommended":true,"actions":[{"type":"link_task","taskId":"candidate-task-id","reason":"why"},{"type":"create_social_case","title":"task title","description":"task description","reason":"why"},{"type":"client_approval","reason":"why"}]}'
  ].join('\n')
}

export async function generateSocialInboxAiTriage(context: SocialInboxTriageContext): Promise<SocialInboxTriageResult> {
  try {
    const raw = await generateModelRoutedGroqInsight(buildSocialInboxAiTriagePrompt(context), {
      defaultModelId: GROQ_MODELS.LLAMA_70B,
      temperature: 0.2,
      maxTokens: 700,
      systemPrompt: 'You are a senior agency social inbox triage operator. You recommend safe, auditable next actions and never execute writes.',
      featureKey: 'social_inbox_ai_triage',
      clientId: context.conversation.clientId ?? null,
      metadata: {
        platform: context.conversation.platform,
        channelType: context.conversation.channelType,
        candidateTaskCount: context.candidateTasks.length
      }
    })
    return parseSocialInboxAiTriageResponse(raw, new Set(context.candidateTasks.map(task => task.id)))
  } catch {
    return fallbackTriage()
  }
}
