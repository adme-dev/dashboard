/** Pure recipe metadata. Capability, pricing and source approval stay server-owned. */
import { z } from 'zod'

export const StoryboardTargetFormatSchema = z.enum(['reels_9x16', 'youtube_16x9', 'square_1x1'])
export const StoryboardReferenceRoleSchema = z.enum(['product', 'presenter', 'location', 'style'])

// These are editorial/prompt suggestions, not provider-enforced camera controls.
export const StoryboardRecipeValuesSchema = z.object({
  targetFormat: StoryboardTargetFormatSchema,
  durationSeconds: z.number().int().min(1).max(120),
  primaryMovement: z.enum(['static', 'push_in', 'pull_out', 'pan_left', 'pan_right', 'orbit']),
  visualLook: z.enum(['natural', 'warm', 'clean']),
  pacing: z.enum(['steady', 'brisk']),
  extraDirection: z.string().max(4000)
}).strict()

export const StoryboardRecipeSnapshotSchema = z.object({
  id: z.string().min(1).max(128),
  version: z.number().int().positive(),
  resolvedValues: StoryboardRecipeValuesSchema
}).strict()

export const StoryboardRecipeSchema = z.object({
  id: z.string().min(1).max(128),
  version: z.number().int().positive(),
  label: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  targetFormat: StoryboardTargetFormatSchema,
  brief: z.string().min(1).max(8000),
  preferredAssetTypes: z.array(z.enum(['video', 'image', 'overlay', 'voiceover'])).min(1),
  referenceRoles: z.array(StoryboardReferenceRoleSchema).max(4),
  defaults: StoryboardRecipeValuesSchema
}).strict().refine(recipe => recipe.targetFormat === recipe.defaults.targetFormat, {
  message: 'Recipe format and default format must agree.'
})

export type StoryboardRecipe = z.infer<typeof StoryboardRecipeSchema>
export type StoryboardRecipeSnapshot = z.infer<typeof StoryboardRecipeSnapshotSchema>
export type StoryboardRecipeValues = z.infer<typeof StoryboardRecipeValuesSchema>
export type VideoProducerTargetFormat = z.infer<typeof StoryboardTargetFormatSchema>

const legacyRecipes = [
  {
    id: 'dealer-offer-9x16',
    label: 'Dealer offer',
    description: 'Fast vertical offer cut with product, price, and CTA moments.',
    targetFormat: 'reels_9x16',
    brief: 'Create a punchy 9:16 dealer offer edit. Lead with the strongest vehicle/product shot, introduce the offer clearly, keep pacing tight, and finish with a direct call to action.',
    preferredAssetTypes: ['video', 'image', 'overlay', 'voiceover']
  },
  {
    id: 'product-reveal',
    label: 'Product reveal',
    description: 'Build anticipation, reveal the product, then land the key benefit.',
    targetFormat: 'reels_9x16',
    brief: 'Create a product reveal edit. Start with detail shots or motion, reveal the full product quickly, use overlays for the key benefit, and finish with a clean brand or CTA beat.',
    preferredAssetTypes: ['video', 'image', 'overlay']
  },
  {
    id: 'brand-story-broll',
    label: 'Brand story',
    description: 'Narrative b-roll edit for awareness and credibility.',
    targetFormat: 'youtube_16x9',
    brief: 'Create a brand story b-roll edit. Sequence wide, medium, and detail shots into a clear narrative, leave space for voiceover, and avoid hard-sell copy unless an offer asset is available.',
    preferredAssetTypes: ['video', 'image', 'voiceover']
  },
  {
    id: 'testimonial-cutdown',
    label: 'Testimonial cutdown',
    description: 'Short proof-led edit using voice, captions, and supporting visuals.',
    targetFormat: 'reels_9x16',
    brief: 'Create a testimonial cutdown. Open with the strongest proof statement, support it with relevant visuals, keep captions readable, and finish with a trust-building CTA.',
    preferredAssetTypes: ['voiceover', 'video', 'overlay']
  },
  {
    id: 'event-recap',
    label: 'Event recap',
    description: 'Energy-led recap with highlights, crowd/context, and closing CTA.',
    targetFormat: 'square_1x1',
    brief: 'Create an event recap edit. Lead with the most energetic moment, alternate crowd/context/detail shots, include one concise overlay for the event message, and close with the next action.',
    preferredAssetTypes: ['video', 'image', 'overlay', 'voiceover']
  }
]

// Keep revision 1 immutable; introduce a new revision when defaults/meaning change.
// Catalogue reads return copies so editor state cannot mutate later requests.
const catalogue = legacyRecipes.map(recipe => StoryboardRecipeSchema.parse({
  ...recipe,
  version: 1,
  referenceRoles: recipe.id === 'testimonial-cutdown'
    ? ['presenter']
    : recipe.id === 'event-recap'
      ? ['location']
      : recipe.id === 'brand-story-broll' ? ['style', 'location'] : ['product'],
  defaults: {
    targetFormat: recipe.targetFormat,
    durationSeconds: 30,
    primaryMovement: 'static',
    visualLook: 'natural',
    pacing: recipe.id === 'dealer-offer-9x16' || recipe.id === 'event-recap' ? 'brisk' : 'steady',
    extraDirection: ''
  }
}))

export function listStoryboardRecipes(): StoryboardRecipe[] {
  return catalogue.map(recipe => StoryboardRecipeSchema.parse(recipe))
}

/** Resolves settings only: no planning call, save, generation or approval. */
export function resolveStoryboardRecipe(id: string, version: number, values: unknown): StoryboardRecipeSnapshot {
  const recipe = catalogue.find(candidate => candidate.id === id && candidate.version === version)
  if (!recipe) throw new Error('Unknown storyboard recipe revision.')
  const overrides = StoryboardRecipeValuesSchema.partial().parse(values)
  // An omitted/undefined optional setting retains the revision's default.
  const defined = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value !== undefined))
  return StoryboardRecipeSnapshotSchema.parse({ id, version, resolvedValues: { ...recipe.defaults, ...defined } })
}

/** Version-1 editorial guidance, separate from provider-native controls. */
export function storyboardRecipeGuidance(snapshot: StoryboardRecipeSnapshot): string {
  const pinned = resolveStoryboardRecipe(snapshot.id, snapshot.version, snapshot.resolvedValues)
  const recipe = catalogue.find(value => value.id === pinned.id && value.version === pinned.version)!
  const structure: Record<string, string> = {
    'dealer-offer-9x16': 'Lead with product, reserve an offer beat only for supplied copy, then close with supplied CTA. Missing offer facts stay unresolved.',
    'product-reveal': 'Build anticipation with details, reveal the full product, then show its context and close. Use only supplied benefit copy.',
    'brand-story-broll': 'Establish context with a wide view, develop the story with medium and detail views, then close. Leave room for supplied speech.',
    'testimonial-cutdown': 'Lead with supplied proof, support it with relevant visuals, then close. Never invent an endorsement.',
    'event-recap': 'Open with a highlight, alternate context and detail, then close with supplied event copy.'
  }
  const values = pinned.resolvedValues
  return [structure[recipe.id], `Prompt guidance only: primary movement ${values.primaryMovement}; visual look ${values.visualLook}; pacing ${values.pacing}.`, 'Keep required text and logos in reviewed overlays, not generated scenery.', values.extraDirection.trim()].filter(Boolean).join(' ')
}
