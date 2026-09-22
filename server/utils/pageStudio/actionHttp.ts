import { createError, getHeader, setHeader, type H3Event } from 'h3'
import { readPageStudioJson } from './boundedJson'
import { requirePageStudioMachineAuth } from './machineAuth'
import {
  resolvePageStudioSessionEnvironment,
  resolvePageStudioSessionPublicKey,
  verifyPageStudioSessionToken
} from './sessions'
import { pageStudioInternalHttpError } from './http'
import {
  ActionControlRequestSchema,
  coordinateActionInvocation
} from './actionCoordinator'

export async function handleActionInvocation(event: H3Event) {
  setHeader(event, 'cache-control', 'no-store')
  try {
    requirePageStudioMachineAuth(event)
    const token = getHeader(event, 'x-page-studio-session')
    if (!token || token.length > 8192)
      throw createError({
        statusCode: 401,
        statusMessage: 'Page Studio session required'
      })
    const claims = await verifyPageStudioSessionToken(
      token,
      resolvePageStudioSessionPublicKey(event),
      resolvePageStudioSessionEnvironment(event).issuer
    )
    const value = await readPageStudioJson(event, 131072, [
      'Action invocation requires JSON',
      'Action invocation exceeds byte limit',
      'Action invocation body required',
      'Invalid action body',
      'Invalid action JSON'
    ])
    const body = ActionControlRequestSchema.safeParse(value)
    if (!body.success)
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid action invocation'
      })
    try {
      return await coordinateActionInvocation(body.data, {
        source: 'studio-session',
        claims,
        env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown>,
        capability: 'model:invoke'
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error)
        throw error
      const conflict
        = error instanceof Error
          && [
            'Action invocation identity conflict',
            'Action effect bases already pinned',
            'Accepted CMS state unavailable or stale'
          ].includes(error.message)
      // Never serialize private artifact/result validation details or object keys.
      throw createError({
        statusCode: conflict ? 409 : 503,
        statusMessage: conflict
          ? 'Action context changed. Retry the same intent to check its status.'
          : 'Action execution is unavailable. Retry the same intent to check its status.'
      })
    }
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
}
