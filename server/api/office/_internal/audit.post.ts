/**
 * POST /api/office/_internal/audit
 *
 * INTERNAL: called by the OfficeRoom DO with OFFICE_SYNC_SECRET to persist
 * live-room governance events that happen outside normal Nuxt API handlers.
 */
import { z } from 'zod'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'

const Body = z.object({
  office_id: z.string().uuid(),
  actor_id: z.string().uuid().nullable().optional(),
  action: z.string().trim().min(1).max(120),
  target_type: z.string().trim().min(1).max(120),
  target_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
})

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

function getSecret(event: Parameters<typeof defineEventHandler>[0] extends (e: infer E) => unknown ? E : never): string | undefined {
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.OFFICE_SYNC_SECRET as string | undefined) ?? process.env.OFFICE_SYNC_SECRET
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-office-sync-secret')
  const expected = getSecret(event)
  if (!expected || !secret || !timingSafeEqual(secret, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }

  const body = Body.parse(await readBody(event))
  await logOfficeAuditEvent({
    officeId: body.office_id,
    actorId: body.actor_id ?? null,
    action: body.action,
    targetType: body.target_type,
    targetId: body.target_id ?? null,
    metadata: body.metadata ?? {}
  })

  return { ok: true }
})
