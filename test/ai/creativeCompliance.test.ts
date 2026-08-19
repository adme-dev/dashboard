import { describe, expect, it, vi } from 'vitest'
import {
  assertCreativeComplianceImageMetadata,
  creativeCompliancePassed,
  normalizeCreativeComplianceVerdict,
  requestCreativeComplianceVerdict,
} from '~~/server/utils/creativeCompliance'

const passing = {
  vehicleMatchesReference: true,
  badgeVisibleAndCorrect: true,
  disclaimerPresent: true,
  priceMatchesBrief: true,
  logoPresentUndistorted: true,
  artefactsDetected: false,
  confidence: 0.96,
  notes: 'All checks passed.',
}

describe('creative compliance pre-flight', () => {
  it('enforces Groq image type and 20 MB limits before provider dispatch', () => {
    expect(() => assertCreativeComplianceImageMetadata({ size: 20 * 1024 * 1024, contentType: 'image/png' })).not.toThrow()
    expect(() => assertCreativeComplianceImageMetadata({ size: 20 * 1024 * 1024 + 1, contentType: 'image/png' })).toThrow(/20 MB/)
    expect(() => assertCreativeComplianceImageMetadata({ size: 100, contentType: 'application/pdf' })).toThrow(/must be images/)
  })

  it('normalizes a complete verdict and requires every positive control', () => {
    expect(normalizeCreativeComplianceVerdict(passing)).toEqual(passing)
    expect(creativeCompliancePassed(passing)).toBe(true)
    expect(creativeCompliancePassed({ ...passing, priceMatchesBrief: false })).toBe(false)
    expect(creativeCompliancePassed({ ...passing, confidence: 0.74 })).toBe(false)
  })

  it('rejects partial or unbounded provider output instead of guessing', () => {
    expect(() => normalizeCreativeComplianceVerdict({ confidence: 0.9 })).toThrow(/missing boolean/)
    expect(() => normalizeCreativeComplianceVerdict({ ...passing, confidence: 2 })).toThrow(/outside 0-1/)
  })

  it('requires an approved reference for vehicle checks', async () => {
    await expect(requestCreativeComplianceVerdict({
      subjectType: 'vehicle', imageUrls: ['https://assets.test/output.png'],
    }, { gatewayUrl: 'https://gateway.ai.cloudflare.com/v1/acct/default', groqApiKey: 'test' }))
      .rejects.toThrow(/approved reference/)
  })

  it('uses Qwen JSON mode through the Cloudflare Groq gateway', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(passing) } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } })) as any
    await expect(requestCreativeComplianceVerdict({
      subjectType: 'vehicle',
      imageUrls: ['https://assets.test/output.png', 'https://assets.test/master.png'],
      expectedClaims: { price: '$107,000 + GST' },
    }, {
      gatewayUrl: 'https://gateway.ai.cloudflare.com/v1/acct/default',
      gatewayAuthToken: 'gateway-token',
      groqApiKey: 'groq-token',
      fetchImpl,
    })).resolves.toEqual(passing)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('https://gateway.ai.cloudflare.com/v1/acct/default/groq/chat/completions')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer groq-token',
      'cf-aig-authorization': 'Bearer gateway-token',
    })
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'qwen/qwen3.6-27b',
      response_format: { type: 'json_object' },
    })
  })
})
