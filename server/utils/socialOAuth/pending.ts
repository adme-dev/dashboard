// server/utils/socialOAuth/pending.ts
// Holds the multi-page selection (page list + tokens) SERVER-SIDE in the CACHE KV binding, keyed by a
// nonce, so the OAuth redirect carries only a signed nonce — never a token in a URL. 10-min TTL.
import type { H3Event } from 'h3'
import type { ManagedPage } from './meta'

const TTL_SECONDS = 600
const key = (nonce: string) => `social_oauth_pending:${nonce}`

export interface PendingConnection {
  clientId: string
  userId: string
  expiresAt: string | null   // token_expires_at to stamp on the saved rows
  pages: ManagedPage[]
}

function kv(event: H3Event): any | null {
  return (event.context as any).cloudflare?.env?.CACHE ?? null
}

/** Returns true if stored, false if KV is unavailable (caller must handle the degraded path). */
export async function putPending(event: H3Event, nonce: string, data: PendingConnection): Promise<boolean> {
  const store = kv(event)
  if (!store) return false
  await store.put(key(nonce), JSON.stringify(data), { expirationTtl: TTL_SECONDS })
  return true
}

export async function getPending(event: H3Event, nonce: string): Promise<PendingConnection | null> {
  const store = kv(event)
  if (!store) return null
  const raw = await store.get(key(nonce))
  return raw ? JSON.parse(raw) as PendingConnection : null
}

export async function delPending(event: H3Event, nonce: string): Promise<void> {
  const store = kv(event)
  if (store) await store.delete(key(nonce))
}
