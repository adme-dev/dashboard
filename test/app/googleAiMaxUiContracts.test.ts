import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aiMaxMigrationReasonLabel,
  aiMaxReadinessTone,
  aiMaxReadinessLabel,
  aiMaxRiskLabel,
} from '~~/app/utils/googleAiMax'

const mockFetch = vi.fn()
;(globalThis as any).$fetch = (...args: any[]) => mockFetch(...args)

const { useGoogleAiMax } = await import('~~/app/composables/useGoogleAiMax')

describe('Google AI Max UI labels', () => {
  it('maps every readiness state to plain language and a Nuxt UI tone', () => {
    expect([
      'ready',
      'scheduled_upgrade',
      'needs_review',
      'not_affected',
      'unknown',
    ].map(status => ({
      label: aiMaxReadinessLabel(status as any),
      tone: aiMaxReadinessTone(status as any),
    }))).toEqual([
      { label: 'AI Max ready', tone: 'success' },
      { label: 'Upgrade scheduled', tone: 'warning' },
      { label: 'Needs review', tone: 'error' },
      { label: 'Not affected', tone: 'neutral' },
      { label: 'Unknown', tone: 'error' },
    ])
  })

  it('uses operator-facing migration and risk labels', () => {
    expect(aiMaxMigrationReasonLabel('aca_and_campaign_broad_match')).toBe(
      'Automatically created assets + campaign broad match',
    )
    expect(aiMaxRiskLabel('PARTIAL_SEARCH_MATCHING')).toBe(
      'Some ad groups disable search-term matching',
    )
  })
})

describe('useGoogleAiMax', () => {
  beforeEach(() => mockFetch.mockReset())

  it('passes normalized readiness filters to the list endpoint', async () => {
    mockFetch.mockResolvedValue({ items: [] })
    const api = useGoogleAiMax()

    await api.fetchReadiness({
      page: 2,
      pageSize: 25,
      status: 'needs_review',
      search: 'Generic',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/agency/social/google/ai-max/readiness',
      { query: { page: 2, pageSize: 25, status: 'needs_review', search: 'Generic' } },
    )
  })

  it('starts a manual scan without sending empty connection values', async () => {
    mockFetch.mockResolvedValue({ runId: 'run-1', status: 'queued', deduplicated: false })
    const api = useGoogleAiMax()

    await api.startScan()

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/agency/social/google/ai-max/scan',
      { method: 'POST', body: {} },
    )
  })

  it('builds a formula-safe server export URL from the active filters', () => {
    const api = useGoogleAiMax()

    expect(api.exportUrl({
      page: 1,
      pageSize: 25,
      status: 'needs_review',
      search: 'Brand + generic',
    })).toBe(
      '/api/agency/social/google/ai-max/export.csv?status=needs_review&search=Brand+%2B+generic',
    )
  })
})
