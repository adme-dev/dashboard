import { createHash } from 'node:crypto'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'

export const CRM_EMAIL_OUTBOUND_POLICY_CODES = [
  'allowed',
  'permission_denied',
  'recipient_unavailable',
  'recipient_opted_out',
  'recipient_suppressed',
  'sender_unavailable',
  'rate_limited',
  'policy_unavailable'
] as const

export type CrmEmailOutboundPolicyCode
  = typeof CRM_EMAIL_OUTBOUND_POLICY_CODES[number]

export type CrmEmailOutboundActorKind = 'agency_user' | 'portal_user'
export type CrmEmailOutboundRateScope = 'minute' | 'day'

export interface CrmEmailOutboundPolicyRequest {
  clientId: string
  personId: string
  requestedRecipientAddress: string
  senderIdentityId: string | null
  actor: {
    kind: CrmEmailOutboundActorKind
    id: string
    canSend: boolean
  }
}

export interface CrmEmailOutboundRecipient {
  personId: string
  emailAddress: string
  doNotContact: boolean
  doNotEmail: boolean
}

export interface CrmEmailOutboundSender {
  senderIdentityId: string
  emailAddress: string
  displayName: string | null
}

export interface CrmEmailOutboundRateRequest {
  clientId: string
  actorKind: CrmEmailOutboundActorKind
  actorId: string
  scope: CrmEmailOutboundRateScope
  limit: number
  windowSeconds: number
}

export interface CrmEmailOutboundPolicyRepository {
  findRecipient(input: {
    clientId: string
    personId: string
    emailAddress: string
  }): Promise<CrmEmailOutboundRecipient | null>
  isSuppressed(emailAddress: string): Promise<boolean>
  findReadySender(input: {
    clientId: string
    senderIdentityId: string | null
  }): Promise<CrmEmailOutboundSender | null>
  consumeRate(input: CrmEmailOutboundRateRequest): Promise<{
    allowed: boolean
    resetAt: string | null
  }>
}

export type CrmEmailOutboundPolicyResult
  = | {
    allowed: true
    code: 'allowed'
    personId: string
    recipient: {
      address: string
      name: null
    }
    sender: {
      senderIdentityId: string
      address: string
      name: string | null
    }
    rateLimitResetAt: string | null
  }
  | {
    allowed: false
    code: Exclude<CrmEmailOutboundPolicyCode, 'allowed' | 'rate_limited'>
  }
  | {
    allowed: false
    code: 'rate_limited'
    rateLimitResetAt: string | null
  }

export interface CrmEmailOutboundPolicyLimits {
  perMinute: number
  perDay: number
}

type QueryOne = <T = unknown>(
  sql: string,
  params?: unknown[]
) => Promise<T | null>

const recipientAddressSchema = z
  .string()
  .trim()
  .max(320)
  .email()
  .transform(address => address.toLowerCase())

const DEFAULT_LIMITS: CrmEmailOutboundPolicyLimits = {
  perMinute: 30,
  perDay: 500
}

function rateBucketKey(input: CrmEmailOutboundRateRequest): string {
  const actorHash = createHash('sha256')
    .update(`${input.clientId}\u0000${input.actorKind}\u0000${input.actorId}`)
    .digest('hex')

  return `crm-email-outbound:${input.scope}:${actorHash}`
}

