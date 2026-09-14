import { z } from 'zod'

export const DomainHostnameSchema = z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
export const DomainManagementActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('agency'), actorId: z.string().uuid(), tenantId: z.string().min(1).max(200) }).strict(),
  z.object({ kind: z.literal('portal'), actorId: z.string().uuid(), clientId: z.string().uuid() }).strict()
])
export type DomainManagementActor = z.infer<typeof DomainManagementActorSchema>
const base = { actor: DomainManagementActorSchema, expectedEnvironment: z.enum(['staging', 'production']) }
export const DomainManagementRequestSchema = z.discriminatedUnion('operation', [
  z.object({ ...base, operation: z.literal('aggregate') }).strict(),
  z.object({ ...base, operation: z.literal('list'), siteId: z.string().uuid() }).strict(),
  z.object({ ...base, operation: z.literal('attach'), siteId: z.string().uuid(), hostname: DomainHostnameSchema }).strict(),
  z.object({ ...base, operation: z.literal('verify'), siteId: z.string().uuid(), domainId: z.string().uuid() }).strict()
])
export type DomainManagementRequest = z.infer<typeof DomainManagementRequestSchema>
const text = z.string().max(4096)
const status = z.string().min(1).max(80)
export const DomainInstructionsSchema = z.object({ type: z.literal('txt').optional(), name: z.string().max(253).optional(), value: text.optional(), cnameTarget: DomainHostnameSchema.nullable().optional(), providerConfigured: z.boolean().optional(), dnsVerified: z.boolean().optional() }).strict()
export const DomainCertificateSchema = z.array(z.object({ txt_name: z.string().max(253).optional(), txt_value: text.optional() }).strict()).max(20)
export const DomainRecordSchema = z.object({
  id: z.string().uuid(), hostname: DomainHostnameSchema, status, hostnameStatus: status, dnsStatus: status, tlsStatus: status,
  ownershipValidation: DomainInstructionsSchema, certificateValidation: DomainCertificateSchema
}).strict()
export const DomainAggregateRecordSchema = z.object({
  id: z.string().uuid(), siteId: z.string().uuid(), siteName: z.string().max(500), clientName: z.string().max(500).optional(),
  hostname: DomainHostnameSchema, hostnameStatus: status, dnsStatus: status, tlsStatus: status, lifecycleState: status,
  status: status.optional(), environment: z.literal('production').optional(), failureSummary: text.nullable(),
  verifiedAt: z.string().datetime().nullable(), activatedAt: z.string().datetime().nullable(), updatedAt: z.string().datetime()
}).strict()
export const DomainVerificationSchema = z.object({ id: z.string().uuid(), certificateValidation: DomainCertificateSchema, cloudflareHostnameId: z.string().regex(/^[a-f0-9]{32}$/i).nullable(), dnsStatus: status, hostnameStatus: status, lifecycleState: status, ownershipValidation: DomainInstructionsSchema, tlsStatus: status }).strict()
export const DomainListSchema = z.object({ siteId: z.string().uuid(), canManage: z.boolean(), domains: z.array(DomainRecordSchema).max(200) }).strict()
export const DomainIdentitySchema = z.object({ id: z.string().uuid() }).strict()
export const DomainErrorStatuses: Record<string, number> = {
  DOMAIN_INVALID: 400, DOMAIN_ACCESS_DENIED: 403, DOMAIN_NOT_FOUND: 404,
  DOMAIN_CHANGED: 409, DOMAIN_ALREADY_ATTACHED: 409, DOMAIN_LIMIT_REACHED: 409, DOMAIN_RECONCILIATION_REQUIRED: 409,
  DOMAIN_PROVIDER_MISMATCH: 502, DOMAIN_PROVIDER_FAILED: 502,
  DOMAIN_PROVIDER_UNAVAILABLE: 503, DOMAIN_SCHEMA_PENDING: 503, DOMAIN_SERVICE_UNAVAILABLE: 503
}
export const domainPublicMessage = (code: string) => code === 'DOMAIN_ACCESS_DENIED' ? 'Website domain access is not active' : code === 'DOMAIN_INVALID' ? 'Invalid website domain request' : 'Domain attachment could not be verified. Retry to check its retained status.'
