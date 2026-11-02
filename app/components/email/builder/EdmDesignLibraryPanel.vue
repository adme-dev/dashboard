<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { useEdmDesignRoundtrip } from '~~/app/composables/useEdmDesignRoundtrip'
import { useEdmCustomModules } from '~~/app/composables/useEdmCustomModules'
import { moduleLocalOverrides, subtreeIds, type ModuleRecord } from '~~/shared/emailRendering/designModules'
import type { EdmImageAsset } from '~~/app/utils/edmImageAssets'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

const props = defineProps<{
  flow: ReturnType<typeof useEdmDesignRoundtrip>
  blocked: boolean
  saved: boolean
  selectedId: string | null
}>()
type ModuleCommand = Parameters<typeof props.flow.library>[0]
const emit = defineEmits<{
  module: [command: ModuleCommand]
  publishTemplate: [metadata: { name: string, category: string | null, includedOverridePaths: string[] }]
  publishImage: [assetId: string]
}>()
const catalog = useEdmCustomModules()
const selectedModuleId = ref('__none__')
const selection = ref<(ModuleRecord & { previewHtml?: string }) | null>(null)
const records = ref<ModuleRecord[]>([])
const loading = ref(false)
const error = ref('')
const name = ref('')
const category = ref('custom')
const description = ref('')
const selectionOnly = ref(true)
const reviewedPaths = ref<string[]>([])
const overrides = ref<'preserve' | 'discard'>('preserve')
const instanceReviewed = ref(false)
const imageOpen = ref(false)
const image = ref<EdmImageAsset | null>(null)
let generation = 0
const draft = computed(() => (props.flow.draft.value?.state === 'structured' ? props.flow.draft.value : null))
const ready = computed(
  () =>
    !!draft.value
    && props.saved
    && !props.blocked
    && !props.flow.busy.value
    && !props.flow.hasPending.value
    && !loading.value
    && !error.value
)
const canonical = computed(() =>
  catalog.modules.value.filter(
    m =>
      m.revision_schema_version === 1
      && m.head_revision_id
      && (m.client_id === null || m.client_id === draft.value?.source.scope.clientId)
  )
)
const moduleOptions = computed(() => [
  { label: 'Choose a published module', value: '__none__' },
  ...canonical.value.map(m => ({ label: m.name, value: m.id }))
])
const selectedOwner = computed(() => canonical.value.find(m => m.id === selectedModuleId.value))
const selectedInstance = computed(() =>
  draft.value?.source.moduleInstances.find(
    i => props.selectedId !== null && subtreeIds(draft.value!.source, i.rootBlockIds).has(props.selectedId)
  )
)
const localPaths = computed(() => {
  if (!draft.value) return []
  return draft.value.source.moduleInstances.flatMap((instance) => {
    const record = records.value.find(r => r.moduleId === instance.moduleId && r.revisionId === instance.revisionId)
    return record ? Object.keys(moduleLocalOverrides(draft.value!.source, instance.instanceId, record.design)) : []
  })
})
const publicationPaths = computed(() => {
  if (!selectionOnly.value || !props.selectedId || !draft.value) return localPaths.value
  const ids = subtreeIds(draft.value.source, [props.selectedId])
  return localPaths.value.filter(path => ids.has(path.split('.')[0]!))
})
const previewDocument = computed(() =>
  selection.value
    ? ({
        ...selection.value.design.blocks,
        root: { type: 'EmailLayout', data: { childrenIds: selection.value.design.rootChildrenIds } }
      } as EdmFlyhubDocument)
    : null
)
async function refresh() {
  const token = ++generation
  loading.value = true
  error.value = ''
  records.value = []
  reviewedPaths.value = []
  instanceReviewed.value = false
  try {
    await catalog.load(true)
    const source = draft.value?.source
    if (!source) return
    const result = await Promise.all(
      source.dependencies.map(pin =>
        $fetch<ModuleRecord>(`/api/email/design/modules/${pin.moduleId}/${pin.revisionId}`)
      )
    )
    if (token === generation) records.value = result
  } catch {
    if (token === generation) error.value = 'The module library could not load. Retry to check your current access.'
  } finally {
    if (token === generation) loading.value = false
  }
}
async function preview(moduleId: string, revisionId: string) {
  const token = ++generation
  loading.value = true
  selection.value = null
  error.value = ''
  try {
    const result = await $fetch<ModuleRecord & { previewHtml: string }>(
      `/api/email/design/modules/${moduleId}/${revisionId}?preview=1`
    )
    if (token === generation) selection.value = result
  } catch {
    if (token === generation)
      error.value = 'This exact module version is unavailable. Reload the library before continuing.'
  } finally {
    if (token === generation) loading.value = false
  }
}
function publish(revise = false) {
  if (
    !ready.value
    || !props.flow.libraryAuthoring.value.publisher
    || !name.value.trim()
    || !category.value.trim()
    || publicationPaths.value.some(path => !reviewedPaths.value.includes(path))
  )
    return
  const metadata = {
    name: name.value.trim(),
    category: category.value.trim(),
    description: description.value.trim() || null,
    previewTone: 'light' as const,
    includedOverridePaths: [...publicationPaths.value],
    ...(selectionOnly.value && props.selectedId ? { rootBlockIds: [props.selectedId] } : {})
  }
  if (revise && selectedOwner.value)
    emit('module', {
      command: 'revise-module',
      ...metadata,
      moduleId: selectedOwner.value.id,
      expectedModuleRevisionId: selectedOwner.value.head_revision_id!
    })
  else emit('module', { command: 'publish-module', ...metadata })
}
function insert() {
  if (!ready.value || !selection.value || !draft.value) return
  emit('module', {
    command: 'insert-module',
    moduleId: selection.value.moduleId,
    revisionId: selection.value.revisionId,
    parentId: 'root',
    index: draft.value.source.blocks.root?.data.childrenIds?.length ?? 0
  })
}
watch(
  () => props.flow.busy.value,
  async (busy) => {
    if (!busy && image.value) {
      try {
        const result = await $fetch<{ assets: EdmImageAsset[] }>('/api/agency/email/assets')
        image.value = result.assets.find(a => a.id === image.value?.id) ?? null
      } catch {
        error.value = 'Reload the image library to check publication.'
      }
    }
  }
)
watch(selectedModuleId, (id) => {
  const owner = canonical.value.find(m => m.id === id)
  if (owner) void preview(id, owner.head_revision_id!)
  else selection.value = null
})
watch(
  () => draft.value?.headRevisionId,
  () => void refresh(),
  { immediate: true }
)
watch(
  () => publicationPaths.value.join('|'),
  () => {
    reviewedPaths.value = []
  }
)
watch(
  () => [selectedInstance.value?.instanceId, selection.value?.revisionId, overrides.value],
  () => { instanceReviewed.value = false }
)
</script>

