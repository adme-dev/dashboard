import { PageStudioContentScopeSchema } from './businessContent'
import { z } from 'zod'
import { FormOutcomeSettingsSchema } from './formOutcomes'

const Identity = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/)
const legacyIdentity = z.object({ scope: PageStudioContentScopeSchema, pageId: Identity, formId: Identity }).strict()
const sharedIdentity = z.object({ scope: PageStudioContentScopeSchema, definitionId: Identity }).strict()
export const FormSettingsReadSchema = z.union([legacyIdentity, sharedIdentity])
const edit = {
  checkpointId: Identity,
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  settings: FormOutcomeSettingsSchema
}
const record = {
  actorId: Identity,
  checkpointId: Identity,
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  settings: FormOutcomeSettingsSchema,
  updatedAt: z.string().datetime()
}
export const FormSettingsWriteSchema = z.union([
  legacyIdentity.extend({ ...edit, actorId: Identity }).strict(),
  sharedIdentity.extend({ ...edit, actorId: Identity }).strict()
])
export const FormSettingsRecordSchema = z.union([
  legacyIdentity.extend(record).strict(), sharedIdentity.extend(record).strict()
])
export const FormSettingsEditSchema = z.object(edit).strict()
export type FormSettingsIdentity = z.infer<typeof FormSettingsReadSchema>
export type FormSettingsRecord = z.infer<typeof FormSettingsRecordSchema>
/** Scope is checked separately at each service boundary. Mixed identities are invalid. */
export function sameFormSettingsIdentity(a: FormSettingsIdentity, b: FormSettingsIdentity): boolean {
  if ('definitionId' in a) return 'definitionId' in b && a.definitionId === b.definitionId
  return 'pageId' in b && a.pageId === b.pageId && a.formId === b.formId
}
export interface FormSettingsState {
  activation: 'draft_only'
  canEdit: boolean
  record: FormSettingsRecord | null
}
