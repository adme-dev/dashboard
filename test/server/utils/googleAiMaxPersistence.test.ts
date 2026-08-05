import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildGoogleAiMaxState,
  type GoogleAiMaxCampaignState,
  type GoogleAiMaxObservation,
} from '~~/server/utils/googleAiMax'

const mockClientQuery = vi.fn()
const mockTransaction = vi.fn(async (callback: any) => callback({ query: mockClientQuery }))
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: any[]) => mockTransaction(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
  execute: (...args: any[]) => mockExecute(...args),
}))

const {
  claimGoogleAiMaxScanRun,
  finishGoogleAiMaxScanRun,
  markGoogleAiMaxScanRunRunning,
  getActiveGoogleAiMaxScanRun,
  getGoogleAiMaxScanRun,
  persistGoogleAiMaxCampaignStates,
} = await import(
  '~~/server/utils/googleAiMaxRepository'
)

function campaignState(
  overrides: Partial<GoogleAiMaxObservation> = {},
): GoogleAiMaxCampaignState {
  return buildGoogleAiMaxState({
    apiVersion: 'v23',
    tenantId: 'tenant-a',
    connectionId: '00000000-0000-4000-8000-000000000001',
    customerId: '1234567890',
    campaignId: '456',
    campaignName: 'Search - Generic',
    campaignStatus: 'ENABLED',
    advertisingChannelType: 'SEARCH',
    biddingStrategyType: 'MAXIMIZE_CONVERSIONS',
    keywordMatchType: 'UNSPECIFIED',
    aiMaxEnabled: false,
    bundlingRequired: 'NOT_REQUIRED',
    textAssetAutomationStatus: 'OPTED_OUT',
    finalUrlExpansionStatus: 'OPTED_OUT',
    adGroupCount: 2,
    searchTermMatchingDisabledAdGroupCount: 0,
    observedAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  })
}

describe('persistGoogleAiMaxCampaignStates', () => {
  beforeEach(() => {
    mockClientQuery.mockReset()
    mockTransaction.mockClear()
    mockQueryOne.mockReset()
    mockExecute.mockReset()
  })

  it('creates current state and one first_seen event for a first observation', async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, raw_evidence')) return { rows: [] }
      if (sql.includes('INSERT INTO google_ai_max_campaign_state')) {
        return { rows: [{ id: 'state-1' }] }
      }
      return { rows: [] }
    })

    const result = await persistGoogleAiMaxCampaignStates({
      scanRunId: 'run-1',
      states: [campaignState()],
    })

    expect(result).toEqual({
      inserted: 1,
      refreshed: 0,
      changed: 0,
      events: [{
        campaignId: '456',
        eventType: 'first_seen',
        changedFields: [],
      }],
    })
    expect(mockClientQuery.mock.calls.filter(
      call => String(call[0]).includes('INSERT INTO google_ai_max_state_events'),
    )).toHaveLength(1)
  })

  it('refreshes identical evidence without creating a state event', async () => {
    const previous = campaignState({ observedAt: '2026-08-05T00:00:00.000Z' })
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, raw_evidence')) {
        return {
          rows: [{
            id: 'state-1',
            raw_evidence: previous,
            last_changed_at: previous.observedAt,
          }],
        }
      }
      return { rows: [] }
    })

    const result = await persistGoogleAiMaxCampaignStates({
      scanRunId: 'run-2',
      states: [campaignState()],
    })

    expect(result).toEqual({ inserted: 0, refreshed: 1, changed: 0, events: [] })
    expect(mockClientQuery.mock.calls.some(
      call => String(call[0]).includes('INSERT INTO google_ai_max_state_events'),
    )).toBe(false)
  })

  it('records one classification event for a material change', async () => {
    const previous = campaignState({ observedAt: '2026-08-05T00:00:00.000Z' })
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, raw_evidence')) {
        return {
          rows: [{
            id: 'state-1',
            raw_evidence: JSON.stringify(previous),
            last_changed_at: previous.observedAt,
          }],
        }
      }
      return { rows: [] }
    })

    const result = await persistGoogleAiMaxCampaignStates({
      scanRunId: 'run-3',
      states: [campaignState({ aiMaxEnabled: true })],
    })

    expect(result.changed).toBe(1)
    expect(result.events).toEqual([{
      campaignId: '456',
      eventType: 'classification_changed',
      changedFields: ['aiMaxEnabled', 'readinessStatus', 'searchTermMatching'],
    }])
  })

  it.each([
    {
      label: 'became unknown',
      previous: campaignState({ observedAt: '2026-08-05T00:00:00.000Z' }),
      current: campaignState({ keywordMatchType: null }),
      eventType: 'became_unknown',
    },
    {
      label: 'recovered',
      previous: campaignState({
        keywordMatchType: null,
        observedAt: '2026-08-05T00:00:00.000Z',
      }),
      current: campaignState(),
      eventType: 'recovered',
    },
  ])('distinguishes when evidence $label', async ({ previous, current, eventType }) => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT id, raw_evidence')) {
        return {
          rows: [{
            id: 'state-1',
            raw_evidence: previous,
            last_changed_at: previous.observedAt,
          }],
        }
      }
      return { rows: [] }
    })

    const result = await persistGoogleAiMaxCampaignStates({
      scanRunId: 'run-transition',
      states: [current],
    })

    expect(result.events[0]?.eventType).toBe(eventType)
  })

  it('rejects mixed tenant or connection state before opening a transaction', async () => {
    await expect(persistGoogleAiMaxCampaignStates({
      scanRunId: 'run-4',
      states: [
        campaignState(),
        campaignState({ campaignId: '789', tenantId: 'tenant-b' }),
      ],
    })).rejects.toThrow('same tenant and connection')

    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('propagates transaction failure without reporting a partial write', async () => {
    mockTransaction.mockRejectedValueOnce(new Error('database unavailable'))

    await expect(persistGoogleAiMaxCampaignStates({
      scanRunId: 'run-5',
      states: [campaignState()],
    })).rejects.toThrow('database unavailable')
  })
})

