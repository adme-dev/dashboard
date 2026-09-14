import { getHeader, getRequestWebStream, type H3Event } from 'h3'
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { DomainHostnameSchema as Hostname, DomainIdentitySchema } from '~~/shared/pageStudio/domainManagement'
import { callDomainManagement, attachPageStudioDomain, refreshPageStudioDomain } from './domainManagementClient'
import { pageStudioHttpError } from './http'

async function readDomainBody(event: H3Event, optional = false): Promise<unknown> {
  const invalid = () => createError({ statusCode: 400, statusMessage: 'Invalid website domain request' })
  if (Number(getHeader(event, 'content-length')) > 2048) throw invalid()
  const stream = getRequestWebStream(event)
  if (!stream) {
    if (optional) return {}
    throw invalid()
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
      if (!(bytes instanceof Uint8Array)) throw invalid()
      size += bytes.byteLength
      if (size > 2048) throw invalid()
      chunks.push(bytes)
    }
  } catch (error) {
    await reader.cancel('Invalid domain request body').catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  if (!size && optional) return {}
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw invalid()
  }
}

export async function handlePortalDomains(event: H3Event, action: 'list' | 'attach' | 'verify') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const user = await requireClientAuth(event)
    const siteId = z.string().uuid().safeParse(getRouterParam(event, 'siteId'))
    if (!siteId.success || !z.object({}).strict().safeParse(getQuery(event)).success)
      throw createError({ statusCode: 400, statusMessage: 'Invalid website domain request' })
    const actor = { actorId: user.id, clientId: user.clientId, siteId: siteId.data }
    if (action === 'list') return await callDomainManagement(event, { operation: 'list', actor: { kind: 'portal', actorId: user.id, clientId: user.clientId }, siteId: siteId.data })
    let hostname: string | undefined
    let domainId: string | undefined
    if (action === 'attach') {
      const body = await readDomainBody(event)
      const parsed = z.object({ hostname: Hostname }).strict().safeParse(body)
      if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website hostname' })
      hostname = parsed.data.hostname
    } else {
      if (!z.object({}).strict().safeParse(await readDomainBody(event, true)).success)
        throw createError({ statusCode: 400, statusMessage: 'Invalid domain verification request' })
      const parsed = z.string().uuid().safeParse(getRouterParam(event, 'domainId'))
      if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website domain' })
      domainId = parsed.data
    }
    const scopedActor = { ...actor, kind: 'portal' as const }
    // Every subsequent effect is freshly authorised again by the shared engine.
    if (action === 'attach') {
      const domain = await attachPageStudioDomain({ ...scopedActor, event, hostname: hostname! })
      setResponseStatus(event, 201)
      return { domain }
    }
    const domain = DomainIdentitySchema.parse(await refreshPageStudioDomain({ ...scopedActor, event, domainId: domainId! }))
    return { domain: { id: domain.id } }
  } catch (error) {
    pageStudioHttpError(error)
  }
}
