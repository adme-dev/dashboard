import { createError, defineEventHandler, readBody, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { enforceRateLimit } from '~~/server/utils/rateLimit'
import { readOfficialDocumentation, resolveOfficialDocumentationUrl } from '~~/server/utils/ai/officialDocumentation'

const bodySchema = z.strictObject({ url: z.string().min(1).max(2048) })
const defaults = { auth: requireAuth, readBody, limit: enforceRateLimit, read: readOfficialDocumentation, header: setHeader }
export function createDocumentationReadHandler(dependencies: Partial<typeof defaults> = {}) {
  const deps = { ...defaults, ...dependencies }
  return defineEventHandler(async (event) => {
    const user = await deps.auth(event)
    const body = bodySchema.safeParse(await deps.readBody(event))
    if (!body.success) throw createError({ statusCode: 400, statusMessage: 'An approved official documentation URL is required' })
    resolveOfficialDocumentationUrl(body.data.url)
    await deps.limit(event, { key: `official-docs:${user.id}`, limit: 20, windowSeconds: 60, failureMode: 'closed' })
    deps.header(event, 'Cache-Control', 'private, no-store')
    return deps.read(body.data.url)
  })
}
export default createDocumentationReadHandler()
