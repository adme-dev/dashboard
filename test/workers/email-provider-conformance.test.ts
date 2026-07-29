import { describe, expect, it } from 'vitest'

import { allEmailProviderAdapters, genericAdapter } from '../../shared/leads/email/providers'
import { registerProviderAdapters } from '../../shared/leads/email/providers/registry'
import type { NormalizedInboundEmail } from '../../shared/leads/email/types'

const email: NormalizedInboundEmail = {
  transport: 'cloudflare_email_routing', envelopeRecipient: 'lead_token@example.test', envelopeSender: 'relay@example.test',
  headerFrom: 'Relay <relay@example.test>', subject: 'New lead', text: 'Name: Alex Example\nPhone: +61 400 123 456', html: null,
  messageId: '<synthetic-1@example.test>', attachments: [], receivedAt: '2026-07-29T00:00:00.000Z', rawSize: 200
}

describe('email provider adapter conformance', () => {
  it.each([...allEmailProviderAdapters, genericAdapter])('%s is deterministic, bounded, and does not mutate input', (adapter) => {
    const before = structuredClone(email)
    const first = adapter.matches(email, adapter.id)
    const second = adapter.matches(email, adapter.id)
    expect(adapter.id).toMatch(/^[a-z][a-z0-9_-]+$/)
    expect(adapter.priority).toBeGreaterThan(0)
    expect(first).toEqual(second)
    expect(email).toEqual(before)
    const extraction = adapter.extract(email)
    if (extraction) {
      expect(extraction.overallConfidence).toBeGreaterThanOrEqual(0)
      expect(extraction.overallConfidence).toBeLessThanOrEqual(1)
      for (const field of Object.values(extraction.fields)) {
        expect(field.provenance).not.toBe('ai')
        expect(field.confidence).toBeGreaterThanOrEqual(0)
        expect(field.confidence).toBeLessThanOrEqual(1)
      }
    }
  })

  it('rejects duplicate IDs and priorities and resolves equal evidence by priority', () => {
    const adapter = allEmailProviderAdapters[0]!
    expect(() => registerProviderAdapters([adapter, { ...adapter }])).toThrow(/duplicate.*id/i)
    expect(() => registerProviderAdapters([adapter, { ...allEmailProviderAdapters[1]!, priority: adapter.priority }])).toThrow(/duplicate.*priority/i)
    const registry = registerProviderAdapters([...allEmailProviderAdapters].reverse())
    expect(registry.adapters.map(item => item.priority)).toEqual([...registry.adapters].map(item => item.priority).sort((a, b) => a - b))
    expect(registry.match(email, null)).toBeNull()
  })

  it('does not let an expected-provider hint or sender spoof outrank stronger body evidence', () => {
    const registry = registerProviderAdapters(allEmailProviderAdapters)
    const conflicted = { ...email, envelopeSender: 'no-reply@carsales.example', subject: 'Carsales enquiry', text: 'New Facebook Lead\nName: Alex Example\nLead ID: meta-42' }
    expect(registry.match(conflicted, 'carsales')?.adapter.id).toBe('meta')
  })

  it('uses an expected-provider hint only as a deterministic tie-breaker for equally strong evidence', () => {
    const registry = registerProviderAdapters(allEmailProviderAdapters)
    const ambiguous = { ...email, text: 'Carsales AutoTrader lead\nName: Alex Example\nPhone: +61 400 123 456' }
    expect(registry.match(ambiguous, null)?.adapter.id).toBe('carsales')
    expect(registry.match(ambiguous, 'autotrader')?.adapter.id).toBe('autotrader')
  })
})
