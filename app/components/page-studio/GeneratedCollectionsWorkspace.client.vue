<script setup lang="ts">
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import type { CollectionDefinition } from '~~/shared/pageStudio/collectionDefinition'
import {
  CollectionDefinitionPageSchema,
  CollectionDefinitionRevisionSchema,
  CollectionRecordPageSchema,
  CollectionRecordRevisionSchema,
  type CollectionRecordRevision
} from '~~/shared/pageStudio/collectionApi'

const props = defineProps<{ audience: 'agency' | 'portal', siteId: string }>()
const endpoint = computed(
  () => `/api/${props.audience}/page-studio/sites/${encodeURIComponent(props.siteId)}/collections`
)
const { data, pending, error, refresh } = await useFetch<{
  items: unknown[]
  nextCursor: string | null
  canEdit: boolean
  canManageSchema: boolean
}>(endpoint, { key: computed(() => `generated-collections:${props.audience}:${props.siteId}`) })
const definitions = ref<CollectionDefinition[]>([]),
  selectedCollection = ref('__none__'),
  selectedRecord = ref('__none__'),
  records = ref<CollectionRecordRevision[]>([])
const recordCursor = ref<string | null>(null),
  definitionCursor = ref<string | null>(null),
  loading = ref(false),
  failure = ref(''),
  includeArchived = ref(false),
  historyRevision = ref(1),
  history = ref<CollectionRecordRevision | null>(null)
const drafts = shallowReactive(new Map<string, ReturnType<typeof usePageStudioCollectionDraft>>())
const definition = computed(() => definitions.value.find(item => item.id === selectedCollection.value))
const draftKey = (collectionId: string, recordId: string) => `${endpoint.value}/${collectionId}/${recordId}`
let requestEpoch = 0
watch(endpoint, () => {
  requestEpoch += 1
  definitions.value = []
  records.value = []
  selectedCollection.value = '__none__'
  selectedRecord.value = '__none__'
  history.value = null
  setupState.value = null
  failure.value = ''
})
const draft = computed(() => drafts.get(draftKey(selectedCollection.value, selectedRecord.value)))
const recordOptions = computed(() => {
  const listed = records.value.map(item => ({
    label: String(item.record.values[definition.value?.displayFieldId ?? ''] ?? item.record.id) + (item.record.archived ? ' (archived)' : ''),
    value: item.record.id
  }))
  const prefix = `${endpoint.value}/${selectedCollection.value}/`
  for (const [key, cached] of drafts) {
    if (!key.startsWith(prefix)) continue
    const id = key.slice(prefix.length)
    if (listed.some(item => item.value === id)) continue
    if (cached.expectedRevision.value > 0 && !cached.dirty.value && id !== selectedRecord.value) continue
    const name = String(cached.values.value[definition.value?.displayFieldId ?? ''] ?? '').trim() || 'Untitled entry'
    listed.push({ label: `${name} (${cached.expectedRevision.value === 0 ? 'unsaved' : cached.dirty.value ? 'draft' : 'saved'})`, value: id })
  }
  return [{ label: 'Choose an entry', value: '__none__' }, ...listed]
})

const values = computed({
  get: () => draft.value?.values.value ?? {},
  set: (value) => {
    if (draft.value) draft.value.values.value = value
  }
})
const canEdit = computed(() => data.value?.canEdit === true && !error.value),
  canManageSchema = computed(() => data.value?.canManageSchema === true && !error.value)
const schemaOpen = ref(false),
  schemaNew = ref(false),
  schemaDirty = ref(false),
  schemaSaving = ref(false),
  schemaFailure = ref('')
const dirty = computed(() => schemaDirty.value || [...drafts.values()].some(item => item.dirty.value))
const saving = computed(() => schemaSaving.value || [...drafts.values()].some(item => item.saving.value))
const confirmOpen = ref(false),
  confirmTitle = ref(''),
  confirmDescription = ref('')
let decision: ((accepted: boolean) => void) | null = null
const toast = useToast()
const setupPending = computed(() => error.value?.statusCode === 503)
const setupState = ref<{ status: string, canConfigure: boolean, requestId?: string } | null>(null),
  setupBusy = ref(false),
  setupFailure = ref('')
const setupKey = computed(() => `page-studio-collection-setup:${props.audience}:${props.siteId}`)