describe('Google AI Max scan-run lifecycle', () => {
  beforeEach(() => {
    mockQueryOne.mockReset()
    mockExecute.mockReset()
  })

  it('claims one active run per tenant and returns null for an overlap', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'run-1', status: 'queued' })
      .mockResolvedValueOnce(null)

    const first = await claimGoogleAiMaxScanRun({
      tenantId: 'tenant-a',
      trigger: 'manual',
      requestedBy: 'user-a',
      totalConnections: 2,
    })
    const overlap = await claimGoogleAiMaxScanRun({
      tenantId: 'tenant-a',
      trigger: 'scheduled',
      totalConnections: 2,
    })

    expect(first).toEqual({ id: 'run-1', status: 'queued' })
    expect(overlap).toBeNull()
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain(
      "ON CONFLICT (tenant_id) WHERE status IN ('queued', 'running') DO NOTHING",
    )
  })

  it('only starts a queued run inside its tenant scope', async () => {
    mockExecute.mockResolvedValueOnce(1)

    await expect(markGoogleAiMaxScanRunRunning({
      runId: 'run-1',
      tenantId: 'tenant-a',
      startedAt: '2026-08-06T00:00:00.000Z',
    })).resolves.toBe(true)

    expect(String(mockExecute.mock.calls[0]?.[0])).toContain("status = 'queued'")
    expect(mockExecute.mock.calls[0]?.[1]).toEqual([
      'run-1',
      'tenant-a',
      '2026-08-06T00:00:00.000Z',
    ])
  })

  it.each([
    { processed: 2, failures: [], expected: 'completed' },
    { processed: 1, failures: [{ connectionId: 'connection-b', error: 'denied' }], expected: 'partial' },
    { processed: 0, failures: [{ connectionId: 'connection-a', error: 'denied' }], expected: 'failed' },
  ])('finishes a run as $expected', async ({ processed, failures, expected }) => {
    mockQueryOne.mockResolvedValueOnce({ id: 'run-1', status: expected })

    const result = await finishGoogleAiMaxScanRun({
      runId: 'run-1',
      tenantId: 'tenant-a',
      finishedAt: '2026-08-06T00:05:00.000Z',
      processedConnections: processed,
      totalCampaigns: 4,
      affectedCampaigns: 2,
      unknownCampaigns: 1,
      failures,
    })

    expect(result?.status).toBe(expected)
    expect(mockQueryOne.mock.calls[0]?.[1]).toContain(expected)
  })

  it('looks up active and historical runs inside the tenant boundary', async () => {
    mockQueryOne
      .mockResolvedValueOnce({ id: 'run-active', status: 'running' })
      .mockResolvedValueOnce({
        id: 'run-1',
        status: 'partial',
        trigger: 'manual',
        total_connections: 2,
        processed_connections: 1,
        total_campaigns: 4,
        affected_campaigns: 2,
        unknown_campaigns: 1,
        failures: [{ connectionId: 'connection-b', error: 'denied Bearer abc.def' }],
        started_at: '2026-08-06T00:00:00.000Z',
        finished_at: '2026-08-06T00:01:00.000Z',
        created_at: '2026-08-06T00:00:00.000Z',
      })

    await expect(getActiveGoogleAiMaxScanRun('tenant-a')).resolves.toEqual({
      id: 'run-active',
      status: 'running',
    })
    await expect(getGoogleAiMaxScanRun('tenant-a', 'run-1')).resolves.toMatchObject({
      id: 'run-1',
      status: 'partial',
      totalConnections: 2,
      processedConnections: 1,
      failures: [{ connectionId: 'connection-b', error: 'denied Bearer [REDACTED]' }],
    })
    expect(mockQueryOne.mock.calls[1]?.[1]).toEqual(['tenant-a', 'run-1'])
  })
})
