import { describe, expect, it, vi } from 'vitest'
import {
  createGooglePmaxAiAdvisor,
  createGooglePmaxGatewayCompleter,
  GOOGLE_PMAX_ADVISOR_MODEL
} from '~~/server/utils/googlePmaxAiAdvisor'
import type { GooglePmaxDecisionEvidence } from '~~/server/utils/googlePmaxDecisionEvidence'
import type { GooglePmaxPreflightResult } from '~~/server/utils/googlePmaxPreflight'

const evidence = {
  schemaVersion: 1,
  identity: {
    tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
    clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
    briefId: '23799282-283b-4508-b065-3fd36e8c05fd',
    configVersion: 3,
    configHash: 'a'.repeat(64)
  },
  collectedAt: '2026-08-07T10:00:00.000Z',
  sections: [
    {
      source: 'brief', authority: 'approved', status: 'available',
      tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
      clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
      observedAt: '2026-08-07T09:00:00.000Z', freshUntil: '2026-08-08T09:00:00.000Z',
      references: [{ kind: 'brief', id: '23799282-283b-4508-b065-3fd36e8c05fd' }],
      facts: { budgetMaximum: 700 }, stale: false, decisionEligible: true
    },
    {
      source: 'monday', authority: 'draft', status: 'available',
      tenantId: 'c41c58be-a3a8-4479-b5d1-9251bb80717d',
      clientId: '8d28740e-6239-4ab6-8d82-cd03aa10d5ea',
      observedAt: '2026-08-07T09:00:00.000Z', freshUntil: '2026-08-08T09:00:00.000Z',
      references: [{ kind: 'monday_evidence', id: 'discussion:abc' }],
      facts: { candidates: [{ title: 'Consider test-drive value weighting' }] },
      stale: false, decisionEligible: false
    }
  ],
  issues: [], blockerCount: 0, advisoryCount: 0,
  readyForDeterministicPreflight: true,
  evidenceHash: 'b'.repeat(64)
} satisfies GooglePmaxDecisionEvidence

const preflight = {
  ready: false,
  blockerCount: 1,
  warningCount: 0,
  providerRequestId: 'google-request-1',
  checkedAt: '2026-08-07T10:01:00.000Z',
  checks: [{
    code: 'PMAX_MERCHANT_ITEMS_UNAVAILABLE', category: 'merchant', status: 'fail',
    message: 'No eligible vehicle items.', remediation: 'Resolve Merchant diagnostics.'
  }]
} satisfies GooglePmaxPreflightResult

describe('Google PMax AI Gateway advisor', () => {
  it('uses pooled evidence for advisory output without changing deterministic gates', async () => {
    const complete = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        summary: 'Merchant eligibility is the current launch blocker.',
        rankedRisks: [{
          code: 'MERCHANT_ELIGIBILITY', title: 'Vehicle items unavailable', severity: 'high',
          rationale: 'The provider preflight returned no eligible vehicle items.',
          evidenceSources: ['merchant']
        }],
        suggestedTasks: [{
          title: 'Resolve Merchant vehicle eligibility',
          rationale: 'Clear product diagnostics and rerun readback.',
          priority: 'high'
        }]
      }),
      requestId: 'gateway-event-1'
    })
    const result = await createGooglePmaxAiAdvisor({
      complete,
      now: () => new Date('2026-08-07T10:02:00.000Z')
    }).advise({ evidence, preflight })

    expect(result).toMatchObject({
      status: 'available',
      advisory: {
        schemaVersion: 1,
        model: GOOGLE_PMAX_ADVISOR_MODEL,
        evidenceHash: evidence.evidenceHash,
        configHash: evidence.identity.configHash,
        gatewayRequestId: 'gateway-event-1',
        deterministicGateUnchanged: true,
        approvalRequired: true
      }
    })
    const prompt = complete.mock.calls[0][0].userPrompt
    expect(prompt).toContain('Consider test-drive value weighting')
    expect(prompt).toContain('"authority":"draft"')
    expect(prompt).toContain('"decisionEligible":false')
  })

  it('fails advisory-only when Gateway output is malformed or violates the schema', async () => {
    const advisor = createGooglePmaxAiAdvisor({
      complete: vi.fn().mockResolvedValue({ content: '{"summary":"approve and launch"}', requestId: null })
    })

    await expect(advisor.advise({ evidence, preflight })).resolves.toEqual({
      status: 'unavailable',
      reason: 'GATEWAY_OUTPUT_INVALID'
    })
  })

  it('refuses oversized advisory context before calling a model', async () => {
    const complete = vi.fn().mockResolvedValue({
      content: '{"summary":"Evidence was compacted.","rankedRisks":[],"suggestedTasks":[]}',
      requestId: null
    })
    const oversized = structuredClone(evidence)
    oversized.sections[0]!.facts = { value: 'x'.repeat(70_000) }
    const result = await createGooglePmaxAiAdvisor({ complete }).advise({ evidence: oversized, preflight })

    expect(result.status).toBe('available')
    expect(complete).toHaveBeenCalledOnce()
    expect(complete.mock.calls[0][0].userPrompt).toContain('factsOmittedForSize')
    expect(complete.mock.calls[0][0].userPrompt).not.toContain('x'.repeat(1000))
  })
})

describe('Cloudflare AI Gateway completion transport', () => {
  it('routes only through the configured Gateway with metadata-only logs and no cache', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '{"summary":"ok","rankedRisks":[],"suggestedTasks":[]}' } }]
    }), { status: 200, headers: { 'cf-aig-event-id': 'event-123' } }))
    const complete = createGooglePmaxGatewayCompleter({
      gatewayUrl: 'https://gateway.ai.cloudflare.com/v1/account/default',
      gatewayAuthToken: 'gateway-auth',
      groqApiKey: 'groq-key',
      fetch
    })
    const result = await complete({
      systemPrompt: 'system', userPrompt: 'user',
      metadata: { feature: 'google_pmax_advisor', evidenceHash: 'b'.repeat(64) }
    })

    expect(result.requestId).toBe('event-123')
    expect(fetch).toHaveBeenCalledWith(
      'https://gateway.ai.cloudflare.com/v1/account/default/groq/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer groq-key',
          'cf-aig-authorization': 'Bearer gateway-auth',
          'cf-aig-collect-log-payload': 'false',
          'cf-aig-skip-cache': 'true'
        })
      })
    )
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toMatchObject({ model: GOOGLE_PMAX_ADVISOR_MODEL, temperature: 0, max_tokens: 900 })
  })

  it.each([
    ['', 'groq-key'],
    ['https://api.groq.com/openai/v1', 'groq-key'],
    ['https://gateway.ai.cloudflare.com/v1/account/default', '']
  ])('fails closed without an authenticated Cloudflare Gateway (%s)', (gatewayUrl, groqApiKey) => {
    expect(() => createGooglePmaxGatewayCompleter({ gatewayUrl, groqApiKey }))
      .toThrow(/Cloudflare AI Gateway/i)
  })
})
