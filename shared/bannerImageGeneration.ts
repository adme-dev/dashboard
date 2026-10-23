// Provider generation estimate; excludes separate inspection/storage charges.
// Verified 2026-10-04: https://developers.cloudflare.com/ai/models/recraft/recraftv4-1/
export const BANNER_IMAGE_MODEL = {
  id: 'aigateway/recraft-offer-card',
  label: 'Recraft V4.1',
  provider: 'Cloudflare AI Gateway',
  estimatedGenerationUsd: 0.04,
  pricingSource: 'https://developers.cloudflare.com/ai/models/recraft/recraftv4-1/',
  pricingCheckedAt: '2026-10-04'
} as const
