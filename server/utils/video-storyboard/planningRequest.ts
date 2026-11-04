import { z } from 'zod'
import { StoryboardShotSchema } from '~~/shared/video/storyboard'
import { StoryboardRecipeValuesSchema, StoryboardTargetFormatSchema } from '~~/shared/video/storyboardRecipes'
import { ReferenceSourceKindSchema } from '~~/shared/video/storyboardReferences'
import { StoryboardCopyInputSchema } from './copy'

const common = {
  operationId: z.string().uuid(), expectedRevision: z.string().uuid().nullable(), expectedReferenceSetRevisionId: z.string().uuid(),
  inputMode: z.enum(['idea', 'approved_script']), durationSeconds: z.number().int().min(1).max(120), targetFormat: StoryboardTargetFormatSchema,
  copy: StoryboardCopyInputSchema,
  assets: z.array(z.object({ sourceKind: ReferenceSourceKindSchema, assetId: z.string().uuid() }).strict()).max(64),
  recipe: z.object({ id: z.string().max(128), version: z.number().int().positive(), values: StoryboardRecipeValuesSchema.partial() }).strict().optional()
}
export const StoryboardPlanningRequestSchema = z.discriminatedUnion('method', [
  z.object({ ...common, method: z.literal('ai'), brief: z.string().min(1).max(4000) }).strict(),
  z.object({ ...common, method: z.literal('manual'), shots: z.array(StoryboardShotSchema).min(1).max(24) }).strict()
])
export const StoryboardAcceptRequestSchema = z.object({
  operationId: z.string().uuid(), expectedRevision: z.string().uuid().nullable(), candidateId: z.string().uuid(),
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/), acceptChanges: z.literal(true), approveCopy: z.boolean()
}).strict()
export type StoryboardPlanningRequest = z.infer<typeof StoryboardPlanningRequestSchema>
export type StoryboardAcceptRequest = z.infer<typeof StoryboardAcceptRequestSchema>
