import { computed, ref } from 'vue'
import {
  CollectionDefinitionSchema,
  parseCollectionValues,
  type CollectionDefinition,
  type CollectionValues
} from '~~/shared/pageStudio/collectionDefinition'
import { CollectionRecordRevisionSchema, collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'

export function usePageStudioCollectionDraft(input: CollectionDefinition, id: string) {
  const definition = ref(CollectionDefinitionSchema.parse(input))
  const values = ref<CollectionValues>(Object.fromEntries(definition.value.fields.filter(field => field.required && field.type === 'boolean').map(field => [field.id, false]))),
    archived = ref(false),
    expectedRevision = ref(0),
    baseline = ref(''),
    saving = ref(false),
    conflicted = ref(false)
  const snapshot = () => collectionCanonical({ values: values.value, archived: archived.value })
  baseline.value = snapshot()
  const dirty = computed(() => expectedRevision.value === 0 || snapshot() !== baseline.value)
  const validationErrors = computed<Record<string, string>>(() => {
    try {
      parseCollectionValues(definition.value, values.value)
      return {}
    } catch (error) {
      const issues = (error as { issues?: { path: PropertyKey[], message: string }[] }).issues ?? []
      return Object.fromEntries(issues.map(issue => [String(issue.path[0] ?? ''), issue.message]))
    }
  })
  function updateDefinition(input: CollectionDefinition) {
    const next = CollectionDefinitionSchema.parse(input)
    if (next.id !== definition.value.id || !samePageStudioContentScope(next.scope, definition.value.scope)) throw new Error('Collection identity mismatch')
    definition.value = next
  }
  function checked(input: unknown) {
    const saved = CollectionRecordRevisionSchema.parse(input)
    if (
      saved.record.id !== id
      || saved.record.collectionId !== definition.value.id
      || !samePageStudioContentScope(saved.record.scope, definition.value.scope)
    )
      throw new Error('Record identity mismatch')
    return saved
  }
  function load(input: unknown, discard = false) {
    if (saving.value || (expectedRevision.value > 0 && dirty.value && !discard)) return false
    const saved = checked(input)
    values.value = structuredClone(saved.record.values)
    archived.value = saved.record.archived
    expectedRevision.value = saved.record.revision
    baseline.value = snapshot()
    conflicted.value = false
    return true
  }
  function restore(input: unknown) {
    if (saving.value) throw new Error('A save is in progress')
    const saved = checked(input)
    values.value = parseCollectionValues(definition.value, saved.record.values)
    archived.value = false
  }
  async function save(send: (body: unknown) => Promise<unknown>) {
    if (saving.value || conflicted.value) throw new Error('Reload the latest record before saving')
    const submitted = snapshot(),
      body = {
        values: parseCollectionValues(definition.value, values.value),
        archived: archived.value,
        schemaVersion: definition.value.version,
        expectedRevision: expectedRevision.value
      }
    saving.value = true
    try {
      const result = checked(await send(body))
      if (
        result.record.revision !== body.expectedRevision + 1
        || result.record.schemaVersion !== body.schemaVersion
        || collectionCanonical(result.record.values) !== collectionCanonical(body.values)
        || result.record.archived !== body.archived
      )
        throw new Error('Saved record could not be verified')
      expectedRevision.value = result.record.revision
      baseline.value = collectionCanonical({ values: result.record.values, archived: result.record.archived })
      if (snapshot() === submitted) {
        values.value = result.record.values
        archived.value = result.record.archived
      }
      return result
    } catch (error) {
      const failure = error as { statusCode?: number, status?: number }
      if (failure.statusCode === 409 || failure.status === 409) conflicted.value = true
      throw error
    } finally {
      saving.value = false
    }
  }
  return { values, archived, expectedRevision, saving, conflicted, dirty, validationErrors, updateDefinition, load, restore, save }
}
