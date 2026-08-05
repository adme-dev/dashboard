import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildGoogleAiMaxState,
  type GoogleAiMaxCampaignState,
  type GoogleAiMaxObservation,
} from '~~/server/utils/googleAiMax'

const mockClientQuery = vi.fn()
const mockTransaction = vi.fn(async (callback: any) => callback({ query: mockClientQuery }))

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: any[]) => mockTransaction(...args),
}))

const { persistGoogleAiMaxCampaignStates } = await import(
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
