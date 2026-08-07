import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { transaction as defaultTransaction } from '~~/server/utils/db'
import type { PublicTransferDraft } from '../../../shared/types/send'
import { resolveTransferPolicy, type SendPolicyConfig } from './policy'
import { createSendToken, hashSendToken, type SendTokenPair } from './tokens'

const EMAIL_SCHEMA = z.string().trim().email().max(320).transform(value => value.toLowerCase())
const VERIFICATION_TTL_MS = 15 * 60 * 1000

interface QueryResultLike { rows: unknown[] }
interface QueryClientLike {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>
}

interface PublicSenderRow {
  id: string
  verification_status: string
  abuse_status: string
}

interface PublicTransferRow {
  id: string
  public_sender_id: string
  status: string
  version: number | string
  expires_at: Date | string
}

interface VerificationRow {
  id: string
  transfer_id: string
  public_sender_id: string
  token_hash: string
  management_token_hash: string
  verification_expires_at: Date | string
  verification_consumed_at: Date | string | null
  transfer_status: string
}

export type PublicSendErrorCode
  = 'INVALID_EMAIL'
    | 'POLICY_REJECTED'
    | 'SENDER_UNAVAILABLE'
    | 'DRAFT_CONFLICT'
    | 'EMAIL_UNAVAILABLE'
    | 'VERIFICATION_INVALID'
    | 'VERIFICATION_EXPIRED'
    | 'VERIFICATION_USED'
    | 'VERIFICATION_UNAVAILABLE'

export class PublicSendError extends Error {
  constructor(public readonly code: PublicSendErrorCode, message: string) {
    super(message)
    this.name = 'PublicSendError'
  }
}

export interface PublicVerificationDelivery {
  email: string
  transferId: string
  verificationToken: string
  managementToken: string
  verificationExpiresAt: string
}

export interface PublicSendServiceDeps {
  transaction: typeof defaultTransaction
  createToken(): SendTokenPair
  hashToken(value: string): string
  sendVerification(input: PublicVerificationDelivery): Promise<void>
}

function scopedIdempotencyKey(email: string, callerKey: string): string {
  return createHash('sha256').update(`${email}\0${callerKey}`, 'utf8').digest('hex')
}

