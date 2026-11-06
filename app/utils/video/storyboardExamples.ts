import { listStoryboardRecipes } from '~~/shared/video/storyboardRecipes'
import type { VideoProducerTargetFormat } from '~~/shared/video/storyboardRecipes'

export interface StoryboardExample {
  id: string
  label: string
  recipeId: string
  recipeVersion: number
  evaluationRevision: number
  status: 'draft'
  sampleCopy: true
  brief: string
  targetFormat: VideoProducerTargetFormat
  durationSeconds: number
  clientId: string | null
  assets: string[]
}
// Owned editorial fixtures: no external client media, approval, provider output or performance claim.
const catalogue: StoryboardExample[] = [{ id: 'neutral-product-study', label: 'Object study (sample)', recipeId: 'product-reveal', recipeVersion: 1,
  evaluationRevision: 1, status: 'draft', sampleCopy: true, brief: 'Sample direction: reveal a neutral studio object using your own cleared project footage. Detail, full view, closing detail.',
  targetFormat: 'reels_9x16', durationSeconds: 15, clientId: null, assets: [] }]
export function getStoryboardExamples() {
  return structuredClone(catalogue)
}
export function validateStoryboardExample(example: StoryboardExample, clientId: string | null, accessibleAssetIds: string[] = []) {
  const canonical = catalogue.find(item => item.id === example.id)
  const recipe = listStoryboardRecipes().find(item => item.id === example.recipeId)
  return Boolean(canonical && JSON.stringify(canonical) === JSON.stringify(example) && recipe?.version === example.recipeVersion
    && example.evaluationRevision === 1 && example.status === 'draft'
    && (example.clientId === null || example.clientId === clientId) && example.assets.every(id => accessibleAssetIds.includes(id)))
}
