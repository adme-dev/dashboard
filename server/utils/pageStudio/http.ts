import { PageStudioSiteError } from '~~/server/utils/pageStudio/sites'

export function pageStudioHttpError(error: unknown): never {
  if (error instanceof PageStudioSiteError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
      data: { error: { code: error.code, message: error.message } }
    })
  }
  if (typeof error === 'object' && error && 'statusCode' in error) throw error
  throw createError({
    statusCode: 500,
    statusMessage: 'Page Studio request failed',
    data: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Page Studio request failed'
      }
    }
  })
}
