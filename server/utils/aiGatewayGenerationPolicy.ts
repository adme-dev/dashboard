export interface AiGatewayGenerationPolicyStatus {
  spendLimitRequired: true
  spendLimitConfirmed: boolean
  monthlyLimitUsd: number | null
  retention: {
    unifiedBillingZdrProviders: string[]
    groqVisionZdrGuaranteed: false
    note: string
  }
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Operator-attested state only. Cloudflare enforces the real cap at the Gateway;
 * XeroFlow surfaces whether that production control has been explicitly confirmed.
 */
export function getAiGatewayGenerationPolicyStatus(env: Record<string, unknown> = {}): AiGatewayGenerationPolicyStatus {
  const monthlyLimitUsd = positiveNumber(env.AI_GATEWAY_GENERATION_MONTHLY_LIMIT_USD)
  const spendLimitConfirmed = String(env.AI_GATEWAY_SPEND_LIMIT_CONFIRMED || '').toLowerCase() === 'true'
    && monthlyLimitUsd !== null
  return {
    spendLimitRequired: true,
    spendLimitConfirmed,
    monthlyLimitUsd,
    retention: {
      unifiedBillingZdrProviders: ['openai', 'anthropic'],
      groqVisionZdrGuaranteed: false,
      note: 'Groq vision inputs are not covered by Cloudflare Unified Billing ZDR; confirm client/OEM data terms before portfolio-scale use.',
    },
  }
}
