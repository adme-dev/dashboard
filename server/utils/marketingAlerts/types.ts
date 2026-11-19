// Shared shapes for the notify-only marketing alerts pipeline (governance plan phase 1).

export type MarketingAlertSource = 'budget_pacing' | 'anomaly' | 'google_policy' | 'spend_sync' | 'search_terms'
export type MarketingAlertSeverity = 'critical' | 'warning' | 'info'

export const MARKETING_ALERT_SOURCES: readonly MarketingAlertSource[] = [
  'budget_pacing', 'anomaly', 'google_policy', 'spend_sync', 'search_terms'
]

/** One detected condition. `dedupeKey` is stable for as long as the same condition stays open. */
export interface DetectedMarketingAlert {
  dedupeKey: string
  source: MarketingAlertSource
  kind: string
  severity: MarketingAlertSeverity
  clientId: string | null
  clientName: string | null
  platform: string | null
  accountRef: string | null
  campaignRef: string | null
  /** Plain-English, one or two sentences. */
  summary: string
  /** A question for a human to ask Claude/ChatGPT/XeroFlow chat — never an action. */
  nextStep: string
  /** The read-only MCP tool the next step relies on. */
  mcpTool: string
  /** App-relative deep link into XeroFlow. */
  deepLink: string
  evidence: Record<string, unknown>
}

/** A persisted alert row (subset used by delivery). `id` is the stable alert id phase 2/4 link to. */
export interface StoredMarketingAlert extends DetectedMarketingAlert {
  id: string
  firstDetectedAt: string
  severityChangedAt: string | null
  immediateNotifiedAt: string | null
  lastDigestAt: string | null
}

export const SEVERITY_RANK: Record<MarketingAlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
