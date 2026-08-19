import { describe, expect, it } from 'vitest'
import { getAiGatewayGenerationPolicyStatus } from '~~/server/utils/aiGatewayGenerationPolicy'

describe('AI Gateway generation policy status', () => {
  it('does not claim spend protection without both confirmation and a positive dollar limit', () => {
    expect(getAiGatewayGenerationPolicyStatus({})).toMatchObject({ spendLimitConfirmed: false, monthlyLimitUsd: null })
    expect(getAiGatewayGenerationPolicyStatus({ AI_GATEWAY_SPEND_LIMIT_CONFIRMED: 'true' })).toMatchObject({ spendLimitConfirmed: false })
  })

  it('surfaces an explicitly attested monthly cap and the Groq retention caveat', () => {
    const status = getAiGatewayGenerationPolicyStatus({
      AI_GATEWAY_SPEND_LIMIT_CONFIRMED: 'true',
      AI_GATEWAY_GENERATION_MONTHLY_LIMIT_USD: '250',
    })
    expect(status).toMatchObject({ spendLimitConfirmed: true, monthlyLimitUsd: 250 })
    expect(status.retention.groqVisionZdrGuaranteed).toBe(false)
  })
})
