import pg from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import {
  createCrmInboundEmailProcessor
} from '~~/server/utils/crm/emailInboundProcessor'
import type {
  CrmEmailInboundProcessingRequest
} from '~~/server/utils/crm/emailInboundProcessingContracts'

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim()
  if (!value) throw new Error('DATABASE_URL is required')
  return value
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: requireDatabaseUrl() })
  await client.connect()

  const smokeId = randomUUID()
  const routeHash = createHash('sha256')
    .update(`crm-email-b5-smoke:${smokeId}`)
    .digest('hex')
  const idempotencyKey = `crm-inbound:${createHash('sha256')
    .update(`message:${smokeId}`)
    .digest('hex')}`
  const receivedAt = new Date().toISOString()
  const receivedDatePath = receivedAt
    .slice(0, 10)
    .replaceAll('-', '/')
  const rawMimeExpiresAt = new Date(
    Date.parse(receivedAt) + 30 * 24 * 60 * 60 * 1000
  ).toISOString()
  const messageR2Prefix
    = `crm-email/inbound/${receivedDatePath}/${randomUUID()}`
  let transactionOpen = false

  try {
    await client.query('BEGIN')
    transactionOpen = true

    const clients = await client.query<{ id: string }>(
      `SELECT id
         FROM agency_clients
        ORDER BY created_at, id
        LIMIT 2`
    )
    if (clients.rows.length < 2) {
      throw new Error('CRM email smoke requires two existing clients')
    }
    const [owner, foreign] = clients.rows

    const routeResult = await client.query<{ id: string }>(
      `INSERT INTO crm_email_routes (
         client_id, route_kind, token_version, route_token_hash,
         recipient_domain, created_by
       )
       VALUES ($1, 'lead_inbox', 1, $2, 'mail.xeroflow.invalid', $3)
       RETURNING id`,
      [owner!.id, routeHash, `smoke:${smokeId}`]
    )
    const routeId = routeResult.rows[0]!.id

    const request: CrmEmailInboundProcessingRequest = {
      job: {
        version: 1,
        type: 'crm.email.inbound',
        idempotencyKey,
        routeId,
        clientId: owner!.id,
        conversationId: null,
        routeKind: 'lead_inbox',
        provider: 'cloudflare_email',
        providerMessageId: `<crm-email-b5-${smokeId}@example.invalid>`,
        rawMimeR2Key: `${messageR2Prefix}/message.eml`,
        rawMimeSha256: createHash('sha256')
          .update(`raw:${smokeId}`)
          .digest('hex'),
        rawMimeExpiresAt,
        attachments: [{
          r2ObjectKey: `${messageR2Prefix}/attachments/01.bin`,
          filename: 'smoke.txt',
          contentType: 'text/plain',
          byteSize: 5,
          sha256: createHash('sha256').update('smoke').digest('hex'),
          contentId: null
        }],
        receivedAt
      },
      email: {
        from: {
          address: `crm-email-b5-${smokeId}@example.invalid`,
          name: 'CRM Email Smoke'
        },
        to: [{
          address: 'lead+smoke@mail.xeroflow.invalid',
          name: null
        }],
        cc: [],
        replyTo: [],
        subject: 'CRM email B5 rollback smoke',
        text: 'Rollback-only smoke body.',
        internetMessageId:
          `<crm-email-b5-${smokeId}@example.invalid>`,
        inReplyTo: null,
        references: []
      }
    }
    const processor = createCrmInboundEmailProcessor({
      transaction: async callback => callback(client)
    })

    const created = await processor.process(request)
    const duplicate = await processor.process(request)
    const crossTenant = await processor.process({
      ...request,
      job: {
        ...request.job,
        clientId: foreign!.id,
        idempotencyKey: `crm-inbound:${createHash('sha256')
          .update(`cross-tenant:${smokeId}`)
          .digest('hex')}`,
        providerMessageId:
          `<crm-email-b5-cross-${smokeId}@example.invalid>`,
        rawMimeR2Key:
          `crm-email/inbound/${receivedDatePath}/${randomUUID()}/message.eml`
      },
      email: {
        ...request.email,
        internetMessageId:
          `<crm-email-b5-cross-${smokeId}@example.invalid>`
      }
    })

    await client.query(
      `UPDATE crm_email_routes
          SET is_active = FALSE, revoked_at = NOW()
        WHERE id = $1 AND client_id = $2`,
      [routeId, owner!.id]
    )
    const revoked = await processor.process({
      ...request,
      job: {
        ...request.job,
        idempotencyKey: `crm-inbound:${createHash('sha256')
          .update(`revoked:${smokeId}`)
          .digest('hex')}`,
        providerMessageId:
          `<crm-email-b5-revoked-${smokeId}@example.invalid>`,
        rawMimeR2Key:
          `crm-email/inbound/${receivedDatePath}/${randomUUID()}/message.eml`
      },
      email: {
        ...request.email,
        internetMessageId:
          `<crm-email-b5-revoked-${smokeId}@example.invalid>`
      }
    })

    const proof = await client.query<{
      leads: string
      links: string
      conversations: string
      messages: string
      events: string
      attachments: string
      communications: string
      last_used: boolean
    }>(
      `SELECT
         (SELECT COUNT(*) FROM leads
           WHERE source = 'email' AND source_lead_id = $1)::text AS leads,
         (SELECT COUNT(*) FROM lead_crm_links link
           JOIN leads lead ON lead.id = link.lead_id
          WHERE lead.source_lead_id = $1)::text AS links,
         (SELECT COUNT(*) FROM crm_conversations
           WHERE metadata = '{}'::jsonb
             AND subject = 'CRM email B5 rollback smoke'
             AND client_id = $2)::text AS conversations,
         (SELECT COUNT(*) FROM crm_messages
           WHERE idempotency_key = $1)::text AS messages,
         (SELECT COUNT(*) FROM crm_message_events event
           JOIN crm_messages message ON message.id = event.message_id
          WHERE message.idempotency_key = $1
            AND event.event_type = 'received')::text AS events,
         (SELECT COUNT(*) FROM crm_message_attachments attachment
           JOIN crm_messages message ON message.id = attachment.message_id
          WHERE message.idempotency_key = $1
            AND attachment.scan_status = 'pending')::text AS attachments,
         (SELECT COUNT(*) FROM crm_communications communication
           JOIN crm_messages message
             ON communication.external_id = 'crm_message:' || message.id::text
          WHERE message.idempotency_key = $1
            AND communication.source = 'email_bridge')::text AS communications,
         EXISTS (
           SELECT 1 FROM crm_email_routes
            WHERE id = $3 AND last_used_at IS NOT NULL
         ) AS last_used`,
      [idempotencyKey, owner!.id, routeId]
    )

    const result = {
      created: created.status,
      duplicate: duplicate.status,
      crossTenant: crossTenant.status,
      revoked: revoked.status,
      ...proof.rows[0]
    }
    const expected = {
      created: 'created',
      duplicate: 'duplicate',
      crossTenant: 'route_unavailable',
      revoked: 'route_unavailable',
      leads: '1',
      links: '1',
      conversations: '1',
      messages: '1',
      events: '1',
      attachments: '1',
      communications: '1',
      last_used: true
    }
    if (JSON.stringify(result) !== JSON.stringify(expected)) {
      throw new Error(`CRM email smoke proof failed: ${JSON.stringify(result)}`)
    }
    console.info(JSON.stringify({ liveRollbackProof: result }))

    await client.query('ROLLBACK')
    transactionOpen = false

    const retained = await client.query<{ count: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM leads WHERE source_lead_id = $1)
         + (SELECT COUNT(*) FROM crm_messages WHERE idempotency_key = $1)
         + (SELECT COUNT(*) FROM crm_email_routes WHERE route_token_hash = $2)
       )::text AS count`,
      [idempotencyKey, routeHash]
    )
    if (retained.rows[0]?.count !== '0') {
      throw new Error('CRM email smoke rollback retained rows')
    }
    console.info(JSON.stringify({ retainedSmokeRows: 0 }))
  } finally {
    if (transactionOpen) await client.query('ROLLBACK')
    await client.end()
  }
}

await main()
