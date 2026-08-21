import { LeadSubmittedV1Schema, normalizeLeadSubmittedV1 } from '~~/server/utils/leads/dealerLeadAdapter'
import { leadConnectorRepository } from '~~/server/utils/leads/connectorRepository'
import { resolveLeadCaptureMode, acceptLead } from '~~/server/utils/leads/acceptance'
import { verifyStandardWebhook } from '~~/server/utils/leads/standardWebhook'

const MAX_BODY_BYTES = 64 * 1024

function reject(statusCode: number, statusMessage: string): never {
  throw createError({ statusCode, statusMessage })
}

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token') || ''
  const connector = await leadConnectorRepository.resolveByPublicToken(token)
  if (!connector) reject(404, 'Lead connector not found')
  if (
    connector.status === 'disabled'
    || connector.authority !== 'canonical'
    || !connector.capabilities.includes('push')
  ) reject(409, 'Lead connector is not available for canonical push ingestion')

  const declaredLength = Number(getHeader(event, 'content-length') || 0)
  if (declaredLength > MAX_BODY_BYTES) reject(413, 'Webhook payload is too large')
  const rawBody = await readRawBody(event, 'utf8')
  if (rawBody === undefined || Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    reject(413, 'Webhook payload is too large')
  }

  const verified = verifyStandardWebhook({
    rawBody,
    webhookId: getHeader(event, 'webhook-id'),
    webhookTimestamp: getHeader(event, 'webhook-timestamp'),
    webhookSignature: getHeader(event, 'webhook-signature'),
    secrets: connector.secrets
  })
  if (verified.ok === false) {
    const reason = verified.reason
    // Authentication failures must not disable a public connector. Otherwise
    // anyone who knows its URL could block the next legitimate receipt.
    await leadConnectorRepository.markRejection(
      connector.id,
      `standard_webhook_${reason}`,
      reason === 'expired'
    )
    reject(401, 'Webhook signature is invalid or expired')
  }

  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(rawBody)
  } catch {
    await leadConnectorRepository.markFailure(connector.id, 'invalid_json')
    reject(400, 'Webhook payload is not valid JSON')
  }
  const parsed = LeadSubmittedV1Schema.safeParse(rawPayload)
  if (!parsed.success) {
    await leadConnectorRepository.markFailure(connector.id, 'invalid_schema')
    reject(422, 'Webhook payload does not match lead.submitted.v1')
  }
  const normalised = normalizeLeadSubmittedV1(parsed.data)
  const mode = await resolveLeadCaptureMode(connector.clientId)

  try {
    const accepted = await acceptLead(event, {
      leadCaptureMode: mode,
      consentDecision: normalised.consentDecision,
      trustedConnectorId: connector.id,
      testRunId: normalised.testRunId,
      lead: {
        client_id: connector.clientId,
        // The connector, not the caller-controlled envelope, owns ingress
        // authority. Standard Webhooks is the canonical website/provider path.
        source: 'webhook',
        // Existing lead idempotency is source-wide, so namespace delivery IDs
        // by connector to prevent cross-tenant collisions.
        source_lead_id: `${connector.id}:${verified.webhookId}`,
        form_id: normalised.formId,
        form_name: normalised.formName,
        ad_id: null,
        ad_name: null,
        campaign_id: null,
        campaign_name: null,
        page_id: null,
        submitted_at: normalised.submittedAt ?? parsed.data.occurredAt,
        field_data: normalised.fieldData,
        attribution: normalised.attribution,
        assigned_to: null,
        created_by: null,
        is_test: normalised.isTest,
        test_run_id: normalised.testRunId
      }
    })
    await leadConnectorRepository.markReceipt(connector.id, accepted.status === 'duplicate')
    setResponseStatus(event, accepted.status === 'created' ? 201 : 200)
    return { ok: true, status: accepted.status, leadId: accepted.status === 'created' ? accepted.leadId : null }
  } catch (error) {
    if ((error as any)?.statusCode && Number((error as any).statusCode) < 500) throw error
    await leadConnectorRepository.markFailure(
      connector.id,
      error instanceof Error ? error.name : 'ingestion_failed'
    )
    throw error
  }
})
