export const SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND = 'site.intelligence.crawl' as const

export type SiteIntelligenceCrawlWorkflowTrigger = 'manual' | 'schedule' | 'retry'

export interface SiteIntelligenceCrawlWorkflowPayload {
  kind: typeof SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND
  runId: string
  domainId: string
  clientId: string
  trigger: SiteIntelligenceCrawlWorkflowTrigger
  requestedBy?: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function normalizeSiteIntelligenceCrawlWorkflowPayload(
  input: unknown
): SiteIntelligenceCrawlWorkflowPayload {
  const body = objectInput(input)
  const kind = requiredText(body.kind, 'kind')
  if (kind !== SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND) {
    throw new Error(`Unsupported workflow kind: ${kind}`)
  }

  const runId = requiredUuid(body.runId, 'runId')
  const domainId = requiredUuid(body.domainId, 'domainId')
  const clientId = requiredUuid(body.clientId, 'clientId')
  const trigger = normalizeTrigger(body.trigger)
  const requestedBy = optionalUuid(body.requestedBy, 'requestedBy')

  return {
    kind: SITE_INTELLIGENCE_CRAWL_WORKFLOW_KIND,
    runId,
    domainId,
    clientId,
    trigger,
    ...(requestedBy ? { requestedBy } : {})
  }
}

export function buildSiteIntelligenceCrawlWorkflowInstanceId(
  payload: SiteIntelligenceCrawlWorkflowPayload
): string {
  return `site-intel-${payload.runId}`
}

function normalizeTrigger(input: unknown): SiteIntelligenceCrawlWorkflowTrigger {
  const value = requiredText(input, 'trigger')
  if (value === 'manual' || value === 'schedule' || value === 'retry') return value
  throw new Error(`Unsupported trigger: ${value}`)
}

function requiredUuid(input: unknown, field: string): string {
  const value = requiredText(input, field)
  if (!UUID_PATTERN.test(value)) throw new Error(`${field} must be a UUID`)
  return value.toLowerCase()
}

function optionalUuid(input: unknown, field: string): string | undefined {
  const value = optionalText(input)
  if (!value) return undefined
  if (!UUID_PATTERN.test(value)) throw new Error(`${field} must be a UUID`)
  return value.toLowerCase()
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
