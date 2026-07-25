import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

const bodySchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('suppress'),
    profileId: z.string().uuid(),
    destination: z.enum(['google_ads', 'meta', 'all']),
    reasonCode: z.enum([
      'client_request',
      'privacy_request',
      'incorrect_consent',
      'legal_hold',
    ]),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.strictObject({
    action: z.literal('release'),
    suppressionId: z.string().uuid(),
    reason: z.string().trim().min(3).max(1000),
  }),
])

type SuppressionRow = {
  id: string
  profile_id: string | null
  subject_hash: string | null
  purpose: string
  channel: string
  destination: string
  reason_code: string
}

function requireManager(client: Awaited<ReturnType<typeof requireClientAuth>>) {
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  if (!client.isPrimaryContact && !client.permissions.canApproveWork) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Primary contact or approval permission required',
    })
  }
}

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  requireManager(client)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || 'Invalid consent control request',
    })
  }

  const body = parsed.data
  const sourceId = `client-portal:${randomUUID()}`

  if (body.action === 'suppress') {
    const profile = await queryOne<{ id: string }>(
      `SELECT id
       FROM crm_identity_profiles
       WHERE client_id = $1 AND id = $2
       LIMIT 1`,
      [client.clientId, body.profileId],
    )
    if (!profile) {
      throw createError({ statusCode: 404, statusMessage: 'Identity profile not found' })
    }

    const existing = await queryOne<SuppressionRow>(
      `SELECT id, profile_id, subject_hash, purpose, channel, destination, reason_code
       FROM crm_persona_current_suppressions
       WHERE client_id = $1
         AND profile_id = $2
         AND purpose IN ('marketing', 'all')
         AND channel IN ('ads', 'all')
         AND destination IN ($3, 'all')
       ORDER BY occurred_at DESC
       LIMIT 1`,
      [client.clientId, body.profileId, body.destination],
    )

    if (existing) {
      return {
        ok: true,
        action: 'suppress',
        unchanged: true,
        suppressionId: existing.id,
        providerRemovalQueued: false,
        message: 'This profile is already suppressed for the selected advertising destination.',
      }
    }

    const inserted = await queryOne<SuppressionRow>(
      `INSERT INTO crm_persona_suppression_events (
         client_id,
         profile_id,
         purpose,
         channel,
         destination,
         action,
         reason_code,
         source_type,
         source_id,
         evidence,
         actor_type,
         actor_id
       )
       VALUES (
         $1, $2, 'marketing', 'ads', $3, 'suppress', $4,
         'client_portal', $5, $6::jsonb, 'client_user', $7
       )
       RETURNING id, profile_id, subject_hash, purpose, channel, destination, reason_code`,
      [
        client.clientId,
        body.profileId,
        body.destination,
        body.reasonCode,
        sourceId,
        JSON.stringify({
          reason: body.reason,
          source: 'client_portal',
          policyVersion: 'persona-consent-control-v1',
        }),
        client.id,
      ],
    )

    return {
      ok: true,
      action: 'suppress',
      unchanged: false,
      suppressionId: inserted?.id,
      providerRemovalQueued: false,
      message: 'Suppression is active. Existing provider members will be removed by audience reconciliation.',
    }
  }

  const current = await queryOne<SuppressionRow>(
    `SELECT id, profile_id, subject_hash, purpose, channel, destination, reason_code
     FROM crm_persona_current_suppressions
     WHERE client_id = $1 AND id = $2
     LIMIT 1`,
    [client.clientId, body.suppressionId],
  )

  if (!current) {
    throw createError({ statusCode: 404, statusMessage: 'Active suppression not found' })
  }

  const released = await queryOne<{ id: string }>(
    `INSERT INTO crm_persona_suppression_events (
       client_id,
       profile_id,
       subject_hash,
       purpose,
       channel,
       destination,
       action,
       reason_code,
       source_type,
       source_id,
       evidence,
       actor_type,
       actor_id
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, 'release', 'client_release',
       'client_portal', $7, $8::jsonb, 'client_user', $9
     )
     RETURNING id`,
    [
      client.clientId,
      current.profile_id,
      current.subject_hash,
      current.purpose,
      current.channel,
      current.destination,
      sourceId,
      JSON.stringify({
        reason: body.reason,
        releasedSuppressionId: current.id,
        source: 'client_portal',
        policyVersion: 'persona-consent-control-v1',
      }),
      client.id,
    ],
  )

  return {
    ok: true,
    action: 'release',
    suppressionEventId: released?.id,
    message: 'The manual suppression was released. Current person-level consent still governs eligibility.',
  }
})

