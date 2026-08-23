import { describe, expect, it } from 'vitest'
import { apiErrorDescription, apiErrorReasons, apiErrorStatus, isAmbiguousApiFailure, isPossiblyAppliedFailure } from '~~/app/utils/apiError'

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

  it('flags failures the server could not prove were not applied', () => {
    expect(isPossiblyAppliedFailure(new TypeError('Failed to fetch'))).toBe(true)
    expect(isPossiblyAppliedFailure({ statusCode: 409, data: { statusMessage: 'God mode video render is not safely replayable' } })).toBe(true)
    expect(isPossiblyAppliedFailure({ statusCode: 409, data: { statusMessage: 'God mode video render is still in progress' } })).toBe(true)
    expect(isPossiblyAppliedFailure({ statusCode: 409, data: { statusMessage: 'Idempotency key belongs to another operation' } })).toBe(false)
    expect(isPossiblyAppliedFailure({ statusCode: 500, data: { statusMessage: 'boom' } })).toBe(false)
  })
})
