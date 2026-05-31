// server/utils/anomalyDetection/types.ts

export type AnomalySeverity = 'critical' | 'warning' | 'info'

export type AnomalyType =
  | 'profitability' | 'revenue' | 'expenses' | 'cashflow'
  | 'receivables' | 'budget' | 'adspend' | 'clients' | 'transactions' | 'ga4'

export type AnomalyStatus =
  | 'open' | 'acknowledged' | 'snoozed' | 'resolved' | 'dismissed'

export type AnomalyEvent =
  | 'detected' | 're-detected' | 'acknowledged' | 'snoozed'
  | 'resolved' | 'dismissed' | 'reopened' | 'assigned'
  | 'narrative-generated' | 'unsnoozed'

export interface AnomalyMetric {
  label: string
  value: number
  format: 'currency' | 'percent' | 'number'
}

export interface AnomalyContext {
  period?: string
  range?: { from?: string | null; to?: string | null }
  category?: string
  vendor?: string
  client?: string
  account?: string
}

export interface DetectedAnomaly {
  fingerprint: string
  type: AnomalyType
  severity: AnomalySeverity
  title: string
  description: string
  metric?: AnomalyMetric
  comparison?: AnomalyMetric & { trend?: 'up' | 'down' }
  context?: AnomalyContext
  recommendation?: string
  tags?: string[]
  dataSources: string[]
  groupKey?: string
}

export interface SharedData {
  pnl: any | null
  expenses: any | null
  bankMonitoring: any | null
  cashForecast: any | null
  aging: any | null
  budgetVariance: any | null
  // P2: filled by adspend / clients / transactions analysers in Phase 2
  mediaSpend: any | null
  clientRevenue: any | null
  invoiceLines: any | null
  // GA4 daily channel rows (last ~31 days) for the ga4 analyser
  ga4Channel: any | null
}

export interface AnalyserContext {
  tenantId: string
  data: SharedData
  now: Date
}

export type Analyser = (ctx: AnalyserContext) => Promise<DetectedAnomaly[]>

// Persisted row shape (DB → API)
export interface AnomalyRow {
  id: string
  tenant_id: string
  fingerprint: string
  type: AnomalyType
  severity: AnomalySeverity
  status: AnomalyStatus
  title: string
  description: string
  recommendation: string | null
  tags: string[] | null
  data_sources: string[]
  metric: AnomalyMetric | null
  comparison: (AnomalyMetric & { trend?: 'up' | 'down' }) | null
  context: AnomalyContext | null
  group_key: string | null
  driver_narrative: string | null
  driver_narrative_at: string | null
  first_detected_at: string
  last_detected_at: string
  resolved_at: string | null
  snoozed_until: string | null
  notification_sent_at: string | null
  acknowledged_by: string | null
  acknowledged_at: string | null
  assignee_id: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}
