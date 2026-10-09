import { z } from 'zod'
import { PageStudioContentScopeSchema } from './businessContent'
import { EmailTemplateReadSchema } from './emailTemplates'
import { EmailFieldBindingSchema, EmailFormKeySchema } from './emailTemplateFields'

export const EmailTemplateContractProbeSchema = EmailTemplateReadSchema.omit({ revision: true }).extend({ contractVersion: z.literal(2) }).strict()
export const EmailTemplateContractSupportSchema = z.object({ scope: PageStudioContentScopeSchema, contractVersion: z.literal(2) }).strict()
export const EmailFieldOptionsRequestSchema = z.object({ pageId: z.string().min(1).max(128), formId: z.string().min(1).max(128) }).strict()
export const EmailFieldOptionsSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(false), reason: z.string().min(1).max(300) }).strict(),
  z.object({ available: z.literal(true), siteId: z.string().min(1).max(128), apiAudience: z.enum(['portal', 'customer']), checkpointId: z.string().min(1).max(128), formKey: EmailFormKeySchema,
    fields: z.array(EmailFieldBindingSchema.pick({ fieldId: true, type: true }).extend({ label: z.string().min(1).max(80) }).strict()).max(100)
  }).strict()
])
export type EmailFieldOptions = z.infer<typeof EmailFieldOptionsSchema>
