import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { pageStudioHttpError, projectPageStudioInternalError } from '~~/server/utils/pageStudio/http'

const dbError = { code: 'P0001', message: 'CMS_ADOPTION_IN_PROGRESS', detail: 'private database data' }
const expected = { error: { code: 'CMS_ADOPTION_IN_PROGRESS', message: 'CMS setup is in progress. Try saving again when setup finishes.' } }
describe('CMS checkpoint adoption conflict HTTP mapping', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', createError)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('maps the exact SQL trigger error to a stable private 409 response', () => {
    expect(projectPageStudioInternalError(dbError)).toEqual({ statusCode: 409, body: expected })
  })
  it('maps the same conflict through public Page Studio error handling', () => {
    let caught: unknown
    try {
      pageStudioHttpError(dbError)
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ statusCode: 409, data: expected })
  })
  it.each([{ code: 'P0001', message: 'other exception' }, { code: 'XX000', message: 'CMS_ADOPTION_IN_PROGRESS' }, { message: 'CMS_ADOPTION_IN_PROGRESS' }])('never maps another database error as adoption conflict: %j', (error) => {
    expect(projectPageStudioInternalError(error)).toMatchObject({ statusCode: 500, body: { error: { code: 'INTERNAL_ERROR' } } })
  })
})
