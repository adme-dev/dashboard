import { describe, expect, it } from 'vitest'

import { PageStudioControlError } from '~~/server/utils/pageStudio/controlStore'
import { projectPageStudioInternalError } from '~~/server/utils/pageStudio/http'

describe('Page Studio internal HTTP error projection', () => {
  it('projects typed control errors to the stable top-level wire contract', () => {
    expect(projectPageStudioInternalError(new PageStudioControlError(
      'CHECKPOINT_CONFLICT',
      409,
      'Checkpoint id already represents different content'
    ))).toEqual({
      statusCode: 409,
      body: {
        error: {
          code: 'CHECKPOINT_CONFLICT',
          message: 'Checkpoint id already represents different content'
        }
      }
    })
  })

  it('preserves only a valid stable error nested in a controlled H3 error', () => {
    expect(projectPageStudioInternalError({
      statusCode: 401,
      statusMessage: 'Bearer authentication required',
      data: {
        error: { code: 'MACHINE_AUTH_REQUIRED', message: 'Bearer authentication required' }
      }
    })).toEqual({
      statusCode: 401,
      body: {
        error: { code: 'MACHINE_AUTH_REQUIRED', message: 'Bearer authentication required' }
      }
    })
  })

  it('does not expose arbitrary thrown status messages or internals', () => {
    expect(projectPageStudioInternalError({
      statusCode: 403,
      statusMessage: 'secret database detail'
    })).toEqual({
      statusCode: 403,
      body: { error: { code: 'REQUEST_FAILED', message: 'Page Studio request failed' } }
    })
    expect(projectPageStudioInternalError(new Error('connection string leaked'))).toEqual({
      statusCode: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Page Studio request failed' } }
    })
  })
})
