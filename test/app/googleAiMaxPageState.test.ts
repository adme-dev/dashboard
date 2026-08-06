import { describe, expect, it } from 'vitest'
import {
  buildAiMaxApiFilters,
  buildAiMaxRouteQuery,
  normalizeAiMaxRouteFilters,
} from '~~/app/utils/googleAiMaxPageState'

describe('Google AI Max page filter state', () => {
  it('normalizes unknown route values to safe UI sentinels', () => {
    expect(normalizeAiMaxRouteFilters({
      page: '3',
      status: 'needs_review',
      migrationReason: 'invalid',
      connectionId: 'not-a-uuid',
      search: '  Hilux ',
    })).toEqual({
      page: 3,
      pageSize: 25,
      status: 'needs_review',
      migrationReason: 'all',
      stale: 'all',
      campaignStatus: 'all',
      connectionId: 'all',
      clientId: 'all',
      search: 'Hilux',
    })
  })

  it('removes UI sentinels before calling the API', () => {
    expect(buildAiMaxApiFilters({
      page: 1,
      pageSize: 25,
      status: 'all',
      migrationReason: 'aca',
      stale: 'all',
      campaignStatus: 'ENABLED',
      connectionId: 'all',
      clientId: 'all',
      search: '',
    })).toEqual({ page: 1, pageSize: 25, migrationReason: 'aca', campaignStatus: 'ENABLED' })
  })

  it('keeps URLs compact and omits defaults', () => {
    expect(buildAiMaxRouteQuery({
      page: 1,
      pageSize: 25,
      status: 'unknown',
      migrationReason: 'all',
      stale: 'critical',
      campaignStatus: 'all',
      connectionId: 'all',
      clientId: 'all',
      search: '',
    })).toEqual({ status: 'unknown', stale: 'critical' })
  })
})
