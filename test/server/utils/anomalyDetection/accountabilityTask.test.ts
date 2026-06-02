import { describe, it, expect } from 'vitest'
import { buildTaskPayload } from '~~/server/utils/anomalyDetection/accountabilityTask'

describe('buildTaskPayload', () => {
  const anomaly = {
    id: 'a1', title: 'Mornington Nissan (google_ads) underspending',
    description: '$312 of an expected $2,750 — $2,438 behind pace.', fingerprint: 'adspend:underspend-m1-2026-06',
  }

  it('produces a high-priority task due ~24h out', () => {
    const now = new Date('2026-06-02T00:00:00Z')
    const p = buildTaskPayload(anomaly, now)
    expect(p.priority).toBe('high')
    expect(p.title).toContain('Mornington Nissan')
    expect(p.dueDate).toBe('2026-06-03')
    expect(p.description).toContain('adspend:underspend-m1-2026-06')
    expect(p.description).toContain('$2,438 behind pace')
  })

  it('truncates the title to 255 chars', () => {
    const long = { ...anomaly, title: 'x'.repeat(400) }
    expect(buildTaskPayload(long, new Date()).title.length).toBeLessThanOrEqual(255)
  })
})