export function createPostgresCrmEmailOutboundPolicyRepository(
  queryOneImpl: QueryOne = queryOne
): CrmEmailOutboundPolicyRepository {
  return {
    async findRecipient(input) {
      const row = await queryOneImpl<{
        id: string
        email_address: string
        do_not_contact: boolean
        do_not_email: boolean
      }>(
        `SELECT
           id,
           LOWER(email) AS email_address,
           do_not_contact,
           do_not_email
         FROM crm_people
         WHERE client_id = $1
           AND id = $2
           AND LOWER(email) = $3
           AND deleted_at IS NULL
         LIMIT 1`,
        [input.clientId, input.personId, input.emailAddress]
      )

      return row
        ? {
            personId: row.id,
            emailAddress: row.email_address,
            doNotContact: row.do_not_contact,
            doNotEmail: row.do_not_email
          }
        : null
    },

    async isSuppressed(emailAddress) {
      const row = await queryOneImpl<{ suppressed: boolean }>(
        `SELECT TRUE AS suppressed
         FROM suppression_list
         WHERE email = $1
         LIMIT 1`,
        [emailAddress]
      )
      return row?.suppressed === true
    },

    async findReadySender(input) {
      const selectedIdentityClause = input.senderIdentityId
        ? 'AND id = $2'
        : 'AND is_default = TRUE'
      const params = input.senderIdentityId
        ? [input.clientId, input.senderIdentityId]
        : [input.clientId]
      const row = await queryOneImpl<{
        id: string
        email_address: string
        display_name: string | null
      }>(
        `SELECT id, email_address, display_name
         FROM crm_email_sender_identities
         WHERE client_id = $1
           ${selectedIdentityClause}
           AND status = 'ready'
         LIMIT 1`,
        params
      )

      return row
        ? {
            senderIdentityId: row.id,
            emailAddress: row.email_address,
            displayName: row.display_name
          }
        : null
    },

    async consumeRate(input) {
      const row = await queryOneImpl<{
        allowed: boolean
        reset_at: string | Date
      }>(
        `WITH consumed AS (
           INSERT INTO ratelimit_buckets (key, count, window_started_at)
           VALUES ($1, 1, NOW())
           ON CONFLICT (key) DO UPDATE
           SET
             count = CASE
               WHEN ratelimit_buckets.window_started_at
                 < NOW() - ($2::integer * INTERVAL '1 second')
                 THEN 1
               ELSE ratelimit_buckets.count + 1
             END,
             window_started_at = CASE
               WHEN ratelimit_buckets.window_started_at
                 < NOW() - ($2::integer * INTERVAL '1 second')
                 THEN NOW()
               ELSE ratelimit_buckets.window_started_at
             END
           WHERE
             ratelimit_buckets.window_started_at
               < NOW() - ($2::integer * INTERVAL '1 second')
             OR ratelimit_buckets.count < $3
           RETURNING
             TRUE AS allowed,
             window_started_at
               + ($2::integer * INTERVAL '1 second') AS reset_at
         )
         SELECT allowed, reset_at FROM consumed
         UNION ALL
         SELECT
           FALSE AS allowed,
           window_started_at
             + ($2::integer * INTERVAL '1 second') AS reset_at
         FROM ratelimit_buckets
         WHERE key = $1
           AND NOT EXISTS (SELECT 1 FROM consumed)
         LIMIT 1`,
        [rateBucketKey(input), input.windowSeconds, input.limit]
      )

      return {
        allowed: row?.allowed === true,
        resetAt: row
          ? new Date(row.reset_at).toISOString()
          : null
      }
    }
  }
}

export async function authorizeCrmEmailOutbound(
  request: CrmEmailOutboundPolicyRequest,
  repository: CrmEmailOutboundPolicyRepository
    = createPostgresCrmEmailOutboundPolicyRepository(),
  limits: CrmEmailOutboundPolicyLimits = DEFAULT_LIMITS
): Promise<CrmEmailOutboundPolicyResult> {
  if (!request.actor.canSend) {
    return { allowed: false, code: 'permission_denied' }
  }

  const parsedAddress = recipientAddressSchema.safeParse(
    request.requestedRecipientAddress
  )
  if (!parsedAddress.success) {
    return { allowed: false, code: 'recipient_unavailable' }
  }

  try {
    const recipient = await repository.findRecipient({
      clientId: request.clientId,
      personId: request.personId,
      emailAddress: parsedAddress.data
    })
    if (!recipient) {
      return { allowed: false, code: 'recipient_unavailable' }
    }
    if (recipient.doNotContact || recipient.doNotEmail) {
      return { allowed: false, code: 'recipient_opted_out' }
    }
    if (await repository.isSuppressed(recipient.emailAddress)) {
      return { allowed: false, code: 'recipient_suppressed' }
    }

    const sender = await repository.findReadySender({
      clientId: request.clientId,
      senderIdentityId: request.senderIdentityId
    })
    if (!sender) {
      return { allowed: false, code: 'sender_unavailable' }
    }

    const minute = await repository.consumeRate({
      clientId: request.clientId,
      actorKind: request.actor.kind,
      actorId: request.actor.id,
      scope: 'minute',
      limit: limits.perMinute,
      windowSeconds: 60
    })
    if (!minute.allowed) {
      return {
        allowed: false,
        code: 'rate_limited',
        rateLimitResetAt: minute.resetAt
      }
    }

    const day = await repository.consumeRate({
      clientId: request.clientId,
      actorKind: request.actor.kind,
      actorId: request.actor.id,
      scope: 'day',
      limit: limits.perDay,
      windowSeconds: 86400
    })
    if (!day.allowed) {
      return {
        allowed: false,
        code: 'rate_limited',
        rateLimitResetAt: day.resetAt
      }
    }

    return {
      allowed: true,
      code: 'allowed',
      personId: recipient.personId,
      recipient: {
        address: recipient.emailAddress,
        name: null
      },
      sender: {
        senderIdentityId: sender.senderIdentityId,
        address: sender.emailAddress,
        name: sender.displayName
      },
      rateLimitResetAt: day.resetAt
    }
  } catch {
    return { allowed: false, code: 'policy_unavailable' }
  }
}
