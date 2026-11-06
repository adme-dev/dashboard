import { describe, expect, it } from 'vitest'
import { StoryboardRecipeSchema, listStoryboardRecipes, resolveStoryboardRecipe } from '../../shared/video/storyboardRecipes'
import { validateStoryboardPlan } from '../../shared/video/storyboardValidation'
import { storyboardFixture } from './fixtures/storyboard'

describe('versioned storyboard recipes', () => {
  it('resolves defaults without provider or pricing authority', () => {
    const result = resolveStoryboardRecipe('dealer-offer-9x16', 1, {})
    expect(result).toEqual({ id: 'dealer-offer-9x16', version: 1, resolvedValues: { targetFormat: 'reels_9x16', durationSeconds: 30, primaryMovement: 'static', visualLook: 'natural', pacing: 'brisk', extraDirection: '' } })
  })

  it.each([{ durationSeconds: 121 }, { durationSeconds: '30' }, { primaryMovement: ['pan_left', 'orbit'] }, { modelId: 'unapproved' }, { extraDirection: null }])('rejects invalid or unrecognized controls %j', (values) => {
    expect(() => resolveStoryboardRecipe('dealer-offer-9x16', 1, values)).toThrow()
  })

  it('rejects unknown recipe revisions', () => {
    expect(() => resolveStoryboardRecipe('missing', 1, {})).toThrow()
    expect(() => resolveStoryboardRecipe('dealer-offer-9x16', 2, {})).toThrow()
  })

  it('rejects invalid catalogue defaults', () => {
    const recipe = listStoryboardRecipes()[0]
    expect(StoryboardRecipeSchema.safeParse({ ...recipe, defaults: { ...recipe.defaults, durationSeconds: 0 } }).success).toBe(false)
  })

  it('isolates snapshots and catalogue reads from subsequent edits', () => {
    const recipe = listStoryboardRecipes()[0]
    recipe.defaults.durationSeconds = 60
    const first = resolveStoryboardRecipe('dealer-offer-9x16', 1, { extraDirection: '' })
    const second = resolveStoryboardRecipe('dealer-offer-9x16', 1, { durationSeconds: 15 })
    expect(first.resolvedValues.durationSeconds).toBe(30)
    expect(second.resolvedValues.durationSeconds).toBe(15)
    const plan = { ...storyboardFixture(), recipe: first }
    expect(validateStoryboardPlan(plan).ok).toBe(true)
    second.resolvedValues.durationSeconds = 60
    expect(plan.recipe.resolvedValues.durationSeconds).toBe(30)
  })

  it('rejects a recipe snapshot inconsistent with its plan format or duration', () => {
    const plan = { ...storyboardFixture(), recipe: resolveStoryboardRecipe('dealer-offer-9x16', 1, { durationSeconds: 15 }) }
    expect(validateStoryboardPlan(plan).ok).toBe(false)
  })
})
