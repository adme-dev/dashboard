import { z } from 'zod'
import { PageStudioContentScopeSchema } from './businessContent'
import { FormOutcomeSettingsSchema } from './formOutcomes'

const Identity = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
export const FormSettingsReadSchema = z.object({ scope: PageStudioContentScopeSchema, formId: Identity, pageId: Identity }).strict()
export const FormSettingsWriteSchema = FormSettingsReadSchema.extend({
  actorId: Identity,
  checkpointId: Identity,
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  settings: FormOutcomeSettingsSchema
}).strict()
export const FormSettingsRecordSchema = FormSettingsReadSchema.extend({
  actorId: Identity,
  checkpointId: Identity,
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  settings: FormOutcomeSettingsSchema,
  updatedAt: z.string().datetime()
}).strict()
export const FormSettingsEditSchema = FormSettingsWriteSchema.omit({ scope: true, formId: true, pageId: true, actorId: true })
export type FormSettingsRecord = z.infer<typeof FormSettingsRecordSchema>
export interface FormSettingsState {
  record: FormSettingsRecord | null
  canEdit: boolean
  activation: 'draft_only'
}
