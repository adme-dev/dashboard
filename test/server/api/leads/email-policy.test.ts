import { beforeEach, describe, expect, it, vi } from 'vitest'

const { resolveToken } = vi.hoisted(() => ({ resolveToken: vi.fn() }))
vi.mock('~~/server/utils/leads/emailEndpoint', () => ({
  resolveEmailEndpointToken: resolveToken,
  hasCurrentEmailAiPrivacyApproval(endpoint: Record<string, unknown>) {
    return endpoint.ai_extraction_mode === 'fallback'
      && endpoint.ai_privacy_approval_version === 1
      && Boolean(endpoint.ai_privacy_approved_at)
      && Boolean(endpoint.ai_privacy_approved_by)
  }
}))

import { resolveEmailEndpointPolicy } from '../../../../server/utils/leads/emailIngestion'

const endpoint = {
  id: '11111111-1111-4111-8111-111111111111',
  client_id: '22222222-2222-4222-8222-222222222222',
  form_id: 'email_endpoint:11111111-1111-4111-8111-111111111111',
  form_name: 'Carsales',
  address_token: '0123456789',
  previous_address_token: 'abcdefghjk',
  previous_token_grace_until: '2099-01-01T00:00:00.000Z',
  expected_provider: 'carsales',
  parser_mode: 'auto',
  ai_extraction_mode: 'disabled',
  ai_privacy_approval_version: null,
  ai_privacy_approved_at: null,
  ai_privacy_approved_by: null,
  allowed_sender_domains: ['Notify.Carsales.com.au'],
  enabled: true,
  retired_at: null
}

describe('email endpoint policy boundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns only minimal parser and sender policy for an active endpoint', async () => {
    resolveToken.mockResolvedValueOnce(endpoint)
    const policy = await resolveEmailEndpointPolicy({ recipientToken: endpoint.address_token })

    expect(policy).toEqual({
      schemaVersion: 1,
      parserMode: 'auto',
      aiExtractionMode: 'disabled',
      expectedProvider: 'carsales',
      allowedSenderDomains: ['notify.carsales.com.au'],
      maxRawBytes: 2 * 1024 * 1024,
      maxAdfAttachmentBytes: 256 * 1024
    })
    expect(JSON.stringify(policy)).not.toMatch(/client|form|endpoint|token|0123456789/i)
  })

  it('resolves a previous token only through the authoritative grace-aware resolver', async () => {
    resolveToken.mockResolvedValueOnce(endpoint)
    await expect(resolveEmailEndpointPolicy({ recipientToken: endpoint.previous_address_token }))
      .resolves.toMatchObject({ expectedProvider: 'carsales' })
    expect(resolveToken).toHaveBeenCalledWith('abcdefghjk')
  })

  it('returns AI fallback only when approval and runtime capability are both current', async () => {
    resolveToken.mockResolvedValueOnce({
      ...endpoint,
      ai_extraction_mode: 'fallback',
      ai_privacy_approval_version: 1,
      ai_privacy_approved_at: '2026-07-29T00:00:00.000Z',
      ai_privacy_approved_by: '33333333-3333-4333-8333-333333333333'
    })

    await expect(resolveEmailEndpointPolicy(
      { recipientToken: endpoint.address_token },
      { aiExtractionAvailable: true }
    )).resolves.toMatchObject({ aiExtractionMode: 'fallback' })
  })

  it.each([
    ['missing runtime capability', {
      ai_privacy_approval_version: 1,
      ai_privacy_approved_at: '2026-07-29T00:00:00.000Z',
      ai_privacy_approved_by: '33333333-3333-4333-8333-333333333333'
    }, false],
    ['missing privacy approval', {
      ai_privacy_approval_version: null,
      ai_privacy_approved_at: null,
      ai_privacy_approved_by: null
    }, true]
  ])('fails closed when AI fallback has %s', async (_reason, approval, aiExtractionAvailable) => {
    resolveToken.mockResolvedValueOnce({
      ...endpoint,
      ai_extraction_mode: 'fallback',
      ...approval
    })

    await expect(resolveEmailEndpointPolicy(
      { recipientToken: endpoint.address_token },
      { aiExtractionAvailable }
    )).resolves.toMatchObject({ aiExtractionMode: 'disabled' })
  })

  it.each(['expired previous token', 'disabled endpoint', 'retired endpoint'])(
    'reveals no tenant details for an unavailable %s',
    async () => {
      resolveToken.mockResolvedValueOnce(null)
      await expect(resolveEmailEndpointPolicy({ recipientToken: '0123456789' }))
        .rejects.toMatchObject({ statusCode: 404, statusMessage: 'email_endpoint_unavailable' })
    }
  )
})
