import { createError, getHeader, getRouterParam, setHeader, type H3Event } from 'h3'
import { readPageStudioJson } from './boundedJson'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { pageStudioHttpError, pageStudioInternalHttpError } from './http'
import { requirePageStudioMachineAuth } from './machineAuth'
import {
  resolvePageStudioSessionEnvironment,
  resolvePageStudioSessionPublicKey,
  verifyPageStudioSessionToken
} from './sessions'
import { CmsAdoptionControlRequestSchema, coordinateCmsAdoption } from './cmsAdoptionCoordinator'

async function input(event: H3Event) {
  const parsed = CmsAdoptionControlRequestSchema.safeParse(
    await readPageStudioJson(event, 4096, [
      'Content setup requires JSON',
      'Content setup request exceeds byte limit',
      'Content setup request required',
      'Invalid content setup body',
      'Invalid content setup JSON'
    ])
  )
  if (!parsed.success)
    throw createError({ statusCode: 400, statusMessage: 'Invalid content setup request' })
  return parsed.data
}
export async function handleNativeCmsAdoption(
  event: H3Event,
  audience: 'agency' | 'portal',
  method: 'GET' | 'POST'
) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const actor = await resolvePageStudioHttpActor(event, audience, true)
    const login = await preparePageStudioContentLogin(event, actor)
    const request = {
      actor,
      login,
      siteId: getRouterParam(event, 'siteId') ?? '',
      env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown>
    }
    return await coordinateCmsAdoption(
      method === 'GET' ? { action: 'status' } : await input(event),
      { source: 'native-login', request }
    )
  } catch (error) {
    return pageStudioHttpError(error)
  }
}
export async function handleStudioCmsAdoption(event: H3Event) {
  setHeader(event, 'cache-control', 'no-store')
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
    return await coordinateCmsAdoption(await input(event), {
      source: 'studio-session',
      claims,
      env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown>,
      capability: 'workspace:checkpoint'
    })
  } catch (error) {
    return pageStudioInternalHttpError(event, error)
  }
}
