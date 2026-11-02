import { ref, watch, provide, type Ref, type InjectionKey } from 'vue'
import {
  ConditionDefinitionInputSchema,
  type ConditionDefinition,
  type ConditionDefinitionInput
} from '~~/shared/emailRendering/conditions'

export type EdmConditionAuthoring = ReturnType<typeof useEdmConditions>
export const EDM_CONDITION_AUTHORING: InjectionKey<EdmConditionAuthoring>
  = Symbol('edm-condition-authoring')
export function useEdmConditions(
  clientId: Ref<string | null>,
  documentId: Ref<string | null>
) {
  const definitions = ref<ConditionDefinition[]>([])
  const canEdit = ref(false)
  const loading = ref(false)
  const busy = ref(false)
  const error = ref('')
  let generation = 0
  async function load() {
    const client = clientId.value
    const document = documentId.value
    const request = ++generation
    definitions.value = []
    canEdit.value = false
    error.value = ''
    loading.value = !!client
    if (!client) return
    try {
      const [catalog, authority] = await Promise.all([
        $fetch<{ items: ConditionDefinition[] }>(
          `/api/agency/email/conditions?client_id=${encodeURIComponent(client)}`
        ),
        document
          ? $fetch<{ canEdit: boolean, clientId: string | null }>(
              `/api/email/design/conditions?documentId=${encodeURIComponent(document)}`
            )
          : Promise.resolve({ canEdit: false, clientId: null })
      ])
      if (request !== generation) return
      definitions.value = catalog.items
      canEdit.value = authority.canEdit && authority.clientId === client
    } catch {
      if (request === generation)
        error.value
          = 'Conditions could not load. Retry to check current client access.'
    } finally {
      if (request === generation) loading.value = false
    }
  }
  watch(
    [clientId, documentId],
    () => {
      void load()
    },
    { immediate: true, flush: 'sync' }
  )
  async function save(input: ConditionDefinitionInput, id?: string) {
    const client = clientId.value
    if (!client || input.client_id !== client || busy.value || !canEdit.value)
      return false
    const parsed = ConditionDefinitionInputSchema.safeParse(input)
    if (!parsed.success) return false
    busy.value = true
    error.value = ''
    try {
      const { name, predicate } = parsed.data
      await $fetch(
        id
          ? `/api/agency/email/conditions/${id}?client_id=${encodeURIComponent(client)}`
          : '/api/agency/email/conditions',
        {
          method: id ? 'PATCH' : 'POST',
          body: id ? { name, predicate } : parsed.data
        }
      )
      if (client !== clientId.value) return false
      await load()
      return true
    } catch {
      if (client === clientId.value)
        error.value
          = 'Could not save this condition. Check your access and use a unique name.'
      return false
    } finally {
      busy.value = false
    }
  }
  async function remove(id: string) {
    const client = clientId.value
    if (!client || busy.value || !canEdit.value) return
    busy.value = true
    error.value = ''
    try {
      await $fetch(
        `/api/agency/email/conditions/${id}?client_id=${encodeURIComponent(client)}`,
        { method: 'DELETE' }
      )
      if (client === clientId.value) await load()
    } catch {
      if (client === clientId.value)
        error.value
          = 'Could not delete this condition. Check your client access and retry.'
    } finally {
      busy.value = false
    }
  }
  const authoring = {
    clientId,
    documentId,
    definitions,
    canEdit,
    loading,
    busy,
    error,
    load,
    save,
    remove
  }
  provide(EDM_CONDITION_AUTHORING, authoring)
  return authoring
}
