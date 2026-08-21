import { z } from 'zod'

export const LeadConnectorTypeSchema = z.enum([
  'first_party_gateway',
  'provider_webhook',
  'provider_poll',
  'meta_lead_ads',
  'google_lead_form',
  'controlled_import',
  'browser_candidate'
])

export const LeadConnectorStatusSchema = z.enum([
  'active', 'test', 'stale', 'error', 'disabled'
])

export const LeadConnectorCapabilitySchema = z.enum([
  'push', 'poll', 'browser_correlation', 'backfill'
])

export const LeadConnectorAuthoritySchema = z.enum(['canonical', 'candidate_only'])

const OriginSchema = z.string().url().max(2048).transform((value) => new URL(value).origin)

export const CreateLeadConnectorSchema = z.strictObject({
  clientId: z.string().uuid(),
  siteId: z.string().uuid().nullable().optional(),
  type: LeadConnectorTypeSchema,
  provider: z.string().trim().min(1).max(100)
    .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/),
  authority: LeadConnectorAuthoritySchema,
  capabilities: z.array(LeadConnectorCapabilitySchema).max(4),
  approvedOrigins: z.array(OriginSchema).max(50).default([]),
  formReferences: z.array(z.string().trim().min(1).max(255)).max(500).default([]),
  reason: z.string().trim().min(1).max(1000)
}).superRefine((value, context) => {
  if (value.type === 'browser_candidate' && value.authority !== 'candidate_only') {
    context.addIssue({
      code: 'custom',
      path: ['authority'],
      message: 'Browser candidate connectors cannot create canonical leads'
    })
  }
  if (value.capabilities.includes('push') && !value.approvedOrigins.length && value.type === 'browser_candidate') {
    context.addIssue({
      code: 'custom',
      path: ['approvedOrigins'],
      message: 'Browser candidate connectors require an approved origin'
    })
  }
})

export const UpdateLeadConnectorSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  status: LeadConnectorStatusSchema.optional(),
  authority: LeadConnectorAuthoritySchema.optional(),
  capabilities: z.array(LeadConnectorCapabilitySchema).max(4).optional(),
  approvedOrigins: z.array(OriginSchema).max(50).optional(),
  formReferences: z.array(z.string().trim().min(1).max(255)).max(500).optional(),
  reason: z.string().trim().min(1).max(1000)
})

export const RotateLeadConnectorSecretSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000)
})

export type LeadConnectorType = z.infer<typeof LeadConnectorTypeSchema>
export type LeadConnectorStatus = z.infer<typeof LeadConnectorStatusSchema>
export type LeadConnectorCapability = z.infer<typeof LeadConnectorCapabilitySchema>
export type LeadConnectorAuthority = z.infer<typeof LeadConnectorAuthoritySchema>
export type CreateLeadConnector = z.infer<typeof CreateLeadConnectorSchema>
export type UpdateLeadConnector = z.infer<typeof UpdateLeadConnectorSchema>

export interface LeadConnectorReadModel {
  id: string
  clientId: string
  siteId: string | null
  type: LeadConnectorType
  provider: string
  status: LeadConnectorStatus
  authority: LeadConnectorAuthority
  capabilities: LeadConnectorCapability[]
  approvedOrigins: string[]
  formReferences: string[]
  path: string | null
  credentialConfigured: boolean
  lastReceiptAt: string | null
  lastAttemptAt: string | null
  lastPollAt: string | null
  lastErrorClass: string | null
  duplicateReceipts: number
  replayRejections: number
  version: number
  createdAt: string
  updatedAt: string
}
