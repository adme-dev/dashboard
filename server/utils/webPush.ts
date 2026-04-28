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
 *        VAPID_PUBLIC_KEY='{"kty":"EC","crv":"P-256","x":"...","y":"..."}'
 *        VAPID_PRIVATE_KEY='{"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."}'
 *        VAPID_SUBJECT="mailto:you@yourdomain.com"
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

function getEnv(): { publicJwk: any; privateJwk: any; subject: string } | null {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return null
  try {
    return {
      publicJwk: JSON.parse(pub),
      privateJwk: JSON.parse(priv),
      subject,
    }
  } catch (err) {
    console.error('[WebPush] VAPID keys are not valid JSON:', err)
    return null
  }
}

/**
 * Convert the public JWK (x,y coords) to the base64url-encoded uncompressed
 * P-256 byte string the browser's PushManager.subscribe expects as
 * `applicationServerKey`. Format: 0x04 || X || Y (65 bytes).
 */
export function getVapidPublicKeyForBrowser(): string | null {
  const env = getEnv()
  if (!env) return null
  const { x, y } = env.publicJwk
  if (!x || !y) return null

  const xBytes = base64UrlToBytes(x)
  const yBytes = base64UrlToBytes(y)
  const out = new Uint8Array(1 + xBytes.length + yBytes.length)
  out[0] = 0x04
  out.set(xBytes, 1)
  out.set(yBytes, 1 + xBytes.length)
  return bytesToBase64Url(out)
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
            payload,
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
