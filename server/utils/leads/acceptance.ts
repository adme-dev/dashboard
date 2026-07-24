import type { H3Event } from 'h3'
import { queryOne } from '~~/server/utils/db'
import type { InsertLeadInput } from '~~/server/utils/leads/db'
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
import { resolveCrmAccessPolicy } from '~~/server/utils/leads/crmAccessPolicy'
import {
  releaseSubmissionIntentReservation,
  reserveSubmissionIntentForLead
} from '~~/server/utils/leads/submissionIntent'

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
    | { status: 'duplicate' }
    | { status: 'created', leadId: string }

export async function acceptLead(event: H3Event, input: {
  lead: InsertLeadInput & { client_id: string }
  leadCaptureMode: LeadCaptureMode
  consentDecision?: CanonicalConsentDecision
  runRules?: boolean
}): Promise<AcceptLeadResult> {
  if (input.leadCaptureMode === 'analytics_only') {
    return { status: 'mode_skipped' }
  }

  const shouldReconcile = input.lead.source !== 'meta'
    && input.lead.source !== 'google'
    && !input.lead.attribution?.browserEventId
  const reservation = shouldReconcile
    ? await reserveSubmissionIntentForLead({
        clientId: input.lead.client_id,
        fieldData: input.lead.field_data,
        submittedAt: input.lead.submitted_at,
        formId: input.lead.form_id
      })
    : null
  const lead = reservation
    ? {
        ...input.lead,
        attribution: {
          ...reservation.attribution,
          ...(input.lead.attribution ?? {}),
          browserEventId: reservation.browserEventId,
          reconciliation_method: 'identity_hmac_unique',
          reconciliation_confidence: String(reservation.confidence)
        }
      }
    : input.lead

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
        : undefined
    })
  } catch (error) {
    if (reservation) await releaseSubmissionIntentReservation(reservation)
    throw error
  }
  if (intake.status === 'duplicate') {
    if (reservation) await releaseSubmissionIntentReservation(reservation)
    return intake
  }

  if (
    intake.outbox.status !== 'profile_not_found'
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
