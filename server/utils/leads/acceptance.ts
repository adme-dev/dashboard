import type { H3Event } from 'h3'
import { queryOne } from '~~/server/utils/db'
import type { EmailEvidenceGuard, InsertLeadInput } from '~~/server/utils/leads/db'
import { loadLead } from '~~/server/utils/leads/db'
import { leadIntakeService } from '~~/server/utils/leads/intake'
import { enqueueLeadJob } from '~~/server/utils/leads/queue'
import { notifyOnNewLead } from '~~/server/utils/leads/notifyOnNew'
import { conversionOutboxPublisher } from '~~/server/utils/measurement/publisher'
import {
  markCrmPromotionFailure,
  markCrmPromotionQueued,
  markCrmPromotionSkipped
} from '~~/server/utils/leads/crmPromotionState'
import type { CanonicalConsentDecision } from '~~/server/utils/measurement/contracts'
import type { CanonicalEnquiryType } from '~~/server/utils/leads/dealerLeadAdapter'
import { resolveCrmAccessPolicy } from '~~/server/utils/leads/crmAccessPolicy'
import {
  releaseSubmissionIntentReservation,
  reserveSubmissionIntentForLead
} from '~~/server/utils/leads/submissionIntent'
import { leadCaptureTestRepository } from '~~/server/utils/leads/captureTestRepository'

export type LeadCaptureMode = 'analytics_only' | 'capture_only' | 'lightweight_crm' | 'full_crm' | 'external_crm'

export async function resolveLeadCaptureMode(clientId: string): Promise<LeadCaptureMode> {
  const row = await queryOne<{ lead_capture_mode: LeadCaptureMode | null }>(
    `SELECT lead_capture_mode FROM agency_clients WHERE id = $1`,
    [clientId]
  )
  return row?.lead_capture_mode ?? 'capture_only'
}

export type AcceptLeadResult
  = { status: 'mode_skipped' }
    | { status: 'duplicate' | 'evidence_expired' }
    | { status: 'created', leadId: string }

