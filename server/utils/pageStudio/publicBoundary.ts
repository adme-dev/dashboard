import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { execute, queryOne, transaction } from '~~/server/utils/db'
import {
  acceptLead,
  resolveLeadCaptureMode
} from '~~/server/utils/leads/acceptance'
import { resolveAssignedAm } from '~~/server/utils/leads/autoAssign'
import { upsertFormMetadata } from '~~/server/utils/leads/db'
import {
  CanonicalEventNameSchema,
  type CanonicalEventName
} from '~~/server/utils/measurement/contracts'
import { appendCanonicalConversionEvent } from '~~/server/utils/measurement/outbox'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'

const ScopedIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/)
const PublicRouteSchema = z.string()
  .min(1)
  .max(2048)
  .refine(value => value.startsWith('/') && !value.startsWith('//'))
  .refine(value => !value.includes('\\') && !value.split('/').includes('..'))

const ScopeSchema = z.object({
  clientId: ScopedIdSchema,
  siteId: ScopedIdSchema,
  tenantId: ScopedIdSchema
}).strict()

const AttributionSchema = z.object({
  utm_campaign: z.string().max(200).optional(),
  utm_content: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_source: z.string().max(200).optional(),
  utm_term: z.string().max(200).optional()
}).strict()

const PolicyUrlSchema = z.string().max(2048).refine((value) => {
  if (value.startsWith('/') && !value.startsWith('//')) {
    return !value.includes('\\') && !value.split('/').includes('..')
  }
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && url.hostname !== 'localhost'
  } catch {
    return false
  }
})

export const PageStudioPublicLeadSubmissionSchema = z.object({
  attribution: AttributionSchema,
  consent: z.object({
    accepted: z.literal(true),
    label: z.string().trim().min(1).max(500),
    policyUrl: PolicyUrlSchema.optional()
  }).strict().optional(),
  fields: z.record(ScopedIdSchema, z.string().max(10_000))
    .refine(fields => Object.keys(fields).length <= 100),
  formId: ScopedIdSchema,
  occurredAt: z.string().datetime(),
  pageId: ScopedIdSchema,
  pageRoute: PublicRouteSchema,
  releaseId: ScopedIdSchema,
  scope: ScopeSchema,
  versionDigest: DigestSchema
}).strict()

export const PageStudioPublicAnalyticsEventSchema = z.object({
  eventId: ScopedIdSchema,
  kind: z.enum(['conversion', 'page_view']),
  occurredAt: z.string().datetime(),
  pageId: ScopedIdSchema,
  pageRoute: PublicRouteSchema,
  releaseId: ScopedIdSchema,
  scope: ScopeSchema,
  versionDigest: DigestSchema
}).strict()

type LeadSubmission = z.infer<typeof PageStudioPublicLeadSubmissionSchema> & { idempotencyKey: string }
type AnalyticsSubmission = z.infer<typeof PageStudioPublicAnalyticsEventSchema> & { idempotencyKey: string }

interface ReleaseAuthority {
  client_id: string
  is_synthetic: boolean
  release_id: string
  site_id: string
  tenant_id: string
}

const RELEASE_AUTHORITY_SQL = `
  SELECT site.tenant_id,
         site.client_id::text AS client_id,
         site.id::text AS site_id,
         release.id::text AS release_id,
         COALESCE(site.integrations->>'synthetic', 'false') = 'true' AS is_synthetic
    FROM page_studio_sites site
    JOIN page_studio_entitlements entitlement
      ON entitlement.tenant_id = site.tenant_id
     AND entitlement.client_id = site.client_id
     AND entitlement.id = site.entitlement_id
    JOIN page_studio_releases release
      ON release.tenant_id = site.tenant_id
     AND release.client_id = site.client_id
     AND release.site_id = site.id
    JOIN page_studio_builds build
      ON build.tenant_id = release.tenant_id
     AND build.client_id = release.client_id
     AND build.site_id = release.site_id
     AND build.id = release.build_id
    JOIN page_studio_release_pointers pointer
      ON pointer.tenant_id = release.tenant_id
     AND pointer.client_id = release.client_id
     AND pointer.site_id = release.site_id
     AND pointer.environment = 'production'
     AND pointer.active_release_id = release.id
   WHERE site.tenant_id = $1
     AND site.client_id::text = $2
     AND site.id::text = $3
     AND release.id::text = $4
     AND build.version_digest = $5
     AND build.state = 'succeeded'
     AND release.environment = 'production'
     AND site.current_release_id = release.id
     AND site.status = 'active'
     AND entitlement.status IN ('trial', 'active', 'past_due')
   LIMIT 1`

