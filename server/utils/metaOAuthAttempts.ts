import { queryOne as dbQueryOne } from '~~/server/utils/db'

export type MetaOAuthIntent = 'connection' | 'catalog_management'

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000
const STATE_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function generateState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

export async function hashMetaOAuthState(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function createMetaOAuthAttempt(
  userId: string,
  intent: MetaOAuthIntent,
  deps: {
    targetConnectionId?: string
    randomState?: () => string
    insertAttempt?: (input: {
      userId: string
      intent: MetaOAuthIntent
      targetConnectionId: string | null
      stateDigest: string
      expiresAt: Date
    }) => Promise<{ id: string } | null>
  } = {}
): Promise<{ attemptId: string, state: string }> {
  const state = (deps.randomState || generateState)()
  if (!STATE_PATTERN.test(state)) throw new Error('Generated OAuth state is invalid')
  const stateDigest = await hashMetaOAuthState(state)
  const expiresAt = new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS)
  const insertAttempt = deps.insertAttempt || (async input => dbQueryOne<{ id: string }>(`
    INSERT INTO meta_oauth_attempts (state_digest, initiated_by, intent, target_connection_id, expires_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [input.stateDigest, input.userId, input.intent, input.targetConnectionId, input.expiresAt]))
  const attempt = await insertAttempt({
    userId,
    intent,
    targetConnectionId: deps.targetConnectionId || null,
    stateDigest,
    expiresAt
  })
  if (!attempt) throw new Error('Unable to create Meta OAuth attempt')
  return { attemptId: attempt.id, state }
}

export async function consumeMetaOAuthAttempt(
  state: string,
  userId: string,
  deps: {
    consumeAttempt?: (input: { userId: string, stateDigest: string }) => Promise<{
      id: string
      intent: MetaOAuthIntent
      targetConnectionId?: string | null
      target_connection_id?: string | null
    } | null>
  } = {}
): Promise<{ id: string, intent: MetaOAuthIntent, targetConnectionId: string | null } | null> {
  if (!STATE_PATTERN.test(state)) return null
  const stateDigest = await hashMetaOAuthState(state)
  const consumeAttempt = deps.consumeAttempt || (async input => dbQueryOne<{
    id: string
    intent: MetaOAuthIntent
    target_connection_id?: string | null
  }>(`
    UPDATE meta_oauth_attempts
    SET consumed_at = NOW()
    WHERE state_digest = $1
      AND initiated_by = $2
      AND consumed_at IS NULL
      AND expires_at > NOW()
    RETURNING id, intent, target_connection_id
  `, [input.stateDigest, input.userId]))
  const attempt = await consumeAttempt({ userId, stateDigest })
  if (!attempt) return null
  return {
    id: attempt.id,
    intent: attempt.intent,
    targetConnectionId: attempt.targetConnectionId ?? attempt.target_connection_id ?? null
  }
}
