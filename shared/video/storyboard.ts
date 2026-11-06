/**
 * Storyboard input contracts, shared by client and server. No I/O or authority.
 * A structurally valid plan can contain unresolved/unapproved media. Server-side
 * project access, canonical copy approval and media readiness are separate gates.
 */
import { z } from 'zod'
import {
  StoryboardRecipeSnapshotSchema,
  StoryboardReferenceRoleSchema,
  StoryboardTargetFormatSchema
} from './storyboardRecipes'

const Identity = z.string().uuid()
const LocalId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const Hash = z.string().regex(/^[a-f0-9]{64}$/)
const Frame = z.number().int().nonnegative()
const Duration = z.number().int().positive()
// Validate non-blank text without ever trimming or normalizing saved copy.
const ExactText = z.string().min(1).max(20000).refine(text => text.trim().length > 0)

export const AssetBindingSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('unresolved'),
    reason: z.enum(['missing_source', 'not_selected', 'needs_review'])
  }).strict(),
  z.object({
    status: z.literal('bound'),
    sourceKind: z.enum(['video_asset', 'audio_asset', 'banner_project', 'source_asset']),
    assetId: Identity,
    contentHash: Hash,
    sourceInFrames: Frame.optional(),
    sourceOutFrames: Duration.optional()
  }).strict().refine(asset => (asset.sourceInFrames === undefined && asset.sourceOutFrames === undefined)
    || (asset.sourceInFrames !== undefined && asset.sourceOutFrames !== undefined && asset.sourceOutFrames > asset.sourceInFrames), {
    message: 'Source frame range must contain an ordered in/out pair.'
  })
])

export const CopyRevisionSchema = z.object({
  id: Identity,
  revision: z.number().int().positive(),
  contentHash: Hash,
  scriptSegments: z.array(z.object({ id: LocalId, text: ExactText }).strict()).max(256),
  cues: z.array(z.object({ id: LocalId, text: ExactText, required: z.boolean() }).strict()).max(256),
  approval: z.object({ actorId: Identity, approvedAt: z.string().datetime(), contentHash: Hash }).strict().nullable()
}).strict().refine(copy => !copy.approval || copy.approval.contentHash === copy.contentHash, {
  message: 'Copy approval hash must match its revision.'
})

const AudioCueSchema = z.object({
  id: LocalId,
  kind: z.enum(['voiceover', 'music', 'sfx']),
  required: z.boolean(),
  startFrame: Frame,
  durationFrames: Duration,
  timing: z.enum(['proposed', 'reviewed']),
  asset: z.union([AssetBindingSchema, z.object({ status: z.literal('omitted'), reason: z.string().min(1).max(1000) }).strict()])
}).strict()

const CaptionCueSchema = z.object({
  id: LocalId,
  spokenSegmentId: LocalId,
  startFrame: Frame,
  durationFrames: Duration,
  timing: z.enum(['proposed', 'reviewed'])
}).strict()

const OverlayCueSchema = z.object({
  id: LocalId,
  copyCueId: LocalId,
  startFrame: Frame,
  durationFrames: Duration,
  asset: AssetBindingSchema
}).strict()

export const StoryboardShotSchema = z.object({
  id: Identity,
  purpose: z.string().min(1).max(1000),
  durationFrames: Duration,
  visualDirection: z.string().max(8000),
  referenceRoles: z.array(StoryboardReferenceRoleSchema).max(4),
  spokenSegmentIds: z.array(LocalId).max(256),
  copyCueIds: z.array(LocalId).max(256),
  visual: AssetBindingSchema,
  audioCues: z.array(AudioCueSchema).max(64),
  captionCues: z.array(CaptionCueSchema).max(256),
  overlayCues: z.array(OverlayCueSchema).max(256)
}).strict()

export const StoryboardPlanSchema = z.object({
  schemaVersion: z.literal(1),
  id: Identity,
  projectId: Identity,
  revision: Identity,
  fps: z.number().int().positive(),
  durationFrames: Duration,
  targetFormat: StoryboardTargetFormatSchema,
  inputMode: z.enum(['idea', 'approved_script']),
  copyRevisionId: Identity,
  copy: CopyRevisionSchema,
  referenceSetRevisionId: Identity,
  recipe: StoryboardRecipeSnapshotSchema.optional(),
  shots: z.array(StoryboardShotSchema).min(1).max(24)
}).strict().refine(plan => plan.durationFrames / plan.fps <= 120, {
  message: 'Storyboard duration exceeds 120 seconds.'
})

export type AssetBinding = z.infer<typeof AssetBindingSchema>
export type CopyRevision = z.infer<typeof CopyRevisionSchema>
export type StoryboardShot = z.infer<typeof StoryboardShotSchema>
export type StoryboardPlan = z.infer<typeof StoryboardPlanSchema>

export interface ReadinessFinding {
  code: string
  severity: 'blocker' | 'warning'
  shotId?: string
  message: string
}

export type StoryboardPlanValidation
  = | { ok: true, plan: StoryboardPlan }
    | { ok: false, findings: ReadinessFinding[] }
