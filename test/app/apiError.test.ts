import { describe, expect, it } from 'vitest'
import { apiErrorDescription, apiErrorReasons, apiErrorStatus } from '~~/app/utils/apiError'

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
})