export async function acceptLead(event: H3Event, input: {
  lead: InsertLeadInput & { client_id: string }
  leadCaptureMode: LeadCaptureMode
  consentDecision?: CanonicalConsentDecision
  runRules?: boolean
  emailEvidenceGuard?: EmailEvidenceGuard
  identityFingerprintSecret?: string
  trustedConnectorId?: string
  testRunId?: string | null
  conversionEventName?: 'lead_created' | 'web_conversion'
  enquiryType?: CanonicalEnquiryType | null
}): Promise<AcceptLeadResult> {
  if (input.leadCaptureMode === 'analytics_only') {
    return { status: 'mode_skipped' }
  }

  const testRunId = input.testRunId ?? input.lead.test_run_id ?? null
  const isSynthetic = Boolean(input.lead.is_test || testRunId)
  if (testRunId) {
    if (!input.trustedConnectorId || !await leadCaptureTestRepository.authorizeCanonicalTest(
      testRunId,
      input.trustedConnectorId,
      input.lead.client_id
    )) {
      throw createError({ statusCode: 403, statusMessage: 'Lead capture test is invalid or expired' })
    }
    await leadCaptureTestRepository.appendServerEvent({
      runId: testRunId,
      connectorId: input.trustedConnectorId,
      clientId: input.lead.client_id,
      stage: 'trusted_receipt_accepted',
      outcome: 'passed',
      evidenceKey: input.lead.source_lead_id
    })
  }

  const shouldReconcile = input.lead.source !== 'meta'
    && input.lead.source !== 'google'
    && !input.lead.attribution?.browserEventId
  const reservation = shouldReconcile
    ? await reserveSubmissionIntentForLead({
        clientId: input.lead.client_id,
        fieldData: input.lead.field_data,
        submittedAt: input.lead.submitted_at,
        formId: input.lead.form_id,
        identityFingerprintSecret: input.identityFingerprintSecret,
        testRunId
      })
    : null
  const baseLead = {
    ...input.lead,
    is_test: isSynthetic,
    test_run_id: testRunId
  }
  const lead = reservation
    ? {
        ...baseLead,
        attribution: {
          ...reservation.attribution,
          ...(input.lead.attribution ?? {}),
          browserEventId: reservation.browserEventId,
          reconciliation_method: 'identity_hmac_unique',
          reconciliation_confidence: String(reservation.confidence)
        }
      }
    : baseLead

  const conversionEventName = input.conversionEventName
    ?? (input.trustedConnectorId ? 'web_conversion' : 'lead_created')
  const enquiryType = conversionEventName === 'web_conversion'
    ? input.enquiryType ?? canonicalEnquiryType(lead.field_data.enquiry_type)
    : null
  let intake
  try {
    intake = await leadIntakeService.ingest({
      lead,
      consentDecision: input.consentDecision ?? 'unknown',
      reconciliation: reservation
        ? {
            intentId: reservation.intentId,
            reservationToken: reservation.reservationToken
          }
        : undefined,
      emailEvidenceGuard: input.emailEvidenceGuard,
      publishConversion: !isSynthetic,
      publishBrowserConfirmation: !isSynthetic,
      conversionEventName,
      enquiryType
    })
  } catch (error) {
    if (reservation) await releaseSubmissionIntentReservation(reservation)
    throw error
  }
  if (intake.status === 'duplicate' || intake.status === 'evidence_expired') {
    if (reservation) await releaseSubmissionIntentReservation(reservation)
    return intake
  }


  if (testRunId && input.trustedConnectorId) {
    if (reservation) {
      await leadCaptureTestRepository.appendServerEvent({
        runId: testRunId,
        connectorId: input.trustedConnectorId,
        clientId: lead.client_id,
        stage: 'candidate_reconciled',
        outcome: 'passed',
        evidenceKey: reservation.intentId
      })
    }
    await leadCaptureTestRepository.appendServerEvent({
      runId: testRunId,
      connectorId: input.trustedConnectorId,
      clientId: lead.client_id,
      stage: 'canonical_test_lead_stored',
      outcome: 'passed',
      evidenceKey: intake.leadId
    })
    await leadCaptureTestRepository.appendServerEvent({
      runId: testRunId,
      connectorId: input.trustedConnectorId,
      clientId: lead.client_id,
      stage: 'destinations_validated',
      outcome: 'skipped',
      evidenceKey: 'normal-side-effects-contained',
      diagnostic: 'Synthetic lead stored; normal routing, CRM, notification, and conversion delivery skipped.'
    })
  }

  if (isSynthetic) return { status: 'created', leadId: intake.leadId }

  if (
    intake.outbox
    && intake.outbox.status !== 'profile_not_found'
    && intake.outbox.event.outboxStatus === 'pending'
  ) {
    try {
      await conversionOutboxPublisher.publishEvent(event, intake.outbox.event.eventId)
    } catch (error) {
      console.warn({
        event: 'measurement_outbox_post_commit_publish_failed',
        clientId: lead.client_id,
        eventId: intake.outbox.event.eventId,
        errorClass: error instanceof Error ? error.name : 'unknown'
      })
    }
  }

  if (input.runRules !== false) {
    await enqueueLeadJob({ type: 'rules.evaluate', payload: { lead_id: intake.leadId } })
  }

  if (input.leadCaptureMode === 'lightweight_crm' || input.leadCaptureMode === 'full_crm') {
    const policy = await resolveCrmAccessPolicy(lead.client_id, input.leadCaptureMode)
    if (policy.promoteInternally) {
      await markCrmPromotionQueued(lead.client_id, intake.leadId)
      try {
        await enqueueLeadJob({ type: 'crm.promote', payload: { lead_id: intake.leadId } })
      } catch (error) {
        await markCrmPromotionFailure(intake.leadId, error)
        throw error
      }
    } else {
      await markCrmPromotionSkipped(lead.client_id, intake.leadId, policy.reason ?? 'crm_not_available')
    }
  }

  const fresh = await loadLead(intake.leadId)
  if (fresh) await notifyOnNewLead(fresh)

  return { status: 'created', leadId: intake.leadId }
}

function canonicalEnquiryType(value: string | undefined) {
  return ['stock', 'finance', 'test_drive', 'contact', 'model_variant'].includes(value ?? '')
    ? value as 'stock' | 'finance' | 'test_drive' | 'contact' | 'model_variant'
    : null
}
