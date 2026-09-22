import { createError, getHeader, setHeader, type H3Event } from 'h3'
import { readPageStudioJson } from './boundedJson'
import { pageStudioInternalHttpError } from './http'
import { requirePageStudioMachineAuth } from './machineAuth'
import {
  resolvePageStudioSessionEnvironment,
  resolvePageStudioSessionPublicKey,
  verifyPageStudioSessionToken
} from './sessions'
import { ComponentCmsDataRequestSchema, readAcceptedComponentCmsData } from './componentCmsData'

export async function handleStudioComponentCmsData(event: H3Event) {
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
      'Component data require JSON',
      'Component data request exceeds byte limit',
      'Component data request required',
      'Invalid component data body',
      'Invalid component data JSON'
    ])
    if (!ComponentCmsDataRequestSchema.safeParse(body).success)
      throw createError({ statusCode: 400, statusMessage: 'Invalid component data request' })
    return await readAcceptedComponentCmsData(body, {
      source: 'studio-session',
      claims,
      env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown>,
      capability: 'workspace:checkpoint'
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
}
