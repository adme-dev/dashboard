import type { NearbyMarketRadius } from '~~/app/types/site-intelligence'

export const ADDRESS_MASK = 'places.id,places.displayName,places.formattedAddress,places.location'
export const LOCATION_MASK = 'id,location'
export const NEARBY_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.primaryType,places.types,places.googleMapsUri'
export const WEBSITE_MASK = 'id,displayName,formattedAddress,googleMapsUri,websiteUri,businessStatus'

const PLACES_BASE_URL = 'https://places.googleapis.com/v1'
const REQUEST_TIMEOUT_MS = 8_000
const MAX_ATTEMPTS = 2

export type GooglePlacesErrorCode
  = 'not_configured'
    | 'auth'
    | 'rate_limited'
    | 'quota'
    | 'invalid_request'
    | 'unavailable'
    | 'malformed_response'

export class GooglePlacesError extends Error {
  constructor(public readonly code: GooglePlacesErrorCode) {
    super(`Google Places request failed: ${code}`)
    this.name = 'GooglePlacesError'
  }
}

export interface PlaceLocation {
  latitude: number
  longitude: number
}

export interface GooglePlacePreview {
  placeId: string
  displayName: string
  formattedAddress: string
  location: PlaceLocation
}

export interface NearbyDealer extends GooglePlacePreview {
  businessStatus: string | null
  primaryType: string | null
  types: string[]
  googleMapsUri: string | null
}

export interface CandidateWebsiteReview {
  placeId: string
  displayName: string
  formattedAddress: string
  googleMapsUri: string | null
  websiteUri: string | null
  businessStatus: string | null
}

interface GooglePlacesClientDependencies {
  apiKey: string
  fetch?: typeof fetch
  setTimeout?: typeof globalThis.setTimeout
  clearTimeout?: typeof globalThis.clearTimeout
  sleep?: (ms: number) => Promise<void>
}

interface SearchNearbyInput extends PlaceLocation {
  radiusKm: NearbyMarketRadius
}

interface ProviderLocation {
  latitude?: unknown
  longitude?: unknown
}

interface ProviderPlace {
  id?: unknown
  displayName?: { text?: unknown }
  formattedAddress?: unknown
  location?: ProviderLocation
  businessStatus?: unknown
  primaryType?: unknown
  types?: unknown
  googleMapsUri?: unknown
  websiteUri?: unknown
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function locationFrom(value: ProviderLocation | undefined): PlaceLocation | null {
  if (typeof value?.latitude !== 'number' || typeof value.longitude !== 'number') return null
  if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) return null
  return { latitude: value.latitude, longitude: value.longitude }
}

function requiredPreview(place: ProviderPlace): GooglePlacePreview {
  const placeId = asString(place.id)
  const displayName = asString(place.displayName?.text)
  const formattedAddress = asString(place.formattedAddress)
  const location = locationFrom(place.location)
  if (!placeId || !displayName || !formattedAddress || !location) throw new GooglePlacesError('malformed_response')
  return { placeId, displayName, formattedAddress, location }
}

function statusError(status: number): GooglePlacesError {
  if (status === 401 || status === 403) return new GooglePlacesError('auth')
  if (status === 429) return new GooglePlacesError('rate_limited')
  if (status >= 400 && status < 500) return new GooglePlacesError('invalid_request')
  return new GooglePlacesError('unavailable')
}