async function requireReleaseAuthority(
  input: LeadSubmission | AnalyticsSubmission,
  query: typeof queryOne = queryOne
): Promise<ReleaseAuthority> {
  const authority = await query<ReleaseAuthority>(RELEASE_AUTHORITY_SQL, [
    input.scope.tenantId,
    input.scope.clientId,
    input.scope.siteId,
    input.releaseId,
    input.versionDigest
  ])
  if (!authority) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Page Studio release scope is not active',
      data: { error: { code: 'SCOPE_MISMATCH', message: 'Page Studio release scope is not active' } }
    })
  }
  return authority
}

function pageStudioSourceLeadId(input: LeadSubmission): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([
      input.scope.tenantId,
      input.scope.clientId,
      input.scope.siteId,
      input.formId,
      input.idempotencyKey
    ]))
    .digest('hex')
  return `page_studio_${digest}`
}

function canonicalFields(fields: Record<string, string>): Record<string, string> {
  const result = { ...fields }
  const aliases: Array<[string, string[]]> = [
    ['full_name', ['field_name', 'name']],
    ['email', ['field_email']],
    ['phone', ['field_phone']],
    ['message', ['field_goal', 'comments', 'enquiry']]
  ]
  for (const [target, candidates] of aliases) {
    if (result[target]) continue
    const source = candidates.find(candidate => result[candidate])
    if (source) result[target] = result[source]
  }
  return result
}

async function findStoredLeadId(clientId: string, sourceLeadId: string): Promise<string> {
  const lead = await queryOne<{ id: string }>(
    `SELECT id
       FROM leads
      WHERE client_id = $1
        AND source = 'page_studio'
        AND source_lead_id = $2
      LIMIT 1`,
    [clientId, sourceLeadId]
  )
  if (!lead) throw new Error('Page Studio lead idempotency conflict could not be resolved')
  return lead.id
}

export async function acceptPageStudioPublicLead(
  event: H3Event,
  input: LeadSubmission
): Promise<{ duplicate: boolean, leadId: string }> {
  const authority = await requireReleaseAuthority(input)
  const sourceLeadId = pageStudioSourceLeadId(input)
  const fieldData = canonicalFields(input.fields)
  const accepted = await acceptLead(event, {
    lead: {
      client_id: authority.client_id,
      source: 'page_studio',
      source_lead_id: sourceLeadId,
      form_id: input.formId,
      form_name: input.formId,
      ad_id: null,
      ad_name: null,
      campaign_id: null,
      campaign_name: input.attribution.utm_campaign ?? null,
      page_id: input.pageId,
      page_name: input.pageRoute,
      submitted_at: input.occurredAt,
      field_data: fieldData,
      attribution: input.attribution,
      assigned_to: authority.is_synthetic ? null : await resolveAssignedAm(authority.client_id),
      created_by: null,
      is_test: authority.is_synthetic,
      test_run_id: null
    },
    leadCaptureMode: authority.is_synthetic
      ? 'capture_only'
      : await resolveLeadCaptureMode(authority.client_id),
    consentDecision: input.consent ? 'granted' : 'unknown',
    runRules: !authority.is_synthetic,
    conversionEventName: 'lead_created'
  })

  if (accepted.status === 'mode_skipped') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Lead capture is disabled for this client',
      data: { error: { code: 'LEAD_CAPTURE_DISABLED', message: 'Lead capture is disabled for this client' } }
    })
  }

  const duplicate = accepted.status !== 'created'
  const leadId = accepted.status === 'created'
    ? accepted.leadId
    : await findStoredLeadId(authority.client_id, sourceLeadId)

  await upsertFormMetadata('page_studio', input.formId, input.formId, fieldData)
  await execute(
    `INSERT INTO page_studio_audit_events (
       tenant_id, client_id, site_id, actor_id, actor_role, action,
       resource_type, resource_id, idempotency_key, metadata, occurred_at
     ) VALUES ($1, $2, $3, 'page-studio-delivery', 'service', $4,
       'lead', $5, $6, $7::jsonb, $8)
     ON CONFLICT DO NOTHING`,
    [
      authority.tenant_id,
      authority.client_id,
      authority.site_id,
      duplicate ? 'lead.duplicate' : 'lead.created',
      leadId,
      `public-lead:${input.idempotencyKey}`,
      JSON.stringify({
        duplicate,
        formId: input.formId,
        pageId: input.pageId,
        pageRoute: input.pageRoute,
        releaseId: authority.release_id,
        synthetic: authority.is_synthetic,
        versionDigest: input.versionDigest
      }),
      input.occurredAt
    ]
  )

  return { duplicate, leadId }
}

