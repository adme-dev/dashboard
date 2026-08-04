import { createHash, randomUUID } from 'node:crypto'
import type { Pool } from '@neondatabase/serverless'

import { transaction } from '~~/server/utils/db'

type TransactionDb = Pick<Pool, 'query'>

export interface GodModeChatSubmissionRequest {
  actorUserId: string
  conversationId: string
  transportRetryToken: string
  content: string
  request: unknown
}

export type GodModeChatSubmissionClaim =
  | { state: 'claimed'; submissionId: string; userMessageId: string }
  | {
      state: 'completed'
      submissionId: string
      userMessageId: string
      response: Record<string, unknown>
    }
  | { state: 'blocked'; reason: 'processing' | 'failed' | 'token_reused' }

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function isTransportRetryToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

export async function claimGodModeChatSubmission(
  request: GodModeChatSubmissionRequest,
  runTransaction: <T>(
    callback: (db: TransactionDb) => Promise<T>,
  ) => Promise<T> = (callback) => transaction(callback as any),
): Promise<GodModeChatSubmissionClaim> {
  const tokenHash = digest(request.transportRetryToken)
  const requestDigest = digest(stableJson(request.request))
  return await runTransaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `${request.actorUserId}:${request.conversationId}:${tokenHash}`,
    ])
    const existing = (
      await db.query<any>(
        `SELECT id, user_message_id, request_digest, state, response_payload
         FROM ai_chat_submissions
        WHERE actor_user_id = $1 AND conversation_id = $2 AND transport_token_hash = $3
        FOR UPDATE`,
        [request.actorUserId, request.conversationId, tokenHash],
      )
    ).rows[0]
    if (existing) {
      if (existing.request_digest !== requestDigest)
        return { state: 'blocked', reason: 'token_reused' }
      if (existing.state === 'completed' && existing.response_payload) {
        return {
          state: 'completed',
          submissionId: existing.id,
          userMessageId: existing.user_message_id,
          response: existing.response_payload,
        }
      }
      return {
        state: 'blocked',
        reason: existing.state === 'failed' ? 'failed' : 'processing',
      }
    }

    const submissionId = randomUUID()
    const userMessageId = randomUUID()
    await db.query(
      `INSERT INTO ai_chat_submissions (
         id, actor_user_id, conversation_id, transport_token_hash, request_digest,
         user_message_id, state
       ) VALUES ($1, $2, $3, $4, $5, $6, 'processing')`,
      [
        submissionId,
        request.actorUserId,
        request.conversationId,
        tokenHash,
        requestDigest,
        userMessageId,
      ],
    )
    return { state: 'claimed', submissionId, userMessageId }
  })
}

export async function completeGodModeChatSubmission(
  input: {
    submissionId: string
    actorUserId: string
    response: Record<string, unknown>
    assistantMessageId?: string
  },
  runTransaction: <T>(
    callback: (db: TransactionDb) => Promise<T>,
  ) => Promise<T> = (callback) => transaction(callback as any),
): Promise<void> {
  await runTransaction(async (db) => {
    const updated = await db.query(
      `UPDATE ai_chat_submissions
          SET state = 'completed', response_payload = $3::jsonb,
              assistant_message_id = $4, completed_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND actor_user_id = $2 AND state = 'processing'`,
      [
        input.submissionId,
        input.actorUserId,
        JSON.stringify(input.response),
        input.assistantMessageId ?? null,
      ],
    )
    if ((updated.rowCount ?? 0) !== 1)
      throw new Error('God mode chat submission completion rejected')
  })
}