<template>
  <div class="@container flex flex-1 min-h-0 flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto space-y-7 p-5">
      <UAlert
        v-if="!saved"
        title="Save local changes first"
        description="Library actions use the saved version. Save your current edits before publishing or inserting."
        color="warning"
      />
      <UAlert
        v-if="error"
        :title="error"
        color="warning"
        :actions="[{ label: 'Reload library', onClick: refresh }]"
      />
      <section class="space-y-4" aria-label="Published modules">
        <h3 class="text-lg font-semibold tracking-tight">
          Published modules
        </h3>
        <UFormField label="Module">
          <USelect
            v-model="selectedModuleId"
            :items="moduleOptions"
            class="w-full"
            :disabled="!ready"
          />
        </UFormField>
        <iframe
          v-if="selection?.previewHtml"
          :srcdoc="selection.previewHtml"
          sandbox=""
          referrerpolicy="no-referrer"
          title="Selected module preview"
          class="h-[420px] w-full rounded border border-default bg-white"
        />
        <EmailBuilderEdmDocumentThumbnail
          v-else-if="previewDocument"
          :document="previewDocument"
          :width="380"
          :max-height="360"
        />
        <p v-if="selection" class="text-xs text-muted">
          Selected version {{ selection.revisionId.slice(0, 8) }}. Inserted instances keep this version until you
          explicitly update them.
        </p>
        <UButton
          label="Insert selected version"
          icon="i-lucide-plus"
          :disabled="!ready || !selection"
          @click="insert"
        />
      </section>
      <section
        v-if="selectedInstance"
        class="space-y-4 border-t border-default pt-5"
        aria-label="Selected linked instance"
      >
        <h3 class="text-lg font-semibold tracking-tight">
          Selected linked instance
        </h3>
        <p class="text-sm text-muted">
          Pinned to {{ selectedInstance.revisionId.slice(0, 8) }}.
        </p>
        <UButton
          label="Preview pinned version"
          variant="outline"
          color="neutral"
          :disabled="!ready"
          @click="preview(selectedInstance.moduleId, selectedInstance.revisionId)"
        />
        <UFormField label="Local changes when updating">
          <USelect
            v-model="overrides"
            :items="[
              { label: 'Preserve local changes', value: 'preserve' },
              { label: 'Discard local changes', value: 'discard' }
            ]"
            class="w-full"
            :disabled="!ready"
          />
        </UFormField>
        <p v-for="path in localPaths" :key="path" class="break-all text-xs text-muted">
          {{ path }}
        </p>
        <UCheckbox
          v-model="instanceReviewed"
          label="I reviewed the selected version and local changes"
          :disabled="!ready"
        />
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Update this instance"
            :disabled="!ready || !instanceReviewed || !selection || selection.moduleId !== selectedInstance.moduleId"
            @click="
              selection
                && emit('module', {
                  command: 'update-module-instance',
                  instanceId: selectedInstance.instanceId,
                  revisionId: selection.revisionId,
                  overrides
                })
            "
          />
          <UButton
            label="Detach this instance"
            variant="outline"
            color="neutral"
            :disabled="!ready || !instanceReviewed"
            @click="emit('module', { command: 'detach-module-instance', instanceId: selectedInstance.instanceId })"
          />
        </div>
      </section>
      <section
        v-if="flow.libraryAuthoring.value.publisher"
        class="space-y-4 border-t border-default pt-5"
        aria-label="Publish from this draft"
      >
        <h3 class="text-lg font-semibold tracking-tight">
          Publish from this draft
        </h3>
        <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Library name">
            <UInput v-model="name" class="w-full" :disabled="!ready" />
          </UFormField>
          <UFormField label="Category">
            <UInput v-model="category" class="w-full" :disabled="!ready" />
          </UFormField>
          <UFormField label="Module description" class="@lg:col-span-2">
            <UTextarea v-model="description" class="w-full" :disabled="!ready" />
          </UFormField>
        </div>
        <UCheckbox
          v-model="selectionOnly"
          label="Use the selected block for module publication"
          :disabled="!ready || !selectedId"
        />
        <div v-if="localPaths.length" class="space-y-2">
          <p class="text-sm font-medium">
            Review local overrides before publication
          </p>
          <UCheckbox
            v-for="path in localPaths"
            :key="path"
            :model-value="reviewedPaths.includes(path)"
            :label="path"
            :disabled="!ready"
            @update:model-value="
              (checked) =>
                (reviewedPaths = checked ? [...reviewedPaths, path] : reviewedPaths.filter((p) => p !== path))
            "
          />
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Publish module"
            :disabled="
              !ready || !name.trim() || !category.trim() || publicationPaths.some((p) => !reviewedPaths.includes(p))
            "
            @click="publish()"
          />
          <UButton
            label="Revise selected module"
            color="neutral"
            variant="outline"
            :disabled="
              !ready
                || !selectedOwner
                || !name.trim()
                || !category.trim()
                || publicationPaths.some((p) => !reviewedPaths.includes(p))
            "
            @click="publish(true)"
          />
          <UButton
            label="Publish full template"
            color="neutral"
            variant="outline"
            :disabled="!ready || !name.trim() || localPaths.some((p) => !reviewedPaths.includes(p))"
            @click="
              emit('publishTemplate', {
                name: name.trim(),
                category: category.trim() || null,
                includedOverridePaths: localPaths
              })
            "
          />
        </div>
      </section>
      <section class="space-y-4 border-t border-default pt-5" aria-label="Registered images">
        <h3 class="text-lg font-semibold tracking-tight">
          Registered images
        </h3>
        <UButton
          label="Choose or upload an image"
          icon="i-lucide-images"
          color="neutral"
          variant="outline"
          :disabled="!ready"
          @click="imageOpen = true"
        />
        <template v-if="image">
          <img :src="image.url" :alt="image.name" class="max-h-48 w-full object-contain">
          <p class="text-sm font-medium">
            {{ image.name }}
          </p>
          <UButton
            v-if="!image.emailPublication && flow.libraryAuthoring.value.publisher"
            label="Publish registered image"
            :disabled="!ready"
            @click="emit('publishImage', image.id)"
          />
          <UButton
            label="Insert published image"
            :disabled="!ready || !image.emailPublication"
            @click="
              draft
                && emit('module', {
                  command: 'insert-published-image',
                  assetId: image.id,
                  parentId: 'root',
                  index: draft.source.blocks.root?.data.childrenIds?.length ?? 0
                })
            "
          />
          <p v-if="!image.emailPublication" class="text-xs text-muted">
            An agency publisher must publish this registered image before it can be inserted.
          </p>
        </template>
      </section>
    </div>
    <EmailBuilderEdmImageLibraryPicker
      v-if="imageOpen"
      v-model:open="imageOpen"
      canonical
      :client-id="draft?.source.scope.clientId"
      @pick="(asset) => (image = asset)"
    />
  </div>
</template>
