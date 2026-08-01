import { describe, expect, it, vi } from 'vitest'

import {
  GooglePlacesClient
} from '~~/server/utils/siteIntelligence/googlePlaces'
import type { GooglePlacesError } from '~~/server/utils/siteIntelligence/googlePlaces'

const key = 'server-secret-that-must-not-log'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function createClient(fetcher = vi.fn()): GooglePlacesClient {
  return new GooglePlacesClient({ apiKey: key, fetch: fetcher as typeof fetch })
}

describe('GooglePlacesClient', () => {
  it('sends the bounded address preview request with its explicit mask', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      places: [{
        id: 'place-1',
        displayName: { text: 'Example Motors' },
        formattedAddress: '1 Example St, Melbourne VIC',
        location: { latitude: -37.81, longitude: 144.96 }
      }]
    }))

    const result = await createClient(fetcher).previewAddress('1 Example St, Melbourne')

    expect(result).toEqual([{
      placeId: 'place-1',
      displayName: 'Example Motors',
      formattedAddress: '1 Example St, Melbourne VIC',
      location: { latitude: -37.81, longitude: 144.96 }
    }])
    expect(fetcher).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:searchText',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location'
        }),
        body: JSON.stringify({
          textQuery: '1 Example St, Melbourne',
          pageSize: 5,
          languageCode: 'en',
          regionCode: 'AU'
        })
      })
    )
  })

  it('uses place details for a current location and validates the payload', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      id: 'place-1', location: { latitude: -37.81, longitude: 144.96 }
    }))

    await expect(createClient(fetcher).resolvePlaceLocation('place-1')).resolves.toEqual({
      placeId: 'place-1', location: { latitude: -37.81, longitude: 144.96 }
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places/place-1',
      expect.objectContaining({ headers: expect.objectContaining({
        'X-Goog-FieldMask': 'id,location'
      }) })
    )
  })

  it('rejects malformed provider bodies without exposing them', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ id: 'place-1' }))

    await expect(createClient(fetcher).resolvePlaceLocation('place-1')).rejects.toMatchObject({
      code: 'malformed_response'
    } satisfies Partial<GooglePlacesError>)
  })

  it('sends the bounded nearby search request without website fields', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      places: [{
        id: 'dealer-1', displayName: { text: 'Toyota Example' },
        formattedAddress: '2 Dealer Rd, Melbourne VIC',
        location: { latitude: -37.82, longitude: 144.97 },
        businessStatus: 'OPERATIONAL', primaryType: 'car_dealer',
        types: ['car_dealer'], googleMapsUri: 'https://maps.google.com/?cid=1'
      }]
    }))

    const result = await createClient(fetcher).searchNearbyDealers({
      latitude: -37.81, longitude: 144.96, radiusKm: 25
    })

    expect(result).toEqual([expect.objectContaining({ placeId: 'dealer-1', displayName: 'Toyota Example' })])
    expect(fetcher).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:searchNearby',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.primaryType,places.types,places.googleMapsUri'
        }),
        body: JSON.stringify({
          includedTypes: ['car_dealer'], maxResultCount: 20, rankPreference: 'DISTANCE',
          locationRestriction: { circle: { center: { latitude: -37.81, longitude: 144.96 }, radius: 25000 } }
        })
      })
    )
    expect(JSON.stringify(fetcher.mock.calls[0])).not.toContain('websiteUri')
  })

  it('requests a website only after a candidate is selected for review', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({
      id: 'dealer-1', displayName: { text: 'Toyota Example' },
      formattedAddress: '2 Dealer Rd, Melbourne VIC', googleMapsUri: 'https://maps.google.com/?cid=1',
      websiteUri: 'https://example-toyota.test', businessStatus: 'OPERATIONAL'
    }))

    await expect(createClient(fetcher).reviewCandidateWebsite('dealer-1')).resolves.toEqual({
      placeId: 'dealer-1', displayName: 'Toyota Example',
      formattedAddress: '2 Dealer Rd, Melbourne VIC',
      googleMapsUri: 'https://maps.google.com/?cid=1',
      websiteUri: 'https://example-toyota.test', businessStatus: 'OPERATIONAL'
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places/dealer-1',
      expect.objectContaining({ headers: expect.objectContaining({
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,googleMapsUri,websiteUri,businessStatus'
      }) })
    )
  })

  it('aborts a provider request after eight seconds through injected timers', async () => {
    const aborts: string[] = []
    let timeoutCallback: (() => void) | undefined
    const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        aborts.push('aborted')
        reject(new DOMException('aborted', 'AbortError'))
      })
      timeoutCallback?.()
    }))
    const setTimeout = vi.fn((callback: () => void, ms: number) => {
      expect(ms).toBe(8000)
      timeoutCallback = callback
      return 1 as unknown as ReturnType<typeof globalThis.setTimeout>
    })

    await expect(new GooglePlacesClient({ apiKey: key, fetch: fetcher as typeof fetch, setTimeout })
      .previewAddress('timeout')).rejects.toMatchObject({ code: 'unavailable' })
    expect(aborts).toEqual(['aborted'])
  })

  it.each([429, 500, 503])('retries retryable provider status %s exactly once', async (status) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ secret: key }, status))
      .mockResolvedValueOnce(jsonResponse({ places: [] }))
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(new GooglePlacesClient({ apiKey: key, fetch: fetcher as typeof fetch, sleep }).previewAddress('retry'))
      .resolves.toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it.each([[400, 'invalid_request'], [401, 'auth'], [403, 'auth']])(
    'does not retry terminal provider status %s',
    async (status, code) => {
      const fetcher = vi.fn().mockResolvedValue(jsonResponse({ secret: key }, status))
      await expect(createClient(fetcher).previewAddress('no retry')).rejects.toMatchObject({ code })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  )

  it('never logs API keys or raw provider bodies', async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ rawPrivateProviderBody: key }, 500))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(createClient(fetcher).previewAddress('safe failure')).rejects.toMatchObject({ code: 'unavailable' })
    expect(error.mock.calls.flat().join(' ')).not.toContain(key)
    expect(error.mock.calls.flat().join(' ')).not.toContain('rawPrivateProviderBody')
    error.mockRestore()
  })

  it('fails as not configured before any request when no private key is available', async () => {
    const fetcher = vi.fn()
    await expect(new GooglePlacesClient({ apiKey: '', fetch: fetcher }).previewAddress('none'))
      .rejects.toMatchObject({ code: 'not_configured' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
