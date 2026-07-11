/**
 * Web Push delivery helper.
 *
 * Wraps @pushforge/builder for outbound Web Push notifications. Reads the
 * VAPID keypair from environment variables and exposes:
 *   - getVapidPublicKeyForBrowser(): the public key in the format
 *     PushManager.subscribe() expects (base64url of uncompressed raw P-256).
 *   - sendWebPushToUser(userId, payload): fans out to every push_subscriptions
 *     row for that user and purges expired endpoints (HTTP 404/410).
 *
 * Setup:
 *   1. Run: npx @pushforge/builder vapid
 *   2. Add to .env:
 *        VAPID_PUBLIC_KEY=<base64url string from CLI output>
 *        VAPID_PRIVATE_KEY=<JWK JSON from CLI output, single line>
 *        VAPID_SUBJECT=mailto:you@yourdomain.com
 *   3. For Cloudflare prod, mirror with: wrangler secret put VAPID_PRIVATE_KEY etc.
 */

import { buildPushHTTPRequest } from '@pushforge/builder'
import { queryRows, execute } from '~~/server/utils/db'

interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  icon?: string
}

interface StoredSubscription {
  endpoint: string
  p256dh_key: string
  auth_key: string
}

function getEnv(): { publicKey: string; privateJwk: any; subject: string } | null {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return null
  try {
    return {
      publicKey: pub.trim(),
      privateJwk: JSON.parse(priv),
      subject,
    }
  } catch (err) {
    console.error('[WebPush] VAPID_PRIVATE_KEY is not valid JSON:', err)
    return null
  }
}

/**
 * Returns the VAPID public key in the base64url-encoded uncompressed P-256
 * format that PushManager.subscribe expects as `applicationServerKey`.
 * `npx @pushforge/builder vapid` already outputs the public key in this
 * format, so we return it verbatim.
 */
export function getVapidPublicKeyForBrowser(): string | null {
  const env = getEnv()
  return env?.publicKey ?? null
}

/**
 * Fan out a push to every device the user has subscribed.
 * Returns counts of {sent, failed, purged}. Never throws.
 * Endpoints that respond 404/410 (subscription expired) are deleted.
 */
export async function sendWebPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: number; purged: number }> {
  const env = getEnv()
  if (!env) {
    return { sent: 0, failed: 0, purged: 0 }
  }

  let subs: StoredSubscription[] = []
  try {
    subs = await queryRows(
      `SELECT endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_id = $1`,
      [userId]
    ) as StoredSubscription[]
  } catch (err) {
    console.error('[WebPush] Failed to load subscriptions:', err)
    return { sent: 0, failed: 0, purged: 0 }
  }

  if (subs.length === 0) return { sent: 0, failed: 0, purged: 0 }

  let sent = 0
  let failed = 0
  let purged = 0
  const jsonPayload: Record<string, string> = {
    title: payload.title,
    body: payload.body,
  }
  if (payload.url) jsonPayload.url = payload.url
  if (payload.tag) jsonPayload.tag = payload.tag
  if (payload.icon) jsonPayload.icon = payload.icon

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK: env.privateJwk,
          subscription: {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
          },
          message: {
            payload: jsonPayload,
            adminContact: env.subject,
            options: { ttl: 3600, urgency: 'normal' },
          },
        })

        const res = await fetch(endpoint, { method: 'POST', headers, body })

        if (res.status === 404 || res.status === 410) {
          await execute(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [sub.endpoint])
          purged++
          return
        }

        if (res.ok) {
          sent++
          await execute(
            `UPDATE push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1`,
            [sub.endpoint]
          )
        } else {
          failed++
          console.warn('[WebPush] Push failed', res.status, await res.text().catch(() => ''))
        }
      } catch (err) {
        failed++
        console.error('[WebPush] Send error:', err)
      }
    })
  )

  return { sent, failed, purged }
}