function message(error: unknown) {
  const value = error as { data?: { statusMessage?: string, error?: { message?: string } }, message?: string }
  return (
    value.data?.error?.message
    ?? value.data?.statusMessage
    ?? 'The request could not be completed. Your edits are still here.'
  )
}
function confirm(title: string, description: string) {
  decision?.(false)
  confirmTitle.value = title
  confirmDescription.value = description
  confirmOpen.value = true
  return new Promise<boolean>((resolve) => {
    decision = resolve
  })
}
function decide(accepted: boolean) {
  const resolve = decision
  decision = null
  confirmOpen.value = false
  resolve?.(accepted)
}
watch(confirmOpen, (open) => {
  if (!open && decision) decide(false)
})
async function guard() {
  if (saving.value) return false
  return (
    !dirty.value
    || (await confirm('Leave without saving?', 'Unsaved custom collection changes will be discarded.'))
  )
}
onBeforeRouteLeave(guard)
onBeforeRouteUpdate(guard)
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onUnmounted(() => {
  decide(false)
  window.removeEventListener('beforeunload', beforeUnload)
})
watch(
  data,
  (value) => {
    if (!value) return
    try {
      const page = CollectionDefinitionPageSchema.parse({ items: value.items, nextCursor: value.nextCursor })
      if (page.items.some(item => item.definition.scope.siteId !== props.siteId)) return
      definitions.value = page.items.map(item => item.definition)
      for (const definition of definitions.value) {
        for (const [key, cached] of drafts) {
          if (key.startsWith(`${endpoint.value}/${definition.id}/`)) cached.updateDefinition(definition)
        }
      }
      definitionCursor.value = page.nextCursor
      if (!definitions.value.some(item => item.id === selectedCollection.value))
        selectedCollection.value = definitions.value[0]?.id ?? '__none__'
    } catch {
      failure.value = 'Collection definitions could not be verified.'
    }
  },
  { immediate: true }
)
watch(selectedCollection, () => {
  history.value = null
  records.value = []
  recordCursor.value = null
  selectedRecord.value = '__none__'
  void loadRecords()
})
watch(includeArchived, () => void loadRecords())
watch(
  setupPending,
  async (pending) => {
    if (pending) {
      try {
        setupState.value = await $fetch(`${endpoint.value}/setup`)
      } catch {
        setupState.value = null
      }
    }
  },
  { immediate: true }
)
function recordUrl(id = selectedRecord.value) {
  return `${endpoint.value}/${encodeURIComponent(selectedCollection.value)}/records/${encodeURIComponent(id)}`
}
async function loadRecords(append = false) {
  const collectionId = selectedCollection.value,
    epoch = requestEpoch
  if (collectionId === '__none__') return
  loading.value = true
  failure.value = ''
  try {
    const page = CollectionRecordPageSchema.strip().parse(
      await $fetch(`${endpoint.value}/${encodeURIComponent(collectionId)}/records`, {
        query: {
          includeArchived: String(includeArchived.value),
          ...(append && recordCursor.value ? { after: recordCursor.value } : {})
        }
      })
    )
    if (epoch !== requestEpoch || collectionId !== selectedCollection.value) return
    records.value = append ? [...records.value, ...page.items] : page.items
    recordCursor.value = page.nextCursor
    if (selectedRecord.value === '__none__' && records.value[0])
      await selectRecord(records.value[0].record.id)
  } catch (error) {
    failure.value = message(error)
  } finally {
    loading.value = false
  }
}
async function selectRecord(id: string) {
  if (!definition.value) return
  if (id === '__none__') {
    selectedRecord.value = id
    return
  }
  selectedRecord.value = id
  history.value = null
  historyRevision.value = 1
  const key = draftKey(definition.value.id, id)
  if (drafts.has(key)) return
  const next = usePageStudioCollectionDraft(definition.value, id),
    saved = records.value.find(item => item.record.id === id)
  if (saved) next.load(saved)
  drafts.set(key, next)
}
async function addRecord() {
  if (!definition.value) return
  const id = `entry_${crypto.randomUUID().replaceAll('-', '')}`
  await selectRecord(id)
}
async function saveRecord() {
  const selected = draft.value
  if (!selected || !canEdit.value) return
  const url = recordUrl(),
    collectionId = selectedCollection.value
  try {
    await selected.save(body => $fetch(url, { method: 'PUT', body }))
    toast.add({ title: 'Entry saved', color: 'success' })
    if (collectionId === selectedCollection.value) await loadRecords()
  } catch (error) {
    failure.value = selected.conflicted.value
      ? 'There is a newer entry or schema. Your edits are preserved; copy anything you need before reloading.'
      : message(error)
  }
}
async function reloadRecord() {
  const selected = draft.value
  const key = draftKey(selectedCollection.value, selectedRecord.value)
  if (!selected || selected.saving.value) return
  if (
    selected.dirty.value
    && !(await confirm('Reload saved entry?', 'Your unsaved changes to this entry will be replaced.'))
  )
    return
  try {
    const saved = await $fetch(recordUrl())
    if (key !== draftKey(selectedCollection.value, selectedRecord.value)) return
    if (saved) {
      await refresh()
      const active = definitions.value.find(item => item.id === selectedCollection.value)
      if (active) selected.updateDefinition(active)
      selected.load(saved, true)
    } else failure.value = 'This entry has not been saved yet.'
  } catch (error) {
    failure.value = message(error)
  }
}
async function discardNew() {
  if (
    !draft.value
    || draft.value.expectedRevision.value > 0
    || !(await confirm('Discard unsaved entry?', 'This entry has not been saved.'))
  )
    return
  drafts.delete(draftKey(selectedCollection.value, selectedRecord.value))
  selectedRecord.value = '__none__'
}
async function archiveRecord() {
  if (
    !draft.value
    || !(await confirm(
      'Archive this entry?',
      'This saves a new archived revision. Earlier revisions remain available.'
    ))
  )
    return
  draft.value.archived.value = true
  await saveRecord()
}
async function readHistory() {
  const key = draftKey(selectedCollection.value, selectedRecord.value)
  try {
    const saved = CollectionRecordRevisionSchema.parse(
      await $fetch(recordUrl(), { query: { revision: historyRevision.value } })
    )
    if (key === draftKey(selectedCollection.value, selectedRecord.value)) history.value = saved
  } catch (error) {
    failure.value = message(error)
  }
}
function restoreHistory() {
  if (!history.value || !draft.value || draft.value.dirty.value) return
  try {
    draft.value.restore(history.value)
    history.value = null
  } catch {
    failure.value
      = 'This historical revision does not match the current schema. Your current entry is unchanged.'
  }
}
async function showSchema(create: boolean) {
  if (
    schemaDirty.value
    && !(await confirm('Discard schema edits?', 'Unsaved schema fields will be discarded.'))
  )
    return
  schemaNew.value = create
  schemaDirty.value = false
  schemaFailure.value = ''
  schemaOpen.value = true
}
async function closeSchema() {
  if (
    schemaDirty.value
    && !(await confirm('Discard schema edits?', 'Unsaved schema fields will be discarded.'))
  )
    return
  schemaOpen.value = false
  schemaDirty.value = false
}
async function saveSchema(input: unknown) {
  if (!canManageSchema.value) return
  const body = input as { definition: { id: string } },
    epoch = requestEpoch
  schemaSaving.value = true
  schemaFailure.value = ''
  try {
    const saved = CollectionDefinitionRevisionSchema.parse(
      await $fetch(`${endpoint.value}/${encodeURIComponent(body.definition.id)}`, { method: 'PUT', body })
    )
    if (epoch !== requestEpoch) return
    schemaDirty.value = false
    schemaOpen.value = false
    await refresh()
    selectedCollection.value = saved.definition.id
    toast.add({ title: 'Collection schema saved', color: 'success' })
  } catch (error) {
    schemaFailure.value = message(error)
  } finally {
    schemaSaving.value = false
  }
}
async function moreDefinitions() {
  try {
    const raw = await $fetch(endpoint.value, { query: { after: definitionCursor.value } })
    const page = CollectionDefinitionPageSchema.strip().parse(raw)
    definitions.value.push(...page.items.map(item => item.definition))
    definitionCursor.value = page.nextCursor
  } catch (error) {
    failure.value = message(error)
  }
}
async function setup() {
  if (!setupState.value?.canConfigure) return
  setupBusy.value = true
  setupFailure.value = ''
  try {
    let requestId = setupState.value.requestId ?? localStorage.getItem(setupKey.value)
    if (!requestId) {
      requestId = crypto.randomUUID()
      localStorage.setItem(setupKey.value, requestId)
    }
    const result = await $fetch<{ status: string }>(`${endpoint.value}/setup`, {
      method: 'POST',
      body: { requestId }
    })
    setupState.value = { ...setupState.value, status: result.status }
    await refresh()
  } catch (error) {
    setupFailure.value = message(error)
  } finally {
    setupBusy.value = false
  }
}
// An immediate selection watcher must run after this component's state is ready.
onMounted(() => {
  if (selectedCollection.value !== '__none__') void loadRecords()
})
</script>

