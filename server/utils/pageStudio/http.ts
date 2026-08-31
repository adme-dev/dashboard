import { setResponseStatus, type H3Event } from 'h3'

import { PageStudioSiteError } from '~~/server/utils/pageStudio/sites'
import { PageStudioVersionError } from '~~/server/utils/pageStudio/versions'
import { PageStudioControlError } from '~~/server/utils/pageStudio/controlStore'
import { PageStudioDeliveryError } from '~~/server/utils/pageStudio/delivery'
import { PageStudioPublishingError } from '~~/server/utils/pageStudio/publishing'
import { PageStudioBuildError } from '~~/server/utils/pageStudio/builds'
import { PageStudioSessionError } from '~~/server/utils/pageStudio/sessions'

interface StablePageStudioError {
  error: { code: string, message: string }
}

function stableError(value: unknown): StablePageStudioError | null {
  if (!value || typeof value !== 'object' || !('error' in value)) return null
  const error = value.error
  if (!error || typeof error !== 'object' || !('code' in error) || !('message' in error)) {
    return null
  }
  if (typeof error.code !== 'string'
    || !/^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)
    || typeof error.message !== 'string'
    || error.message.length < 1
    || error.message.length > 500) return null
  return { error: { code: error.code, message: error.message } }
}

export function projectPageStudioInternalError(error: unknown): {
  statusCode: number
  body: StablePageStudioError
} {
  if (error instanceof PageStudioControlError
    || error instanceof PageStudioBuildError
    || error instanceof PageStudioDeliveryError
    || error instanceof PageStudioPublishingError
    || error instanceof PageStudioSessionError
    || error instanceof PageStudioSiteError
    || error instanceof PageStudioVersionError) {
    return {
      statusCode: error.statusCode,
      body: { error: { code: error.code, message: error.message } }
    }
  }

  if (error && typeof error === 'object' && 'statusCode' in error) {
    const candidate = error as { statusCode?: unknown, data?: unknown }
    const statusCode = Number.isInteger(candidate.statusCode)
      && Number(candidate.statusCode) >= 400
      && Number(candidate.statusCode) <= 599
      ? Number(candidate.statusCode)
      : 500
    const projected = stableError(candidate.data)
    if (projected) return { statusCode, body: projected }
    return {
      statusCode,
      body: { error: { code: 'REQUEST_FAILED', message: 'Page Studio request failed' } }
    }
  }

  return {
    statusCode: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Page Studio request failed' } }
  }
}

export function pageStudioInternalHttpError(
  event: H3Event,
  error: unknown
): StablePageStudioError {
  const projected = projectPageStudioInternalError(error)
  if (projected.statusCode >= 500) {
    const candidate = error as { code?: unknown, message?: unknown, name?: unknown }
    console.error('[page-studio-internal] request failed', {
      code: typeof candidate?.code === 'string' ? candidate.code : undefined,
      message: typeof candidate?.message === 'string' ? candidate.message : undefined,
      name: typeof candidate?.name === 'string' ? candidate.name : undefined
    })
  }
  setResponseStatus(event, projected.statusCode)
  return projected.body
}

export function pageStudioHttpError(error: unknown): never {
  if (error instanceof PageStudioControlError
    || error instanceof PageStudioBuildError
    || error instanceof PageStudioDeliveryError
    || error instanceof PageStudioPublishingError
    || error instanceof PageStudioSessionError
    || error instanceof PageStudioSiteError
    || error instanceof PageStudioVersionError) {
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
