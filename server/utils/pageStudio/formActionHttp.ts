import { createError, getHeader, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { readPageStudioJson } from './boundedJson'
import { pageStudioInternalHttpError } from './http'
import { requirePageStudioMachineAuth } from './machineAuth'
import {
  resolvePageStudioSessionEnvironment,
  resolvePageStudioSessionPublicKey,
  verifyPageStudioSessionToken
} from './sessions'
import { readAcceptedFormActions } from './formActionDiscovery'

export async function handleStudioFormActions(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    const token = getHeader(event, 'x-page-studio-session')
    if (!token || token.length > 8192)
      throw createError({ statusCode: 401, statusMessage: 'Page Studio session required' })
    const claims = await verifyPageStudioSessionToken(
      token,
      resolvePageStudioSessionPublicKey(event),
      resolvePageStudioSessionEnvironment(event).issuer
    )
    const body = await readPageStudioJson(event, 4096, [
      'Form actions require JSON',
      'Form action request exceeds byte limit',
      'Form action request required',
      'Invalid form action body',
      'Invalid form action JSON'
    ])
    if (!z.object({}).strict().safeParse(body).success)
      throw createError({ statusCode: 400, statusMessage: 'Invalid form action request' })
    return await readAcceptedFormActions({
      source: 'studio-session',
      claims,
      env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown>,
      capability: 'workspace:checkpoint'
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
}