async function providerStatusError(response: Response): Promise<GooglePlacesError> {
  if (response.status !== 429) return statusError(response.status)
  try {
    const body = await response.json() as { error?: { status?: unknown } }
    if (body.error?.status === 'RESOURCE_EXHAUSTED') return new GooglePlacesError('quota')
  } catch {
    // Provider error bodies are intentionally neither surfaced nor logged.
  }
  return statusError(response.status)
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Deliberately small Places API (New) wrapper. It never logs or persists provider
 * responses, and callers only receive the request-specific, mapped fields.
 */
export class GooglePlacesClient {
  private readonly apiKey: string
  private readonly fetcher: typeof fetch
  private readonly setTimer: typeof globalThis.setTimeout
  private readonly clearTimer: typeof globalThis.clearTimeout
  private readonly sleep: (ms: number) => Promise<void>

  constructor(dependencies: GooglePlacesClientDependencies) {
    this.apiKey = dependencies.apiKey.trim()
    this.fetcher = dependencies.fetch ?? globalThis.fetch
    this.setTimer = dependencies.setTimeout ?? globalThis.setTimeout
    this.clearTimer = dependencies.clearTimeout ?? globalThis.clearTimeout
    this.sleep = dependencies.sleep ?? defaultSleep
  }

  async previewAddress(addressText: string): Promise<GooglePlacePreview[]> {
    const body = await this.request<{ places?: ProviderPlace[] }>('/places:searchText', {
      textQuery: addressText,
      pageSize: 5,
      languageCode: 'en',
      regionCode: 'AU'
    }, ADDRESS_MASK)
    if (body.places === undefined) return []
    if (!Array.isArray(body.places)) throw new GooglePlacesError('malformed_response')
    return body.places.map(requiredPreview)
  }

  async resolvePlaceLocation(placeId: string): Promise<{ placeId: string, location: PlaceLocation }> {
    const body = await this.request<ProviderPlace>(`/places/${encodeURIComponent(placeId)}`, undefined, LOCATION_MASK)
    const resultId = asString(body.id)
    const location = locationFrom(body.location)
    if (!resultId || !location) throw new GooglePlacesError('malformed_response')
    return { placeId: resultId, location }
  }

  async searchNearbyDealers(input: SearchNearbyInput): Promise<NearbyDealer[]> {
    const body = await this.request<{ places?: ProviderPlace[] }>('/places:searchNearby', {
      includedTypes: ['car_dealer'],
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: input.latitude, longitude: input.longitude },
          radius: input.radiusKm * 1_000
        }
      }
    }, NEARBY_MASK)
    if (body.places === undefined) return []
    if (!Array.isArray(body.places)) throw new GooglePlacesError('malformed_response')
    return body.places.map(place => ({
      ...requiredPreview(place),
      businessStatus: asString(place.businessStatus),
      primaryType: asString(place.primaryType),
      types: Array.isArray(place.types) && place.types.every(type => typeof type === 'string') ? place.types : [],
      googleMapsUri: asString(place.googleMapsUri)
    }))
  }

  async reviewCandidateWebsite(placeId: string): Promise<CandidateWebsiteReview> {
    const body = await this.request<ProviderPlace>(`/places/${encodeURIComponent(placeId)}`, undefined, WEBSITE_MASK)
    const resultId = asString(body.id)
    const displayName = asString(body.displayName?.text)
    const formattedAddress = asString(body.formattedAddress)
    if (!resultId || !displayName || !formattedAddress) throw new GooglePlacesError('malformed_response')
    return {
      placeId: resultId,
      displayName,
      formattedAddress,
      googleMapsUri: asString(body.googleMapsUri),
      websiteUri: asString(body.websiteUri),
      businessStatus: asString(body.businessStatus)
    }
  }

  private async request<T>(path: string, body: Record<string, unknown> | undefined, fieldMask: string): Promise<T> {
    if (!this.apiKey) throw new GooglePlacesError('not_configured')

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController()
      const timeout = this.setTimer(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const response = await this.fetcher(`${PLACES_BASE_URL}${path}`, {
          method: body ? 'POST' : 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fieldMask
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal
        })
        if (!response.ok) {
          const error = await providerStatusError(response)
          if (attempt < MAX_ATTEMPTS && isRetryableStatus(response.status)) {
            await this.sleep(100 * attempt)
            continue
          }
          throw error
        }
        try {
          return await response.json() as T
        } catch {
          throw new GooglePlacesError('malformed_response')
        }
      } catch (error) {
        if (error instanceof GooglePlacesError) throw error
        throw new GooglePlacesError('unavailable')
      } finally {
        this.clearTimer(timeout)
      }
    }
    throw new GooglePlacesError('unavailable')
  }
}

export function googlePlacesClientFromRuntimeConfig(runtimeConfig: { googlePlacesServerApiKey?: string }): GooglePlacesClient {
  return new GooglePlacesClient({ apiKey: runtimeConfig.googlePlacesServerApiKey ?? '' })
}
