export const BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND = 'brief.lifecycle.check' as const

export type BriefLifecycleCheckWorkflowTrigger = 'submit' | 'manual' | 'cron' | 'retry'

export interface BriefLifecycleCheckWorkflowPayload {
  kind: typeof BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND
  briefId: string
  trigger: BriefLifecycleCheckWorkflowTrigger
  clientId?: string
  requestedBy?: string
}

const WORKFLOW_INSTANCE_ID_MAX_LENGTH = 100

export function normalizeBriefLifecycleCheckWorkflowPayload(input: unknown): BriefLifecycleCheckWorkflowPayload {
  const body = objectInput(input)
  const kind = requiredText(body.kind, 'kind')
  if (kind !== BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND) {
    throw new Error(`Unsupported workflow kind: ${kind}`)
  }

  const briefId = requiredText(body.briefId, 'briefId')
  const trigger = normalizeTrigger(body.trigger)
  const clientId = optionalText(body.clientId)
  const requestedBy = optionalText(body.requestedBy)

  return {
    kind: BRIEF_LIFECYCLE_CHECK_WORKFLOW_KIND,
    briefId,
    trigger,
    ...(clientId ? { clientId } : {}),
    ...(requestedBy ? { requestedBy } : {})
  }
}

export function buildBriefLifecycleCheckWorkflowInstanceId(payload: BriefLifecycleCheckWorkflowPayload): string {
  return `brief-lifecycle-${workflowInstancePart(payload.briefId)}-${workflowInstancePart(payload.trigger)}`
    .slice(0, WORKFLOW_INSTANCE_ID_MAX_LENGTH)
}

function normalizeTrigger(input: unknown): BriefLifecycleCheckWorkflowTrigger {
  const value = requiredText(input, 'trigger')
  if (value === 'submit' || value === 'manual' || value === 'cron' || value === 'retry') return value
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

function workflowInstancePart(input: string): string {
  const value = input.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return value || 'unknown'
}