function hashesMatch(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

async function unavailableDelivery(): Promise<never> {
  throw new PublicSendError('EMAIL_UNAVAILABLE', 'Public Send email is not configured')
}

export function createPublicSendService(overrides: Partial<PublicSendServiceDeps> = {}) {
  const deps: PublicSendServiceDeps = {
    transaction: overrides.transaction ?? defaultTransaction,
    createToken: overrides.createToken ?? createSendToken,
    hashToken: overrides.hashToken ?? hashSendToken,
    sendVerification: overrides.sendVerification ?? unavailableDelivery
  }

  return {
    async createDraft(input: {
      email: string
      draft: PublicTransferDraft
      policy: SendPolicyConfig
      now?: Date
    }): Promise<{
      transferId: string
      status: 'awaiting_verification'
      verificationExpiresAt: string
    }> {
      const email = EMAIL_SCHEMA.safeParse(input.email)
      if (!email.success) throw new PublicSendError('INVALID_EMAIL', 'Enter a valid email address')
      if (input.draft.password || input.draft.recipients.length > 0) {
        throw new PublicSendError('POLICY_REJECTED', 'Recipients and passwords are not available in the public beta')
      }

      const now = input.now ?? new Date()
      let resolved: ReturnType<typeof resolveTransferPolicy>
      try {
        resolved = resolveTransferPolicy(input.policy, {
          now,
          expiresAt: new Date(input.draft.expiresAt),
          fileSizes: [],
          recipientCount: 0,
          maxDownloads: input.draft.maxDownloads
        })
      } catch (error) {
        throw new PublicSendError(
          'POLICY_REJECTED',
          error instanceof Error ? error.message : 'Public Send policy rejected the request'
        )
      }
      if (!resolved.snapshot.scanRequired || resolved.snapshot.surface !== 'public') {
        throw new PublicSendError('POLICY_REJECTED', 'Public Send requires the public scan policy')
      }

      const verificationToken = deps.createToken()
      const managementToken = deps.createToken()
      const verificationExpiresAt = new Date(now.getTime() + VERIFICATION_TTL_MS)
      const idempotencyHash = scopedIdempotencyKey(email.data, input.draft.idempotencyKey)

      const created = await deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const senderResult = await db.query(
          `SELECT id, verification_status, abuse_status
             FROM send_public_senders
            WHERE email_normalized = $1
            FOR UPDATE`,
          [email.data]
        )
        let sender = senderResult.rows[0] as PublicSenderRow | undefined
        if (sender && (sender.verification_status === 'blocked'
          || sender.verification_status === 'suspended'
          || sender.abuse_status === 'blocked')) {
          throw new PublicSendError('SENDER_UNAVAILABLE', 'Public Send is unavailable for this sender')
        }
        if (!sender) {
          const inserted = await db.query(
            `INSERT INTO send_public_senders (
               email_normalized, verification_status, abuse_status
             ) VALUES ($1, 'pending', 'clear')
             RETURNING id`,
            [email.data]
          )
          const row = inserted.rows[0] as { id: string } | undefined
          if (!row) throw new Error('Public sender was not persisted')
          sender = { id: row.id, verification_status: 'pending', abuse_status: 'clear' }
        }

        const existingResult = await db.query(
          `SELECT id, public_sender_id, status, version, expires_at
             FROM send_transfers
            WHERE sender_class = 'public'
              AND public_sender_id = $1
              AND creation_idempotency_key = $2
            LIMIT 1
            FOR UPDATE`,
          [sender.id, idempotencyHash]
        )
        const existing = existingResult.rows[0] as PublicTransferRow | undefined
        if (existing && existing.status !== 'awaiting_verification') {
          throw new PublicSendError('DRAFT_CONFLICT', 'This public draft has already progressed')
        }

        let transfer: PublicTransferRow
        if (existing) {
          const rotated = await db.query(
            `UPDATE send_transfers
                SET management_token_hash = $2,
                    updated_at = NOW()
              WHERE id = $1
                AND status = 'awaiting_verification'
            RETURNING id, public_sender_id, status, version, expires_at`,
            [existing.id, managementToken.hash]
          )
          transfer = rotated.rows[0] as PublicTransferRow
        } else {
          const inserted = await db.query(
            `INSERT INTO send_transfers (
               tenant_id, client_id, project_id, sender_class,
               owner_team_member_id, public_sender_id, status, title, message,
               share_token_hash, management_token_hash, access_mode, password_hash,
               max_downloads, configured_max_bytes, configured_max_files,
               policy_snapshot, creation_idempotency_key, expires_at
             ) VALUES (
               NULL, NULL, NULL, 'public', NULL, $1, 'awaiting_verification', $2, $3,
               NULL, $4, 'link', NULL, $5, $6, $7, $8::jsonb, $9, $10
             )
             RETURNING id, public_sender_id, status, version, expires_at`,
            [
              sender.id,
              input.draft.title,
              input.draft.message ?? null,
              managementToken.hash,
              resolved.snapshot.maxDownloads,
              resolved.snapshot.maxTransferBytes,
              resolved.snapshot.maxFiles,
              JSON.stringify(resolved.snapshot),
              idempotencyHash,
              resolved.expiresAt.toISOString()
            ]
          )
          transfer = inserted.rows[0] as PublicTransferRow
          if (!transfer) throw new Error('Public transfer was not persisted')

          await db.query(
            `INSERT INTO send_events (
               transfer_id, actor_class, actor_id, event_type, idempotency_key, metadata
             ) VALUES ($1, 'public_sender', $2, 'draft_created', $3, $4::jsonb)`,
            [
              transfer.id,
              sender.id,
              `public-draft:${idempotencyHash}`,
              JSON.stringify({ access: 'verified_public', scanRequired: true })
            ]
          )
        }

        const challengeResult = await db.query(
          `INSERT INTO send_public_verifications (
             transfer_id, public_sender_id, token_hash, verification_expires_at
           ) VALUES ($1, $2, $3, $4)
           ON CONFLICT (transfer_id) DO UPDATE
             SET token_hash = EXCLUDED.token_hash,
                 verification_expires_at = EXCLUDED.verification_expires_at,
                 verification_consumed_at = NULL,
                 attempts = send_public_verifications.attempts + 1,
                 updated_at = NOW()
           RETURNING id`,
          [transfer.id, sender.id, verificationToken.hash, verificationExpiresAt.toISOString()]
        )
        if (!challengeResult.rows[0]) throw new Error('Public verification challenge was not persisted')

        return { transferId: transfer.id }
      })

      try {
        await deps.sendVerification({
          email: email.data,
          transferId: created.transferId,
          verificationToken: verificationToken.raw,
          managementToken: managementToken.raw,
          verificationExpiresAt: verificationExpiresAt.toISOString()
        })
      } catch (error) {
        if (error instanceof PublicSendError) throw error
        throw new PublicSendError('EMAIL_UNAVAILABLE', 'Verification email could not be sent')
      }

      return {
        transferId: created.transferId,
        status: 'awaiting_verification',
        verificationExpiresAt: verificationExpiresAt.toISOString()
      }
    },

    async verifySender(input: {
      transferId: string
      verificationToken: string
      managementToken: string
      now?: Date
    }): Promise<{
      transferId: string
      publicSenderId: string
      status: 'uploading'
      managementToken: string
    }> {
      const now = input.now ?? new Date()
      const verificationHash = deps.hashToken(input.verificationToken)
      const managementHash = deps.hashToken(input.managementToken)

      return deps.transaction(async (database) => {
        const db = database as unknown as QueryClientLike
        const result = await db.query(
          `SELECT v.id, v.transfer_id, v.public_sender_id, v.token_hash,
                  v.verification_expires_at, v.verification_consumed_at,
                  t.management_token_hash, t.status AS transfer_status
             FROM send_public_verifications v
             JOIN send_transfers t ON t.id = v.transfer_id
            WHERE v.transfer_id = $1
              AND v.token_hash = $2
              AND t.sender_class = 'public'
            FOR UPDATE OF v, t`,
          [input.transferId, verificationHash]
        )
        const challenge = result.rows[0] as VerificationRow | undefined
        if (!challenge || !hashesMatch(managementHash, challenge.management_token_hash)) {
          throw new PublicSendError('VERIFICATION_INVALID', 'Verification link is invalid')
        }
        if (challenge.verification_consumed_at) {
          throw new PublicSendError('VERIFICATION_USED', 'Verification link has already been used')
        }
        if (new Date(challenge.verification_expires_at).getTime() <= now.getTime()) {
          throw new PublicSendError('VERIFICATION_EXPIRED', 'Verification link has expired')
        }
        if (challenge.transfer_status !== 'awaiting_verification') {
          throw new PublicSendError('VERIFICATION_UNAVAILABLE', 'Transfer cannot be verified')
        }

        await db.query(
          `UPDATE send_public_verifications
              SET verification_consumed_at = $2,
                  attempts = attempts + 1,
                  updated_at = NOW()
            WHERE id = $1
              AND verification_consumed_at IS NULL`,
          [challenge.id, now.toISOString()]
        )
        await db.query(
          `UPDATE send_public_senders
              SET verification_status = 'verified',
                  verified_at = COALESCE(verified_at, $2),
                  updated_at = NOW()
            WHERE id = $1
              AND abuse_status <> 'blocked'`,
          [challenge.public_sender_id, now.toISOString()]
        )
        const updated = await db.query(
          `UPDATE send_transfers
              SET status = 'uploading',
                  version = version + 1,
                  updated_at = NOW()
            WHERE id = $1
              AND status = 'awaiting_verification'
          RETURNING id, public_sender_id, status, version, expires_at`,
          [challenge.transfer_id]
        )
        if (!updated.rows[0]) {
          throw new PublicSendError('VERIFICATION_UNAVAILABLE', 'Transfer cannot be verified')
        }
        await db.query(
          `INSERT INTO send_events (
             transfer_id, actor_class, actor_id, event_type, idempotency_key, metadata
           ) VALUES ($1, 'public_sender', $2, 'sender_verified', $3, $4::jsonb)`,
          [
            challenge.transfer_id,
            challenge.public_sender_id,
            `sender-verified:${challenge.id}`,
            JSON.stringify({ verification: 'email', challengeId: challenge.id })
          ]
        )

        return {
          transferId: challenge.transfer_id,
          publicSenderId: challenge.public_sender_id,
          status: 'uploading' as const,
          managementToken: input.managementToken
        }
      })
    }
  }
}
