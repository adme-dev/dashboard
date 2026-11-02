import { computed, provide, ref, watch, type InjectionKey, type Ref } from 'vue'
import { mergeChoices, sampleMergeVariables, SAMPLE_MERGE_VALUES, type MergeDefinition, type MergeDefinitionInput } from '~~/shared/emailRendering/mergeTagDefinitions'

export type EdmMergeAuthoring = ReturnType<typeof useEdmMergeTags>
export const EDM_MERGE_AUTHORING: InjectionKey<EdmMergeAuthoring> = Symbol('edm-merge-authoring')
export function useEdmMergeTags(clientId: Ref<string | null>) {
  const definitions = ref<MergeDefinition[]>([])
  const loading = ref(false)
  const error = ref('')
  const busy = ref(false)
  const previewMode = ref('tokens')
  const samples = ref({ ...SAMPLE_MERGE_VALUES })
  let generation = 0
  async function load() {
    const client = clientId.value
    const request = ++generation
    definitions.value = []
    error.value = ''
    loading.value = !!client
    if (!client) return
    try {
      const result = await $fetch<{ items: MergeDefinition[] }>(`/api/agency/email/merge-tags?client_id=${encodeURIComponent(client)}`)
      if (request === generation) definitions.value = result.items
    } catch {
      if (request === generation) error.value = 'Merge tags could not load. Retry before using client sample values.'
    } finally {
      if (request === generation) loading.value = false
    }
  }
  watch(clientId, () => {
    previewMode.value = 'tokens'
    samples.value = { ...SAMPLE_MERGE_VALUES }
    void load()
  }, { immediate: true, flush: 'sync' })
  async function save(input: MergeDefinitionInput, id?: string) {
    const client = clientId.value
    if (!client || input.client_id !== client || busy.value) return false
    busy.value = true
    error.value = ''
    try {
      const { name, preview_value, fallback } = input
      await $fetch(id ? `/api/agency/email/merge-tags/${id}?client_id=${encodeURIComponent(client)}` : '/api/agency/email/merge-tags', {
        method: id ? 'PATCH' : 'POST', body: id ? { name, preview_value, fallback } : input
      })
      if (client !== clientId.value) return false
      await load()
      return true
    } catch {
      if (client === clientId.value) error.value = 'Could not save this tag. Check your access and use a unique token.'
      return false
    } finally { busy.value = false }
  }
  async function remove(id: string) {
    const client = clientId.value
    if (!client || busy.value) return
    busy.value = true
    error.value = ''
    try {
      await $fetch(`/api/agency/email/merge-tags/${id}?client_id=${encodeURIComponent(client)}`, { method: 'DELETE' })
      if (client === clientId.value) await load()
    } catch {
      if (client === clientId.value) error.value = 'Could not delete this tag. Check your client access and retry.'
    } finally { busy.value = false }
  }
  const authoring = { clientId, definitions, loading, error, busy, previewMode, samples, load, save, remove,
    choices: computed(() => mergeChoices(definitions.value)),
    variables: computed(() => previewMode.value === 'samples' ? sampleMergeVariables(definitions.value, samples.value) : undefined)
  }
  provide(EDM_MERGE_AUTHORING, authoring)
  return authoring
}
