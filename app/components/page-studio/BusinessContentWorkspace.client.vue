<script setup lang="ts">
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import type { PageStudioContentState } from '~~/shared/pageStudio/businessContent'

const props = defineProps<{ audience: 'agency' | 'portal', siteId: string }>()
const endpoint = computed(() => `/api/${props.audience}/page-studio/sites/${encodeURIComponent(props.siteId)}/content`)
const { data, pending, error, refresh } = await useFetch<PageStudioContentState & { canEdit: boolean }>(endpoint)
const { collections, conflicted, dirty, load, revision, save, saving } = usePageStudioContentDraft()
const toast = useToast()
const selectedCollection = ref('__none__')
const selectedRecord = ref('__none__')
const reloadOpen = ref(false)
const removeOpen = ref(false)
const leaveOpen = ref(false)
let leaveDecision: ((leave: boolean) => void) | null = null
const collectionOpen = ref(false)
const collectionName = ref('')
const loadError = ref('')
const canEdit = computed(() => data.value?.canEdit === true)
const collection = computed(() => collections.value.find(item => item.id === selectedCollection.value))
const record = computed(() => collection.value?.records.find(item => item.id === selectedRecord.value))
const records = computed(() => collection.value?.records.map(item => ({ label: item.title || 'Untitled entry', value: item.id })) ?? [])
const statuses = [{ label: 'Needs review', value: 'draft' }, { label: 'Verified', value: 'verified' }]
const labels: Record<string, string> = { profile: 'Business details', fleet: 'Fleet', services: 'Services', areas: 'Service areas', testimonials: 'Testimonials' }
const label = (id: string) => labels[id] ?? id.replaceAll('_', ' ').replace(/^./, character => character.toUpperCase())

watch(data, (value) => {
  if (!value) return
  try {
    const { canEdit: _permission, ...state } = value
    load(state)
    loadError.value = ''
  } catch { loadError.value = 'The saved content could not be loaded. Try again.' }
}, { immediate: true })
watch(() => collections.value.map(item => item.id), (ids) => {
  if (!ids.includes(selectedCollection.value)) selectedCollection.value = ids[0] ?? '__none__'
}, { immediate: true })
watch(records, (items) => {
  if (!items.some(item => item.value === selectedRecord.value)) selectedRecord.value = items[0]?.value ?? '__none__'
}, { immediate: true })

function completeNavigation(leave: boolean) {
  const resolve = leaveDecision
  leaveDecision = null
  leaveOpen.value = false
  resolve?.(leave)
}
function guardNavigation() {
  if (saving.value) return false
  if (!dirty.value) return true
  leaveDecision?.(false)
  return new Promise<boolean>((resolve) => {
    leaveDecision = resolve
    leaveOpen.value = true
  })
}
onBeforeRouteLeave(guardNavigation)
onBeforeRouteUpdate(guardNavigation)
watch(leaveOpen, (open) => {
  if (!open && leaveDecision) completeNavigation(false)
})
onUnmounted(() => completeNavigation(false))

