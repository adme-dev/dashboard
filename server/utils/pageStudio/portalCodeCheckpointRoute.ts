import type { H3Event } from 'h3'
import { createError, getHeader, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { pageStudioInternalHttpError } from './http'
import { requirePageStudioMachineAuth } from './machineAuth'
import { commitPortalCodeCheckpoint, readPortalCodeCheckpoint, readPortalCodeHistory } from './portalCodeCheckpoints'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey, verifyPageStudioSessionToken } from './sessions'

export async function portalCodeCheckpointRoute(event: H3Event, operation: 'latest' | 'history' | 'commit') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    const raw = await readBody(event)
    const token = getHeader(event, 'x-page-studio-session')
    if (!token) throw createError({ statusCode: 401 })
    const claims = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    if (claims.role !== 'client') throw createError({ statusCode: 403 })
    if (operation === 'commit') {
      if (!raw?.checkpoint?.checkpointId || getHeader(event, 'idempotency-key') !== raw.checkpoint.checkpointId) throw createError({ statusCode: 400 })
      return await commitPortalCodeCheckpoint(raw, claims, { env: (event.context.cloudflare?.env ?? {}) as Record<string, unknown> })
    }
    if (!z.object({}).strict().safeParse(raw).success) throw createError({ statusCode: 400 })
    return operation === 'latest' ? await readPortalCodeCheckpoint(claims) : await readPortalCodeHistory(claims)
  } catch (error) { return pageStudioInternalHttpError(event, error) }
}
