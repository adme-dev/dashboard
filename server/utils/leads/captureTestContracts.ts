import { z } from 'zod'

export const LeadCaptureTestStageSchema = z.enum([
  'tracker_loaded',
  'candidate_created',
  'provider_success_observed',
  'trusted_receipt_accepted',
  'candidate_reconciled',
  'canonical_test_lead_stored',
  'destinations_validated'
])

export const LeadCaptureTestOutcomeSchema = z.enum(['passed', 'failed', 'skipped'])

export const CreateLeadCaptureTestSchema = z.strictObject({
  clientId: z.string().uuid(),
  siteId: z.string().uuid().nullable().optional(),
  connectorId: z.string().uuid(),
  expectedOrigin: z.string().url().max(2048).transform(value => new URL(value).origin),
  reason: z.string().trim().min(1).max(1000),
  expectedStages: z.array(LeadCaptureTestStageSchema)
    .length(LeadCaptureTestStageSchema.options.length)
    .superRefine((stages, context) => {
      if (new Set(stages).size !== LeadCaptureTestStageSchema.options.length) {
        context.addIssue({
          code: 'custom',
          message: 'A contained capture test must require every evidence stage'
        })
      }
    })
})

export const ExchangeLeadCaptureTestTokenSchema = z.strictObject({
  token: z.string().min(32).max(512)
})

export const AppendLeadCaptureTestEvidenceSchema = z.strictObject({
  token: z.string().min(32).max(512),
  // Browser-held evidence tokens can attest only to browser-observable stages.
  // Canonical receipt and storage evidence is appended by trusted server code.
  stage: z.enum(['tracker_loaded', 'provider_success_observed']),
  outcome: LeadCaptureTestOutcomeSchema,
  evidenceKey: z.string().trim().min(1).max(255),
  diagnostic: z.string().trim().max(1000).nullable().optional()
})

export type LeadCaptureTestStage = z.infer<typeof LeadCaptureTestStageSchema>
export type LeadCaptureTestOutcome = z.infer<typeof LeadCaptureTestOutcomeSchema>
export type CreateLeadCaptureTest = z.infer<typeof CreateLeadCaptureTestSchema>

export interface LeadCaptureTestEventReadModel {
  id: string
  stage: LeadCaptureTestStage
  outcome: LeadCaptureTestOutcome
  evidenceKey: string
  diagnostic: string | null
  occurredAt: string
}

export interface LeadCaptureTestRunReadModel {
  id: string
  clientId: string
  siteId: string | null
  connectorId: string
  expectedOrigin: string
  expectedStages: LeadCaptureTestStage[]
  status: 'created' | 'running' | 'passed' | 'failed' | 'timed_out' | 'cancelled'
  expiresAt: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  events: LeadCaptureTestEventReadModel[]
}