interface AnalyticsLedgerRow {
  id: string
}

export async function acceptPageStudioPublicAnalyticsEvent(
  event: H3Event,
  input: AnalyticsSubmission
): Promise<{ accepted: true }> {
  const authority = await requireReleaseAuthority(input)
  const result = await transaction(async (db) => {
    const inserted = await db.query<AnalyticsLedgerRow>(
      `INSERT INTO page_studio_analytics_events (
         tenant_id, client_id, site_id, release_id, version_digest,
         event_id, kind, page_id, page_route, occurred_at, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        authority.tenant_id,
        authority.client_id,
        authority.site_id,
        authority.release_id,
        input.versionDigest,
        input.eventId,
        input.kind,
        input.pageId,
        input.pageRoute,
        input.occurredAt,
        input.idempotencyKey
      ]
    )
    const ledger = inserted.rows[0]
    if (!ledger) return { publishEventId: null as string | null }

    let canonicalEventId: string | null = null
    let deliveryStatus = input.kind === 'page_view' ? 'not_applicable' : 'unmapped'
    let publishEventId: string | null = null
    const canonicalName = input.kind === 'conversion'
      ? CanonicalEventNameSchema.safeParse(input.eventId)
      : null

    if (canonicalName?.success) {
      const appended = await appendCanonicalConversionEvent(db, {
        clientId: authority.client_id,
        eventName: canonicalName.data as CanonicalEventName,
        enquiryType: null,
        sourceSystem: 'client_webhook',
        sourceEntityType: 'tracking_event',
        sourceEntityId: input.pageId,
        sourceEventId: input.idempotencyKey,
        occurredAt: input.occurredAt,
        consentDecision: 'unknown',
        attribution: {
          browserEventId: null,
          metaLeadId: null,
          gclid: null,
          gbraid: null,
          wbraid: null,
          gaClientId: null
        },
        value: null
      })
      if (appended.status === 'profile_not_found') {
        deliveryStatus = 'profile_not_found'
      } else {
        canonicalEventId = appended.event.eventId
        deliveryStatus = appended.status === 'created' ? 'canonical_created' : 'canonical_duplicate'
        if (appended.event.outboxStatus === 'pending') publishEventId = appended.event.eventId
      }
    }

    await db.query(
      `UPDATE page_studio_analytics_events
          SET delivery_status = $5,
              canonical_event_id = $6,
              updated_at = NOW()
        WHERE tenant_id = $1 AND client_id = $2 AND site_id = $3 AND id = $4`,
      [
        authority.tenant_id,
        authority.client_id,
        authority.site_id,
        ledger.id,
        deliveryStatus,
        canonicalEventId
      ]
    )
    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, idempotency_key, metadata, occurred_at
       ) VALUES ($1, $2, $3, 'page-studio-delivery', 'service',
         'analytics.event_received', 'analytics_event', $4, $5, $6::jsonb, $7)
       ON CONFLICT DO NOTHING`,
      [
        authority.tenant_id,
        authority.client_id,
        authority.site_id,
        ledger.id,
        `public-analytics:${input.idempotencyKey}`,
        JSON.stringify({
          deliveryStatus,
          eventId: input.eventId,
          kind: input.kind,
          pageId: input.pageId,
          pageRoute: input.pageRoute,
          releaseId: authority.release_id,
          versionDigest: input.versionDigest
        }),
        input.occurredAt
      ]
    )
    return { publishEventId }
  })

  if (result.publishEventId) {
    try {
      await conversionOutboxPublisher.publishEvent(event, result.publishEventId)
    } catch (error) {
      console.warn({
        event: 'page_studio_analytics_post_commit_publish_failed',
        clientId: authority.client_id,
        eventId: result.publishEventId,
        errorClass: error instanceof Error ? error.name : 'unknown'
      })
    }
  }
  return { accepted: true }
}
