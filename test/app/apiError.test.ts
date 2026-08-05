import { describe, expect, it } from 'vitest'
import { apiErrorDescription, apiErrorReasons, apiErrorStatus, isAmbiguousApiFailure } from '~~/app/utils/apiError'

describe('apiError helpers', () => {
  it('reads common Nitro/ofetch error shapes', () => {
    const error = {
      data: {
        statusMessage: 'Blocked by tenant policy',
        data: {
          reasons: ['No enabled models']
        }
      },
      statusCode: 403
    }

    expect(apiErrorDescription(error)).toBe('Blocked by tenant policy')
    expect(apiErrorReasons(error)).toEqual(['No enabled models'])
    expect(apiErrorStatus(error)).toBe(403)
  })

  it('falls back for unknown errors', () => {
    expect(apiErrorDescription(null, 'Fallback')).toBe('Fallback')
    expect(apiErrorReasons(new Error('Nope'))).toBeNull()
    expect(apiErrorStatus({ response: { status: 404 } })).toBe(404)
  })

  it('distinguishes connection-level ambiguity from an authoritative HTTP failure', () => {
    expect(isAmbiguousApiFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isAmbiguousApiFailure({ response: { status: 500 } })).toBe(false)
    expect(isAmbiguousApiFailure({ statusCode: 409 })).toBe(false)
  })
})
