// server/utils/socialOAuth/pending.ts
// Holds the multi-page selection (page list + tokens) SERVER-SIDE in the CACHE KV binding, keyed by a
// nonce, so the OAuth redirect carries only a signed nonce — never a token in a URL. 10-min TTL.
import type { H3Event } from 'h3'
import type { ManagedPage } from './meta'
import type { GoogleBusinessLocationSelection } from './googleBusiness'

const TTL_SECONDS = 600
const key = (nonce: string) => `social_oauth_pending:${nonce}`

export interface PendingConnection {
  clientId: string
  userId: string
  platform?: 'meta' | 'google-business'
  expiresAt: string | null
  pages?: ManagedPage[]
  googleBusiness?: {
    accessToken: string
    refreshToken: string | null
    locations: GoogleBusinessLocationSelection[]
  }
}

interface PendingKv {
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>
  get(key: string): Promise<string | null>
  delete(key: string): Promise<void>
}

function kv(event: H3Event): PendingKv | null {
  const context = event.context as { cloudflare?: { env?: { CACHE?: PendingKv } } }
  return context.cloudflare?.env?.CACHE ?? null
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
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingConnection
  } catch {
    return null
  }
}

export async function delPending(event: H3Event, nonce: string): Promise<void> {
  const store = kv(event)
  if (store) await store.delete(key(nonce))
}
