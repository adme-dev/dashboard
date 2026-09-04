import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('scripts/verify-werribee-measurement.mjs', 'utf8')

describe('Werribee measurement readiness script contract', () => {
  it('covers every test-mode activation gate without embedding credentials', () => {
    expect(source).toContain('consentGranted')
    expect(source).toContain('confirmedConversions')
    expect(source).toContain('deduplication')
    expect(source).toContain('destinationHealth')
    expect(source).toContain('redaction')
    expect(source).not.toContain('TIKTOK_ACCESS_TOKEN=')
    expect(source).not.toMatch(/console\.(?:log|error)\([^\n]*(?:response|payload|body)/)
  })

  it('requires bounded, file-backed authentication and test-safe endpoints', () => {
    expect(source).toContain('MEASUREMENT_BASE_URL')
    expect(source).toContain('MEASUREMENT_CLIENT_ID')
    expect(source).toContain('MEASUREMENT_AUTH_FILE')
    expect(source).toContain("platform', 'tiktok")
    expect(source).toContain("limit', '100")
    expect(source).toContain("profile.environment === 'test'")
    expect(source).toContain('destination.enabled === false')
  })

  it('passes only with consented TikTok context, confirmed conversions, unique lineage, and fresh destination evidence', async () => {
    const { evaluateReadiness } = await import('../../scripts/verify-werribee-measurement.mjs')
    const now = new Date('2026-09-04T06:00:00.000Z')
    const responses = {
      summary: {
        captured: 3,
        confirmed: 1,
        consentGranted: 2,
        policySkipped: 1,
        delivered: 1,
        retrying: 0,
        failed: 0,
        identifierCoverage: { ttclid: 1, ttp: 1, fbc: 0, fbp: 0, gclid: 0, gbraid: 0, wbraid: 0 },
        freshnessAt: '2026-09-04T05:59:00.000Z'
      },
      readiness: { profile: { environment: 'test' } },
      destinations: {
        items: [{
          id: '10000000-0000-4000-8000-000000000001',
          platform: 'tiktok',
          environment: 'test',
          enabled: false,
          healthStatus: 'ready',
          lastSuccessAt: '2026-09-04T05:55:00.000Z',
          capabilities: [{
            mode: 'tiktok_events_api',
            status: 'ready',
            evidenceAt: '2026-09-04T05:55:00.000Z'
          }]
        }]
      },
      lineage: {
        items: [{
          eventId: '20000000-0000-4000-8000-000000000001',
          eventName: 'lead_created',
          consentState: 'granted',
          destination: { id: '10000000-0000-4000-8000-000000000001', platform: 'tiktok' },
          outcome: 'accepted',
          receiptId: 'request-safe-1'
        }]
      }
    }

    expect(evaluateReadiness(responses, now)).toEqual([
      expect.objectContaining({ key: 'consentGranted', ok: true }),
      expect.objectContaining({ key: 'confirmedConversions', ok: true }),
      expect.objectContaining({ key: 'deduplication', ok: true }),
      expect.objectContaining({ key: 'destinationHealth', ok: true }),
      expect.objectContaining({ key: 'redaction', ok: true })
    ])
  })

  it('fails deduplication and redaction without echoing the unsafe values', async () => {
    const { evaluateReadiness } = await import('../../scripts/verify-werribee-measurement.mjs')
    const responses = {
      summary: {
        captured: 1,
        confirmed: 1,
        consentGranted: 1,
        identifierCoverage: { ttclid: 1, ttp: 0 }
      },
      readiness: { profile: { environment: 'test' } },
      destinations: { items: [] },
      lineage: {
        items: [
          { eventId: 'same', eventName: 'lead_created', destination: null, email: 'unsafe@example.com' },
          { eventId: 'same', eventName: 'lead_created', destination: null, email: 'unsafe@example.com' }
        ]
      }
    }

    const results = evaluateReadiness(responses, new Date('2026-09-04T06:00:00.000Z'))
    expect(results.find(result => result.key === 'deduplication')).toMatchObject({ ok: false })
    const redaction = results.find(result => result.key === 'redaction')
    expect(redaction).toMatchObject({ ok: false })
    expect(JSON.stringify(redaction)).not.toContain('unsafe@example.com')
  })
})
