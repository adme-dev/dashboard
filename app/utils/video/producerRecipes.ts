export type VideoProducerTargetFormat = 'reels_9x16' | 'youtube_16x9' | 'square_1x1'

export interface VideoProducerRecipe {
  id: string
  label: string
  description: string
  targetFormat: VideoProducerTargetFormat
  brief: string
  preferredAssetTypes: string[]
}

export const VIDEO_PRODUCER_RECIPES: VideoProducerRecipe[] = [
  {
    id: 'dealer-offer-9x16',
    label: 'Dealer offer',
    description: 'Fast vertical offer cut with product, price, and CTA moments.',
    targetFormat: 'reels_9x16',
    brief: 'Create a punchy 9:16 dealer offer edit. Lead with the strongest vehicle/product shot, introduce the offer clearly, keep pacing tight, and finish with a direct call to action.',
    preferredAssetTypes: ['video', 'image', 'overlay', 'voiceover'],
  },
  {
    id: 'product-reveal',
    label: 'Product reveal',
    description: 'Build anticipation, reveal the product, then land the key benefit.',
    targetFormat: 'reels_9x16',
    brief: 'Create a product reveal edit. Start with detail shots or motion, reveal the full product quickly, use overlays for the key benefit, and finish with a clean brand or CTA beat.',
    preferredAssetTypes: ['video', 'image', 'overlay'],
  },
  {
    id: 'brand-story-broll',
    label: 'Brand story',
    description: 'Narrative b-roll edit for awareness and credibility.',
    targetFormat: 'youtube_16x9',
    brief: 'Create a brand story b-roll edit. Sequence wide, medium, and detail shots into a clear narrative, leave space for voiceover, and avoid hard-sell copy unless an offer asset is available.',
    preferredAssetTypes: ['video', 'image', 'voiceover'],
  },
  {
    id: 'testimonial-cutdown',
    label: 'Testimonial cutdown',
    description: 'Short proof-led edit using voice, captions, and supporting visuals.',
    targetFormat: 'reels_9x16',
    brief: 'Create a testimonial cutdown. Open with the strongest proof statement, support it with relevant visuals, keep captions readable, and finish with a trust-building CTA.',
    preferredAssetTypes: ['voiceover', 'video', 'overlay'],
  },
  {
    id: 'event-recap',
    label: 'Event recap',
    description: 'Energy-led recap with highlights, crowd/context, and closing CTA.',
    targetFormat: 'square_1x1',
    brief: 'Create an event recap edit. Lead with the most energetic moment, alternate crowd/context/detail shots, include one concise overlay for the event message, and close with the next action.',
    preferredAssetTypes: ['video', 'image', 'overlay', 'voiceover'],
  },
]

const RECIPE_BY_ID = new Map(VIDEO_PRODUCER_RECIPES.map(recipe => [recipe.id, recipe]))

export function findVideoProducerRecipe(id: string | null | undefined): VideoProducerRecipe | null {
  if (!id) return null
  return RECIPE_BY_ID.get(id) ?? null
}
