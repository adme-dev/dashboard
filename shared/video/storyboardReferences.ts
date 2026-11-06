import { z } from 'zod'
import { StoryboardReferenceRoleSchema } from './storyboardRecipes'
import type { ReadinessFinding } from './storyboard'

export const ReferenceSourceKindSchema = z.enum(['video_asset', 'audio_asset', 'banner_project', 'source_asset'])
const Hash = z.string().regex(/^[a-f0-9]{64}$/)
export const ReferenceSelectionSchema = z.object({
  role: StoryboardReferenceRoleSchema,
  sourceKind: ReferenceSourceKindSchema,
  assetId: z.string().uuid(),
  expectedContentHash: Hash.nullable(),
  decision: z.enum(['unreviewed', 'approved', 'revoked']),
  evidence: z.string().trim().max(2000).default('')
}).strict().refine(value => value.decision !== 'approved' || (value.expectedContentHash !== null && value.evidence.length > 0), {
  message: 'Approval requires the reviewed identity and an evidence note.'
})
export const ReferenceSetWriteSchema = z.object({
  expectedRevision: z.string().uuid().nullable(),
  operationId: z.string().uuid(),
  references: z.array(ReferenceSelectionSchema).max(24),
  brandKit: z.object({ id: z.string().uuid(), expectedContentHash: Hash.nullable() }).strict().nullable()
}).strict().refine(value => new Set(value.references.map(ref => `${ref.role}:${ref.sourceKind}:${ref.assetId}`)).size === value.references.length, {
  message: 'Duplicate reference assignments are not allowed.'
})
export type ReferenceSetWrite = z.infer<typeof ReferenceSetWriteSchema>
export type ReferenceSourceKind = z.infer<typeof ReferenceSourceKindSchema>
export interface PinnedReference {
  role: z.infer<typeof StoryboardReferenceRoleSchema>
  sourceKind: ReferenceSourceKind
  assetId: string
  /** Fingerprint of canonical fields + R2 ETag/size, not a SHA-256 of file bytes. */
  contentHash: string
  identityKind: 'record_and_object' | 'record'
  decision: 'unreviewed' | 'approved' | 'revoked'
  approval: { actorId: string, approvedAt: string, contentHash: string, evidence: string } | null
}
export interface StoryboardReferenceSet {
  id: string
  projectId: string
  sequence: number
  parentId: string | null
  references: PinnedReference[]
  brandKit: { id: string, contentHash: string } | null
  contentHash: string
  createdBy: string
  createdAt: string
}
export interface ResolvedReferenceSet {
  referenceSet: StoryboardReferenceSet
  findings: ReadinessFinding[]
  eligible: boolean
}
