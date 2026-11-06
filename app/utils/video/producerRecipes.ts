import { listStoryboardRecipes } from '~~/shared/video/storyboardRecipes'
import type { StoryboardRecipe } from '~~/shared/video/storyboardRecipes'

export type { VideoProducerTargetFormat } from '~~/shared/video/storyboardRecipes'
export type VideoProducerRecipe = Pick<StoryboardRecipe,
  'id' | 'label' | 'description' | 'targetFormat' | 'brief' | 'preferredAssetTypes'>

// Preserve the existing producer picker's public shape and defaults.
export const VIDEO_PRODUCER_RECIPES: VideoProducerRecipe[] = listStoryboardRecipes().map(recipe => ({
  id: recipe.id,
  label: recipe.label,
  description: recipe.description,
  targetFormat: recipe.targetFormat,
  brief: recipe.brief,
  preferredAssetTypes: recipe.preferredAssetTypes
}))

const RECIPE_BY_ID = new Map(VIDEO_PRODUCER_RECIPES.map(recipe => [recipe.id, recipe]))

export function findVideoProducerRecipe(id: string | null | undefined): VideoProducerRecipe | null {
  if (!id) return null
  return RECIPE_BY_ID.get(id) ?? null
}
