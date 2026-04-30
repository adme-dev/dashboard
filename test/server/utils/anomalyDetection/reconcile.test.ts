import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DetectedAnomaly, AnomalyRow } from '~~/server/utils/anomalyDetection/types'

const mockActiveRows: AnomalyRow[] = []
const sqlLog: Array<{ sql: string; params: any[] }> = []
const notified: string[] = []

vi.mock('~~/server/utils/db', () => ({
  queryRows: vi.fn(async () => mockActiveRows),
  transaction: vi.fn(async (cb: any) => {
    const client = {
      query: vi.fn(async (sql: string, params: any[]) => {
        sqlLog.push({ sql, params })
        if (sql.startsWith('INSERT INTO anomalies')) {
          return { rows: [{ id: `row-${sqlLog.filter(s => s.sql.startsWith('INSERT INTO anomalies')).length}`, severity: params[3] }] }
        }
        return { rows: [] }
      }),
    }
    return cb(client)
  }),
}))

vi.mock('~~/server/utils/anomalyDetection/notify', () => ({
  queueAnomalyNotification: vi.fn(async (id: string) => { notified.push(id) }),
}))

import { reconcile } from '~~/server/utils/anomalyDetection/reconcile'

beforeEach(() => {
  mockActiveRows.length = 0
  sqlLog.length = 0
  notified.length = 0
})

const make = (overrides: Partial<DetectedAnomaly> = {}): DetectedAnomaly => ({
  fingerprint: 'profitability:net-loss',
  type: 'profitability',
  severity: 'critical',
  title: 'Net loss',
  description: 'Operating at a net loss',
  dataSources: ['Profit & Loss'],
  ...overrides,
})

const makeRow = (overrides: Partial<AnomalyRow> = {}): AnomalyRow => ({
  id: 'row-existing',
  tenant_id: 'tenant-A',
  fingerprint: 'profitability:net-loss',
  type: 'profitability',
  severity: 'critical',
  status: 'open',
  title: 'Net loss',
  description: 'old',
  recommendation: null,
  tags: null,
  data_sources: ['Profit & Loss'],
  metric: null, comparison: null, context: null,
  group_key: null, driver_narrative: null, driver_narrative_at: null,
  first_detected_at: '2026-04-01T00:00:00Z',
  last_detected_at: '2026-04-01T00:00:00Z',
  resolved_at: null, snoozed_until: null,
  notification_sent_at: null,
  acknowledged_by: null, acknowledged_at: null, assignee_id: null, resolution_notes: null,
  created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z',
  ...overrides,
})

describe('reconcile', () => {
  it('inserts a new row and queues notification when fingerprint is unseen and critical', async () => {
    const result = await reconcile('tenant-A', [make({})])
    const inserts = sqlLog.filter(s => s.sql.startsWith('INSERT INTO anomalies'))
    const detectedEvents = sqlLog.filter(s => s.sql.includes('INSERT INTO anomaly_events') && s.params.includes('detected'))
    expect(inserts).toHaveLength(1)
    expect(detectedEvents).toHaveLength(1)
    expect(result.inserted).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.resolved).toBe(0)
    expect(notified).toHaveLength(1)
    expect(result.notifications_queued).toBe(1)
  })

  it('does NOT queue notification for warning/info inserts', async () => {
    await reconcile('tenant-A', [
      make({ fingerprint: 'profitability:low-margin', severity: 'warning' }),
      make({ fingerprint: 'expenses:concentration', severity: 'info' }),
    ])
    expect(notified).toHaveLength(0)
  })

  it('updates last_detected_at on re-detection of an active row (no notification)', async () => {
    mockActiveRows.push(makeRow({ notification_sent_at: '2026-04-01T00:00:00Z' }))

    const result = await reconcile('tenant-A', [make({})])
    const inserts = sqlLog.filter(s => s.sql.startsWith('INSERT INTO anomalies'))
    const updates = sqlLog.filter(s => s.sql.startsWith('UPDATE anomalies'))
    const reDetectedEvents = sqlLog.filter(s => s.sql.includes('INSERT INTO anomaly_events') && s.params.includes('re-detected'))
    expect(inserts).toHaveLength(0)
    expect(updates.length).toBeGreaterThanOrEqual(1)
    expect(reDetectedEvents).toHaveLength(1)
    expect(result.updated).toBe(1)
    expect(notified).toHaveLength(0)
  })

  it('resolves an active row that is not detected this run', async () => {
    mockActiveRows.push(makeRow())

    const result = await reconcile('tenant-A', []) // no detections
    const resolveUpdates = sqlLog.filter(s =>
      s.sql.startsWith('UPDATE anomalies') && s.sql.includes("status = 'resolved'")
    )
    const resolveEvents = sqlLog.filter(s => s.sql.includes('INSERT INTO anomaly_events') && s.params.includes('resolved'))
    expect(resolveUpdates).toHaveLength(1)
    expect(resolveEvents).toHaveLength(1)
    expect(result.resolved).toBe(1)
  })

  it('flips a snoozed row back to open when snooze expired and still detected', async () => {
    mockActiveRows.push(makeRow({
      status: 'snoozed',
      snoozed_until: '2026-04-29T00:00:00Z', // expired (test "now" >= 2026-04-30)
    }))

    const result = await reconcile('tenant-A', [make({})])
    const unsnoozeEvents = sqlLog.filter(s => s.sql.includes('INSERT INTO anomaly_events') && s.params.includes('unsnoozed'))
    expect(unsnoozeEvents).toHaveLength(1)
    expect(result.unsnoozed).toBe(1)
  })

  it('keeps a snoozed row snoozed when snooze has NOT expired', async () => {
    mockActiveRows.push(makeRow({
      status: 'snoozed',
      snoozed_until: '2099-12-31T00:00:00Z', // far future
    }))

    const result = await reconcile('tenant-A', [make({})])
    const unsnoozeEvents = sqlLog.filter(s => s.sql.includes('INSERT INTO anomaly_events') && s.params.includes('unsnoozed'))
    expect(unsnoozeEvents).toHaveLength(0)
    expect(result.unsnoozed).toBe(0)
    // Still records re-detected
    expect(result.updated).toBe(1)
  })
})
