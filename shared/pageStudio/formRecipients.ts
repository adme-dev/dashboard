import { z } from 'zod'
import { PageStudioContentScopeSchema } from './businessContent'

const Identity = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
const recipients = z.array(z.string().trim().max(254).email().refine(value => Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127), 'Enter a single email address')).max(20).refine(values => new Set(values.map(value => value.toLowerCase())).size === values.length, 'Remove duplicate email addresses')
export const FormRecipientSettingsSchema = z.object({
  recipients,
  overrides: z.array(z.object({ definitionId: Identity, recipients }).strict()).max(500).refine(values => new Set(values.map(value => value.definitionId)).size === values.length, 'Each form can have only one override')
}).strict()
export const FormRecipientsReadSchema = z.object({ scope: PageStudioContentScopeSchema }).strict()
export const FormRecipientsEditSchema = z.object({ checkpointId: Identity, expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1), settings: FormRecipientSettingsSchema }).strict()
export const FormRecipientsWriteSchema = FormRecipientsEditSchema.extend({ scope: PageStudioContentScopeSchema, actorId: Identity }).strict()
export const FormRecipientsRecordSchema = z.object({ scope: PageStudioContentScopeSchema, actorId: Identity, checkpointId: Identity, revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER), settings: FormRecipientSettingsSchema, updatedAt: z.string().datetime() }).strict()
export type FormRecipientSettings = z.infer<typeof FormRecipientSettingsSchema>
export type FormRecipientsRecord = z.infer<typeof FormRecipientsRecordSchema>
export interface FormRecipientsState { activation: 'draft_only', canEdit: boolean, record: FormRecipientsRecord | null }
export const defaultFormRecipients = (): FormRecipientSettings => ({ recipients: [], overrides: [] })
export function effectiveFormRecipients(settings: FormRecipientSettings, definitionId?: string): string[] {
  return settings.overrides.find(item => item.definitionId === definitionId)?.recipients ?? settings.recipients
}
