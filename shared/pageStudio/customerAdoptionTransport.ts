import { z } from 'zod'
import { CustomerAdoptionGrantReferenceSchema, CustomerAdoptionGrantRequestSchema, CustomerAdoptionOperatorSchema } from './customerAdoptionGrant'
import { managementResultSchema } from './managementResult'

const Id = z.string().uuid(), Digest = z.string().regex(/^[a-f0-9]{64}$/)
export const CUSTOMER_ADOPTION_URL = 'https://page-studio-management.internal/customer-adoption-grant'
export const CUSTOMER_ADOPTION_UNAVAILABLE = 'Adoption status could not be confirmed. Refresh before continuing.'
export const CustomerAdoptionOperatorActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inspect') }).strict(),
  z.object({ action: z.literal('grant'), body: CustomerAdoptionGrantRequestSchema }).strict(),
  z.object({ action: z.literal('withdraw'), grantId: Id, expectedRevision: z.number().int().positive().max(2147483646) }).strict()
])
export const CustomerAdoptionTransportSchema = z.object({
  siteId: Id, operator: CustomerAdoptionOperatorSchema, expectedEnvironment: z.literal('production'),
  request: CustomerAdoptionOperatorActionSchema
}).strict()
const Receipt = z.object({
  grantId: Id, revision: z.number().int().positive().max(2147483646), siteId: Id,
  issuedAt: z.string().datetime(), expiresAt: z.string().datetime(), sourceDigest: Digest
}).strict()
export const CustomerAdoptionOperatorViewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('inspect'), siteId: Id, sourceDigest: Digest, selection: CustomerAdoptionGrantReferenceSchema.nullable() }).strict(),
  z.object({ action: z.literal('grant'), siteId: Id, historical: z.boolean(), grant: Receipt }).strict(),
  z.object({ action: z.literal('withdraw'), siteId: Id, withdrawn: z.literal(true), grant: Receipt }).strict()
])
export const CustomerAdoptionTransportResponseSchema = managementResultSchema(CustomerAdoptionOperatorViewSchema,
  z.object({ statusCode: z.number().int().min(400).max(599), message: z.literal(CUSTOMER_ADOPTION_UNAVAILABLE) }).strict())
export function matchesCustomerAdoptionResponse(view: z.infer<typeof CustomerAdoptionOperatorViewSchema>, input: z.infer<typeof CustomerAdoptionTransportSchema>) {
  if (view.siteId !== input.siteId || view.action !== input.request.action) return false
  if (view.action === 'inspect') return true
  if (view.grant.siteId !== input.siteId) return false
  if (view.action === 'grant' && input.request.action === 'grant') {
    const body = input.request.body
    return view.grant.grantId === body.grantId && view.grant.revision === body.expectedRevision + 1
      && view.grant.sourceDigest === body.sourceDigest && view.grant.expiresAt === body.expiresAt
  }
  return input.request.action === 'withdraw' && view.grant.grantId === input.request.grantId
    && view.grant.revision === input.request.expectedRevision
}
