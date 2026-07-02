export const SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND = 'social.inbox.automation' as const

export type SocialInboxAutomationWorkflowTrigger = 'inbound' | 'cron' | 'retry' | 'manual'

export interface SocialInboxAutomationWorkflowPayload {
  kind: typeof SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND
  conversationId: string
  clientId: string
  messageId?: string
  trigger: SocialInboxAutomationWorkflowTrigger
  requestedBy?: string
}

export function normalizeSocialInboxAutomationWorkflowPayload(input: unknown): SocialInboxAutomationWorkflowPayload {
  const body = objectInput(input)
  const kind = requiredText(body.kind, 'kind')
  if (kind !== SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND) {
    throw new Error(`Unsupported workflow kind: ${kind}`)
  }

  const conversationId = requiredText(body.conversationId, 'conversationId')
  const clientId = requiredText(body.clientId, 'clientId')
  const trigger = normalizeTrigger(body.trigger)
  const messageId = optionalText(body.messageId)
  const requestedBy = optionalText(body.requestedBy)

  return {
    kind: SOCIAL_INBOX_AUTOMATION_WORKFLOW_KIND,
    conversationId,
    clientId,
    trigger,
    ...(messageId ? { messageId } : {}),
    ...(requestedBy ? { requestedBy } : {})
  }
}

function normalizeTrigger(input: unknown): SocialInboxAutomationWorkflowTrigger {
  const value = requiredText(input, 'trigger')
  if (value === 'inbound' || value === 'cron' || value === 'retry' || value === 'manual') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function requiredText(input: unknown, field: string): string {
  const value = optionalText(input)
  if (!value) throw new Error(`${field} required`)
  return value
}

function optionalText(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const value = input.trim()
  return value || undefined
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected object payload')
  }
  return input as Record<string, unknown>
}
