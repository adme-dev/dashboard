import { z } from 'zod'
import { PageStudioTemplateUseRequest } from './templateCatalogue'
export const TemplateCopyAttemptSchema = PageStudioTemplateUseRequest.extend({ versionId: z.string().uuid() }).strict()
export type TemplateCopyAttempt = z.infer<typeof TemplateCopyAttemptSchema>
export const TemplateCopyRecoveryItemSchema = z.object({
  attempt: TemplateCopyAttemptSchema, siteId: z.string().uuid(), status: z.enum(['preparing', 'ready'])
}).strict()
export const TemplateCopyRecoverySchema = z.object({
  recoveryScope: z.string().regex(/^[a-f0-9]{64}$/), items: z.array(TemplateCopyRecoveryItemSchema).max(50)
}).strict()
export type TemplateCopyRecovery = z.infer<typeof TemplateCopyRecoverySchema>
export const StoredTemplateCopyAttemptSchema = z.object({
  recoveryScope: z.string().regex(/^[a-f0-9]{64}$/), attempt: TemplateCopyAttemptSchema
}).strict()