async function saveChanges() {
  try {
    await save(body => $fetch(endpoint.value, { method: 'PUT', body }))
    toast.add({ title: 'Content saved', description: 'Your changes have been saved to the draft.', color: 'success' })
  } catch (failure) {
    const response = failure as { data?: { error?: { message?: string }, statusMessage?: string } }
    toast.add({ title: 'Content could not be saved', description: conflicted.value
      ? 'Another session saved changes. Your edits are still here; copy anything you need before reloading.'
      : response.data?.error?.message ?? response.data?.statusMessage ?? 'Check the required fields and try again.', color: 'error' })
  }
}
function requestReload() {
  if (dirty.value) reloadOpen.value = true
  else return reloadContent()
}
async function reloadContent() {
  await refresh()
  if (!error.value && data.value) {
    try {
      const { canEdit: _permission, ...state } = data.value
      load(state, true)
      loadError.value = ''
      reloadOpen.value = false
    } catch { loadError.value = 'The saved content could not be loaded.' }
  }
}
function addCollection() {
  const id = collectionName.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100)
  if (!id || collections.value.some(item => item.id === id) || collections.value.length >= 20) {
    toast.add({ title: 'Choose a different collection name', description: 'Use a unique name containing letters or numbers. A website can have up to 20 collections.', color: 'error' })
    return
  }
  collections.value.push({ id, records: [] })
  selectedCollection.value = id
  collectionName.value = ''
  collectionOpen.value = false
}
function addRecord() {
  if (!collection.value || collection.value.records.length >= 200) return
  const id = `record_${crypto.randomUUID()}`
  collection.value.records.push({ id, title: 'New entry', summary: '', status: 'draft', attributes: {} })
  selectedRecord.value = id
}
function removeRecord() {
  if (collection.value) collection.value.records = collection.value.records.filter(item => item.id !== selectedRecord.value)
  removeOpen.value = false
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div class="max-w-2xl">
        <h1 class="text-2xl font-semibold text-highlighted">
          Business content
        </h1>
        <p class="mt-2 text-sm leading-6 text-muted">
          Manage the names, descriptions and reviewed information used across your website.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UBadge :color="dirty ? 'warning' : 'neutral'" variant="subtle">
          {{ dirty ? 'Unsaved changes' : `Saved revision ${revision}` }}
        </UBadge>
        <UButton
          label="Reload"
          color="neutral"
          variant="outline"
          :disabled="saving || pending"
          @click="requestReload"
        />
        <UButton
          label="Save changes"
          icon="i-lucide-check"
          :loading="saving"
          :disabled="!canEdit || !dirty || conflicted || pending || !!error || !!loadError"
          @click="saveChanges"
        />
      </div>
    </div>
    <UAlert
      v-if="error || loadError"
      color="warning"
      icon="i-lucide-circle-alert"
      title="Content is unavailable"
      :description="error?.statusCode === 503 ? 'Content storage is not connected yet. This screen will become available once website setup is complete.' : loadError || 'We could not load your content. Check your website access and try again.'"
    />
    <UAlert
      v-if="conflicted"
      color="warning"
      title="There is a newer saved version"
      description="Your edits are preserved here. Copy anything you need, then reload the latest version before saving."
    />
    <p v-if="data && !canEdit" class="text-sm text-muted">
      You have read-only access to this content.
    </p>
    <USkeleton v-if="pending && !data" class="h-72 w-full" />
    <div v-else-if="!error && !loadError" class="min-w-0 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav class="space-y-1" aria-label="Content collections">
        <UButton
          v-for="item in collections"
          :key="item.id"
          :label="label(item.id)"
          :variant="item.id === selectedCollection ? 'soft' : 'ghost'"
          :color="item.id === selectedCollection ? 'primary' : 'neutral'"
          class="w-full justify-start"
          @click="() => { selectedCollection = item.id }"
        />
        <UButton
          label="Add collection"
          icon="i-lucide-plus"
          color="neutral"
          variant="ghost"
          class="w-full justify-start"
          :disabled="!canEdit || saving || pending || collections.length >= 20"
          @click="() => { collectionOpen = true }"
        />
      </nav>
      <div class="min-w-0 @container">
        <div v-if="collection" class="space-y-5">
          <div class="flex flex-wrap items-end gap-3">
            <UFormField v-if="records.length" label="Entry" class="min-w-48 flex-1">
              <USelectMenu
                v-model="selectedRecord"
                :items="records"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UButton
              label="Add entry"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :disabled="!canEdit || saving || pending || collection.records.length >= 200"
              @click="addRecord"
            />
          </div>
          <fieldset v-if="record" :disabled="!canEdit || saving || pending" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Name" required>
              <UInput v-model="record.title" :maxlength="120" class="w-full" />
            </UFormField>
            <UFormField label="Review status">
              <USelect v-model="record.status" :items="statuses" class="w-full" />
            </UFormField>
            <UFormField label="Description" class="@lg:col-span-2">
              <UTextarea
                v-model="record.summary"
                :maxlength="4000"
                :rows="7"
                class="w-full"
              />
            </UFormField>
            <div class="flex items-center justify-between gap-4 @lg:col-span-2">
              <p class="text-sm text-muted">
                Saving updates the draft. Publishing is a separate step.
              </p>
              <UButton
                label="Remove entry"
                color="error"
                variant="ghost"
                @click="() => { removeOpen = true }"
              />
            </div>
          </fieldset>
          <p v-else class="py-8 text-sm text-muted">
            Add your first entry to this collection.
          </p>
        </div>
        <div v-else class="py-8">
          <h2 class="text-lg font-medium text-highlighted">
            Start with your business information
          </h2>
          <p class="mt-2 max-w-lg text-sm leading-6 text-muted">
            Add a collection for your services, fleet or testimonials, then create the entries you want to manage.
          </p>
        </div>
      </div>
    </div>
    <UModal v-model:open="leaveOpen" title="Leave without saving?" description="Your unsaved content changes will be discarded.">
      <template #footer>
        <UButton
          label="Keep editing"
          color="neutral"
          variant="outline"
          @click="completeNavigation(false)"
        />
        <UButton label="Discard and leave" color="error" @click="completeNavigation(true)" />
      </template>
    </UModal>
    <UModal v-model:open="reloadOpen" title="Reload saved content?" description="This replaces your unsaved edits with the latest saved version.">
      <template #footer>
        <UButton
          label="Keep editing"
          color="neutral"
          variant="outline"
          @click="() => { reloadOpen = false }"
        /><UButton label="Reload saved content" :loading="pending" @click="reloadContent" />
      </template>
    </UModal>
    <UModal v-model:open="removeOpen" title="Remove this entry?" description="The entry will be removed from this draft when you save your changes.">
      <template #footer>
        <UButton
          label="Keep entry"
          color="neutral"
          variant="outline"
          @click="() => { removeOpen = false }"
        /><UButton label="Remove entry" color="error" @click="removeRecord" />
      </template>
    </UModal>
    <UModal v-model:open="collectionOpen" title="Add collection" description="Group related content, such as services or testimonials.">
      <template #body>
        <UFormField label="Collection name" required>
          <UInput
            v-model="collectionName"
            :maxlength="100"
            class="w-full"
            @keydown.enter="addCollection"
          />
        </UFormField>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          @click="() => { collectionOpen = false }"
        /><UButton label="Add collection" :disabled="!collectionName.trim()" @click="addCollection" />
      </template>
    </UModal>
  </section>
</template>
