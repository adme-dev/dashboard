import { describe, expect, it } from 'vitest'
import {
  VIDEO_PRODUCER_RECIPES,
  findVideoProducerRecipe,
} from '~~/app/utils/video/producerRecipes'

describe('video producer recipes', () => {
  it('defines the first agency recipe set', () => {
    expect(VIDEO_PRODUCER_RECIPES.map(recipe => recipe.id)).toEqual([
      'dealer-offer-9x16',
      'product-reveal',
      'brand-story-broll',
      'testimonial-cutdown',
      'event-recap',
    ])
  })

  it('sets editable brief and format defaults without model/provider routing', () => {
    for (const recipe of VIDEO_PRODUCER_RECIPES) {
      expect(recipe.brief.length).toBeGreaterThan(40)
      expect(['reels_9x16', 'youtube_16x9', 'square_1x1']).toContain(recipe.targetFormat)
      expect(recipe.preferredAssetTypes.length).toBeGreaterThan(1)
      expect(recipe).not.toHaveProperty('modelId')
      expect(recipe).not.toHaveProperty('provider')
      expect(recipe).not.toHaveProperty('policyOverride')
    }
  })

  it('finds recipes by id', () => {
    expect(findVideoProducerRecipe('dealer-offer-9x16')?.label).toBe('Dealer offer')
    expect(findVideoProducerRecipe('missing')).toBeNull()
    expect(findVideoProducerRecipe(null)).toBeNull()
  })
})
