import type { DealerCategory } from '~~/app/types/site-intelligence'
import type { H3Event } from 'h3'
import { enforceRateLimit } from '~~/server/utils/rateLimit'
import { GooglePlacesError } from '~~/server/utils/siteIntelligence/googlePlaces'

export function requireNearbyMarketProviderConfiguration() {
  const config = useRuntimeConfig()
  if (config.nearbyMarketDiscoveryEnabled !== true) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market discovery is disabled' })
  }
  if (typeof config.googlePlacesServerApiKey !== 'string' || !config.googlePlacesServerApiKey.trim()) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is not configured' })
  }
  return config
}

export function throwNearbyMarketProviderError(error: unknown): never {
  if (!(error instanceof GooglePlacesError)) {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is unavailable' })
  }
  if (error.code === 'not_configured' || error.code === 'auth') {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is misconfigured' })
  }
  if (error.code === 'rate_limited') {
    throw createError({ statusCode: 429, statusMessage: 'Nearby market provider is rate-limited' })
  }
  if (error.code === 'quota') {
    throw createError({ statusCode: 503, statusMessage: 'Nearby market provider quota is exhausted' })
  }
  if (error.code === 'invalid_request' || error.code === 'malformed_response') {
    throw createError({ statusCode: 502, statusMessage: 'Nearby market provider returned an invalid response' })
  }
  throw createError({ statusCode: 503, statusMessage: 'Nearby market provider is unavailable' })
}

export async function enforceNearbyMarketCandidateReviewLimits(
  event: H3Event,
  userId: string
): Promise<void> {
  await enforceRateLimit(event, {
    key: `nearby-market:agency:review:user:${userId}`,
    limit: 20,
    windowSeconds: 3600,
    failureMode: 'closed'
  })
  await enforceRateLimit(event, {
    key: 'nearby-market:org:daily',
    limit: 500,
    windowSeconds: 86400,
    failureMode: 'closed'
  })
}

export interface DealerClassificationInput {
  displayName: string
  primaryType: string | null
  types: string[]
}

const USED_DEALER_SIGNALS = [
  /\bused\b/i,
  /\bpre[- ]?owned\b/i,
  /\bsecond[- ]?hand\b/i,
  /\bpreloved\b/i,
  /\bquality used\b/i,
  /\bwholesale\b/i
]

const AUSTRALIAN_FRANCHISE_ALIASES = [
  'toyota', 'ford', 'hyundai', 'kia', 'mazda', 'mitsubishi', 'nissan', 'volkswagen',
  'subaru', 'honda', 'suzuki', 'isuzu', 'ldv', 'gwm', 'haval', 'byd', 'mg', 'lexus',
  'mercedes', 'bmw', 'audi', 'volvo', 'skoda', 'cupra', 'jeep', 'ram', 'chery', 'jaecoo',
  'renault', 'peugeot', 'citroen', 'fiat', 'alfa romeo', 'land rover', 'range rover'
]

/** Only positive evidence upgrades a candidate; ambiguity stays unclassified. */
export function classifyDealer(input: DealerClassificationInput): DealerCategory {
  const name = input.displayName.trim()
  if (USED_DEALER_SIGNALS.some(signal => signal.test(name))) return 'used'
  const normalised = ` ${name.toLocaleLowerCase('en-AU').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `
  if (AUSTRALIAN_FRANCHISE_ALIASES.some(alias => normalised.includes(` ${alias} `))) return 'franchise_new'
  return 'unclassified'
}

export interface Coordinates {
  latitude: number
  longitude: number
}

/** Great-circle distance in kilometres; callers choose any presentation rounding. */
export function haversineDistanceKm(origin: Coordinates, destination: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(destination.latitude - origin.latitude)
  const longitudeDelta = radians(destination.longitude - origin.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(origin.latitude)) * Math.cos(radians(destination.latitude))
    * Math.sin(longitudeDelta / 2) ** 2
  return 6_371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
