import { describe, expect, it, vi } from 'vitest'

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
    const rejectedFetch = vi.fn(async () => { throw new Error('network access is forbidden') })
    vi.stubGlobal('fetch', rejectedFetch)
    let first: ReturnType<typeof adapter.matches>
    let second: ReturnType<typeof adapter.matches>
    let extraction: ReturnType<typeof adapter.extract>
    try {
      first = adapter.matches(email, adapter.id)
      second = adapter.matches(email, adapter.id)
      extraction = adapter.extract(email)
      expect(rejectedFetch).not.toHaveBeenCalled()
    }
    finally {
      vi.unstubAllGlobals()
    }
    expect(adapter.id).toMatch(/^[a-z][a-z0-9_-]+$/)
    expect(adapter.priority).toBeGreaterThan(0)
    expect(first).toEqual(second)
    expect(email).toEqual(before)
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

  it('rejects sender substrings and display-name spoofs while accepting only exact provider domains', () => {
    const registry = registerProviderAdapters(allEmailProviderAdapters)
    expect(registry.match({ ...email, envelopeSender: 'lead@carsales.example.evil', headerFrom: 'Carsales <lead@evil.example>' }, null)).toBeNull()
    expect(registry.match({ ...email, envelopeSender: 'lead@evil.example', headerFrom: 'Carsales <lead@evil.example>' }, null)).toBeNull()
    expect(registry.match({ ...email, envelopeSender: 'lead@carsales.example', headerFrom: 'Carsales <lead@carsales.example>' }, null)?.adapter.id).toBe('carsales')
  })

  it('keeps accepted ADF fields intact instead of allowing lower-priority provider extraction to overwrite them', async () => {
    const { parseEmailLead } = await import('../../shared/leads/email/parser')
    const extraction = parseEmailLead({
      ...email,
      text: '<adf><prospect><id>adf-1</id><customer><contact><email>adf@example.test</email><phone>+61400123456</phone></contact><comments>New Facebook Lead Email: overridden@example.test</comments></customer></prospect></adf>'
    }, { schemaVersion: 1, parserMode: 'auto', aiExtractionMode: 'disabled', expectedProvider: 'meta', allowedSenderDomains: [], maxRawBytes: 1024, maxAdfAttachmentBytes: 1024 })
    expect(extraction?.parser).toBe('adf')
    expect(extraction?.fields.email?.value).toBe('adf@example.test')
  })

  it('rejects duplicate IDs and priorities and resolves equal evidence by priority', () => {
    const adapter = allEmailProviderAdapters[0]!
    expect(() => registerProviderAdapters([adapter, { ...adapter }])).toThrow(/duplicate.*id/i)
    expect(() => registerProviderAdapters([adapter, { ...allEmailProviderAdapters[1]!, priority: adapter.priority }])).toThrow(/duplicate.*priority/i)
    const registry = registerProviderAdapters([...allEmailProviderAdapters].reverse())
    expect(registry.adapters.map(item => item.priority)).toEqual([...registry.adapters].map(item => item.priority).sort((a, b) => a - b))
    expect(registry.match(email, null)).toBeNull()
  })

  it('keeps configured provider and exact sender evidence authoritative over customer body markers', () => {
    const registry = registerProviderAdapters(allEmailProviderAdapters)
    const conflicted = { ...email, envelopeSender: 'no-reply@carsales.example', subject: 'Carsales enquiry', text: 'New Facebook Lead\nName: Alex Example\nLead ID: meta-42' }
    expect(registry.match(conflicted, 'carsales')?.adapter.id).toBe('carsales')
  })

  it('uses an expected provider as the classification constraint when body markers conflict', () => {
    const registry = registerProviderAdapters(allEmailProviderAdapters)
    const ambiguous = { ...email, text: 'Carsales AutoTrader lead\nName: Alex Example\nPhone: +61 400 123 456' }
    expect(registry.match(ambiguous, null)?.adapter.id).toBe('carsales')
    expect(registry.match(ambiguous, 'autotrader')?.adapter.id).toBe('autotrader')
  })
})
