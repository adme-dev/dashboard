/**
 * POST /api/office/_internal/sync-status
 *
 * INTERNAL: called by the OfficeRoom DO with the OFFICE_SYNC_SECRET in the
 * x-office-sync-secret header. Mirrors an office presence status to the chat
 * presence table so the chat sidebar stays consistent.
 *
 * Routes by actor_type:
 *   - 'user'   → user_chat_status (PK: user_id, FK to team_members)
 *   - 'client' → client_chat_status (PK: client_user_id, parallel table per
 *                migration 097 fix; user_chat_status.user_id is NOT NULL)
 */

import { z } from 'zod'
import { execute } from '~~/server/utils/db'

const Body = z.object({
  actor_type: z.enum(['user', 'client']),
  actor_id: z.string().uuid(),
  status: z.enum(['available', 'busy', 'dnd', 'away'])
})

// Map office status -> chat status enum.
// Chat enum is online/away/dnd/offline; office is available/busy/dnd/away.
// 'busy' (in a meeting) maps to 'dnd' in chat — closest semantic equivalent.
function toChatStatus(s: z.infer<typeof Body>['status']): 'online' | 'away' | 'dnd' | 'offline' {
  if (s === 'available') return 'online'
  if (s === 'away') return 'away'
  if (s === 'dnd') return 'dnd'
  if (s === 'busy') return 'dnd'
  return 'online'
}

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

function getSecret(event: Parameters<typeof defineEventHandler>[0] extends (e: infer E) => unknown ? E : never): string | undefined {
  // CF Pages: secrets are bound on event.context.cloudflare.env, NOT process.env.
  // Local dev (Node.js Nitro): process.env is the only place.
  const cfEnv = (event.context as CloudflareContext).cloudflare?.env
  return (cfEnv?.OFFICE_SYNC_SECRET as string | undefined) ?? process.env.OFFICE_SYNC_SECRET
}

// Timing-safe string compare (Web Crypto-style) for the shared secret.
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
  const chatStatus = toChatStatus(body.status)

  if (body.actor_type === 'user') {
    await execute(
      `INSERT INTO user_chat_status (user_id, status, last_seen_at, updated_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (user_id) DO UPDATE
         SET status = EXCLUDED.status, last_seen_at = now(), updated_at = now()`,
      [body.actor_id, chatStatus]
    )
  } else {
    await execute(
      `INSERT INTO client_chat_status (client_user_id, status, last_seen_at, updated_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (client_user_id) DO UPDATE
         SET status = EXCLUDED.status, last_seen_at = now(), updated_at = now()`,
      [body.actor_id, chatStatus]
    )
  }

  return { ok: true }
})