<template>
  <section class="space-y-5 border-t border-default pt-8" aria-labelledby="custom-collections-heading">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="custom-collections-heading" class="text-xl font-semibold text-highlighted">
          Custom collections
        </h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Structured entries with fields defined for your website. Each save keeps its own revision.
        </p>
      </div>
      <UButton
        v-if="canManageSchema"
        label="New collection"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :disabled="saving"
        @click="showSchema(true)"
      />
    </div>
    <UAlert
      v-if="error"
      :title="setupPending ? 'Custom collection setup is pending' : 'Custom collections are unavailable'"
      color="warning"
      :description="
        setupPending
          ? 'An eligible website manager can request setup. Your existing business content stays available.'
          : 'Check your website access and package, then reload.'
      "
    />
    <div v-if="setupPending && setupState?.canConfigure" class="flex flex-wrap items-center gap-3">
      <UButton
        :label="setupState.status === 'running' ? 'Check setup again' : 'Set up custom collections'"
        :loading="setupBusy"
        @click="setup"
      />
      <p class="text-sm text-muted">
        Setup requires a configured and reviewed website runtime.
      </p>
    </div>
    <UAlert
      v-if="setupFailure"
      title="Setup has not completed"
      color="warning"
      :description="setupFailure"
    />
    <UAlert
      v-if="failure"
      title="Entry needs attention"
      color="warning"
      :description="failure"
    />
    <USkeleton v-if="pending && !data" class="h-48 w-full" />
    <template v-else-if="data && !error">
      <p v-if="!canEdit" class="text-sm text-muted">
        You have read-only access to these collections.
      </p>
      <div v-if="schemaOpen" class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-lg font-medium">
            {{ schemaNew ? 'New collection' : 'Collection schema' }}
          </h3>
          <UButton
            label="Close schema editor"
            variant="ghost"
            color="neutral"
            :disabled="schemaSaving"
            @click="closeSchema"
          />
        </div>
        <UAlert
          v-if="schemaFailure"
          title="Schema could not be saved"
          :description="schemaFailure"
          color="warning"
        /><PageStudioCollectionSchemaEditor
          :key="schemaNew ? 'new' : selectedCollection"
          :definition="schemaNew ? undefined : definition"
          :saving="schemaSaving"
          @dirty="schemaDirty = $event"
          @save="saveSchema"
        />
      </div>
      <div v-else class="grid min-w-0 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="Custom collections" class="space-y-1">
          <UButton
            v-for="item in definitions"
            :key="item.id"
            :label="item.label"
            :variant="selectedCollection === item.id ? 'soft' : 'ghost'"
            :color="selectedCollection === item.id ? 'primary' : 'neutral'"
            class="w-full justify-start"
            @click="() => { selectedCollection = item.id }"
          /><UButton
            v-if="definitionCursor"
            label="More collections"
            variant="ghost"
            color="neutral"
            @click="moreDefinitions"
          />
          <p v-if="!definitions.length" class="text-sm text-muted">
            No custom collections yet.
          </p>
        </nav>
        <div v-if="definition" class="min-w-0 space-y-5 @container">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-lg font-medium text-highlighted">
              {{ definition.label }}
            </h3>
            <div class="flex gap-2">
              <UBadge color="neutral" variant="subtle">
                Schema {{ definition.version }}
              </UBadge><UButton
                v-if="canManageSchema"
                label="Edit schema"
                size="sm"
                variant="ghost"
                color="neutral"
                @click="showSchema(false)"
              />
            </div>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <UFormField
              label="Entry"
              class="min-w-0 flex-1 basis-48"
            >
              <USelectMenu
                :model-value="selectedRecord"
                :items="recordOptions"
                aria-label="Entry"
                value-key="value"
                class="w-full"
                @update:model-value="selectRecord(String($event))"
              />
            </UFormField><UButton
              label="New entry"
              color="neutral"
              variant="outline"
              :disabled="!canEdit || loading"
              @click="addRecord"
            /><UCheckbox v-model="includeArchived" label="Include archived" />
          </div>
          <UButton
            v-if="recordCursor"
            label="Load more entries"
            variant="ghost"
            color="neutral"
            :loading="loading"
            @click="loadRecords(true)"
          />
          <template v-if="draft">
            <UAlert
              v-if="draft.conflicted.value"
              title="A newer revision is available"
              description="Your edits are preserved. Copy anything you need before reloading the saved entry."
              color="warning"
            />
            <div class="flex flex-wrap items-center gap-3">
              <UBadge :color="draft.dirty.value ? 'warning' : 'neutral'" variant="subtle">
                {{
                  draft.dirty.value ? 'Unsaved changes' : `Saved revision ${draft.expectedRevision.value}`
                }}
              </UBadge><UBadge v-if="draft.archived.value" color="neutral">
                Archived
              </UBadge>
            </div>
            <PageStudioGeneratedCollectionFields
              v-model="values"
              :fields="definition.fields"
              :errors="draft.validationErrors.value"
              :disabled="!canEdit || draft.saving.value"
            />
            <div class="flex flex-wrap items-center gap-3">
              <UButton
                label="Save entry"
                :loading="draft.saving.value"
                :disabled="!canEdit || !draft.dirty.value || draft.conflicted.value"
                @click="saveRecord"
              /><UButton
                label="Reload saved entry"
                variant="outline"
                color="neutral"
                :disabled="draft.saving.value || draft.expectedRevision.value === 0"
                @click="reloadRecord"
              /><UButton
                v-if="draft.expectedRevision.value === 0"
                label="Discard unsaved entry"
                variant="ghost"
                color="neutral"
                @click="discardNew"
              /><UButton
                label="Archive entry"
                variant="ghost"
                color="error"
                :disabled="
                  !canEdit || draft.saving.value || draft.archived.value || draft.expectedRevision.value === 0
                "
                @click="archiveRecord"
              />
            </div>
            <div v-if="draft.expectedRevision.value > 0" class="space-y-3 border-t border-default pt-5">
              <h4 class="font-medium text-highlighted">
                Revision history
              </h4>
              <div class="flex flex-wrap items-end gap-3">
                <UFormField label="Revision number">
                  <UInput
                    v-model.number="historyRevision"
                    type="number"
                    :min="1"
                    :max="draft.expectedRevision.value"
                    class="w-full"
                  />
                </UFormField><UButton
                  label="Read revision"
                  color="neutral"
                  variant="outline"
                  @click="readHistory"
                />
              </div>
              <div v-if="history" class="space-y-3">
                <p class="text-sm text-muted">
                  Revision {{ history.record.revision }} saved {{ history.createdAt }}
                </p>
                <dl class="grid gap-2 text-sm">
                  <template
                    v-for="(value, key) in history.record.values"
                    :key="key"
                  >
                    <dt class="font-medium">
                      {{ definition.fields.find((field) => field.id === key)?.label ?? key }}
                    </dt>
                    <dd class="whitespace-pre-wrap break-words text-muted">
                      {{ value }}
                    </dd>
                  </template>
                </dl>
                <UButton
                  label="Restore into draft"
                  :disabled="!canEdit || draft.dirty.value || draft.saving.value"
                  @click="restoreHistory"
                />
                <p class="text-sm text-muted">
                  Restoring uses the current schema and saves as a new revision. Save or reload current edits
                  first.
                </p>
              </div>
            </div>
          </template>
          <p v-else class="py-5 text-sm text-muted">
            Choose an entry or create your first one.
          </p>
        </div>
      </div>
    </template>
    <UModal
      v-model:open="confirmOpen"
      :title="confirmTitle"
      :description="confirmDescription"
    >
      <template #footer>
        <UButton
          label="Keep editing"
          color="neutral"
          variant="outline"
          @click="decide(false)"
        /><UButton
          label="Continue"
          @click="decide(true)"
        />
      </template>
    </UModal>
  </section>
</template>
