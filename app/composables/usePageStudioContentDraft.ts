import { computed, ref } from 'vue'
import {
  PageStudioContentEditSchema,
  PageStudioContentRevisionSchema,
  samePageStudioContentScope,
  type PageStudioBusinessContent,
  type PageStudioContentScope
} from '~~/shared/pageStudio/businessContent'

export function usePageStudioContentDraft() {
  const collections = ref<PageStudioBusinessContent['collections']>([])
  const revision = ref(0)
  const saving = ref(false)
  const conflicted = ref(false)
  const baseline = ref('[]')
  let scope: PageStudioContentScope | null = null
  const dirty = computed(() => JSON.stringify(collections.value) !== baseline.value)

  function load(value: unknown, discard = false): boolean {
    if (saving.value || (dirty.value && !discard)) return false
    const empty = value && typeof value === 'object' && 'revision' in value && value.revision === 0
      && 'content' in value && value.content === null
    const state = empty ? null : PageStudioContentRevisionSchema.parse(value)
    collections.value = state?.content.collections ?? []
    revision.value = state?.revision ?? 0
    scope = state?.content.scope ?? null
    baseline.value = JSON.stringify(collections.value)
    conflicted.value = false
    return true
  }

  async function save(send: (body: unknown) => Promise<unknown>) {
    if (saving.value) throw new Error('A save is already in progress')
    if (conflicted.value) throw new Error('Reload the latest content before saving')
    const submittedDraft = JSON.stringify(collections.value)
    const body = PageStudioContentEditSchema.parse({ collections: collections.value, expectedRevision: revision.value })
    saving.value = true
    try {
      const result = PageStudioContentRevisionSchema.parse(await send(body))
      if (result.revision !== body.expectedRevision + 1
        || (scope && !samePageStudioContentScope(result.content.scope, scope))
        || JSON.stringify(result.content.collections) !== JSON.stringify(body.collections)) {
        throw new Error('The saved content could not be verified. Reload to check the accepted revision.')
      }
      revision.value = result.revision
      scope = result.content.scope
      baseline.value = JSON.stringify(result.content.collections)
      // Never overwrite a newer local edit made while this save was in flight.
      if (JSON.stringify(collections.value) === submittedDraft) collections.value = result.content.collections
      return result
    } catch (error) {
      const failure = error as { statusCode?: number, status?: number }
      if (failure?.statusCode === 409 || failure?.status === 409) conflicted.value = true
      throw error
    } finally { saving.value = false }
  }

  return { collections, conflicted, dirty, load, revision, save, saving }
}
