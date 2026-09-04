import { describe, expect, it, vi } from 'vitest'
import {
  createMeasurementSignalSummaryService
} from '~~/server/utils/measurement/signalSummary'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'

describe('measurement Signal Centre summary', () => {
  it('returns aggregate signal, delivery, and identifier coverage without raw identifiers', async () => {
    const queryOne = vi.fn(async () => ({
      captured: '100',
      confirmed: '4',
      consent_granted: '60',
      policy_skipped: '40',
      delivered: '3',
      retrying: '1',
      failed: '2',
      ttclid_coverage: '12',
      ttp_coverage: '10',
      fbc_coverage: '20',
      fbp_coverage: '24',
      gclid_coverage: '31',
      gbraid_coverage: '4',
      wbraid_coverage: '3',
      freshness_at: '2026-09-04T01:02:03.000Z'
    }))
    const service = createMeasurementSignalSummaryService({ queryOne: queryOne as never })

    const result = await service.get(CLIENT_ID)

    expect(result).toEqual({
      captured: 100,
      confirmed: 4,
      consentGranted: 60,
      policySkipped: 40,
      delivered: 3,
      retrying: 1,
      failed: 2,
      identifierCoverage: {
        ttclid: 12,
        ttp: 10,
        fbc: 20,
        fbp: 24,
        gclid: 31,
        gbraid: 4,
        wbraid: 3
      },
      freshnessAt: '2026-09-04T01:02:03.000Z'
    })
    const [sql, params] = queryOne.mock.calls[0]!
    expect(sql).toContain('WHERE client_id = $1')
    expect(sql).toContain('COUNT(*) FILTER (WHERE ttclid IS NOT NULL)')
    expect(sql).toContain('COUNT(*) FILTER (WHERE ttp IS NOT NULL)')
    expect(params).toEqual([CLIENT_ID])
    expect(JSON.stringify(result)).not.toMatch(/click-1|browser-1|access.?token|credential/i)
  })

  it('rejects an invalid client boundary before querying', async () => {
    const queryOne = vi.fn()
    const service = createMeasurementSignalSummaryService({ queryOne: queryOne as never })

    await expect(service.get('not-a-client-id')).rejects.toMatchObject({
      code: 'MEASUREMENT_VALIDATION_ERROR',
      statusCode: 422
    })
    expect(queryOne).not.toHaveBeenCalled()
  })

  it('normalizes an empty aggregate row to a stable zero summary', async () => {
    const queryOne = vi.fn(async () => null)
    const service = createMeasurementSignalSummaryService({ queryOne: queryOne as never })

    await expect(service.get(CLIENT_ID)).resolves.toMatchObject({
      captured: 0,
      confirmed: 0,
      consentGranted: 0,
      policySkipped: 0,
      delivered: 0,
      retrying: 0,
      failed: 0,
      freshnessAt: null
    })
  })
})
