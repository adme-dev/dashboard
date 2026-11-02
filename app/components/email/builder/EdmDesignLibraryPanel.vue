<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { useEdmDesignRoundtrip } from '~~/app/composables/useEdmDesignRoundtrip'
import { useEdmCustomModules } from '~~/app/composables/useEdmCustomModules'
import { moduleLocalOverrides, subtreeIds, stableDesignJson, type ModuleRecord } from '~~/shared/emailRendering/designModules'
import type { EdmImageAsset } from '~~/app/utils/edmImageAssets'
import type { ReviewedTemplatePublication } from '~~/app/utils/edmTemplatePublication'
import type { DesignHistoryPreview } from '~~/shared/emailRendering/designHistory'
import type { EdmFlyhubDocument } from '~~/app/types/edm'

const props = defineProps<{
  flow: ReturnType<typeof useEdmDesignRoundtrip>
  blocked: boolean
  saved: boolean
  selectedId: string | null
  selectedRoots?: string[]
  insertionTarget?: { parentId: string, columnIndex?: number, index: number } | null
  initialSection?: 'library' | 'images' | 'section' | 'template'
}>()
type ModuleCommand = Parameters<typeof props.flow.library>[0]
const emit = defineEmits<{
  module: [command: ModuleCommand]
  publishTemplate: [review: ReviewedTemplatePublication]
  reconcileTemplate: []
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
const selectionOnly = ref(props.initialSection !== 'template')
const reviewedPaths = ref<string[]>([])
const overrides = ref<'preserve' | 'discard'>('preserve')
const instanceReviewed = ref(false)
const imageOpen = ref(false)
const image = ref<EdmImageAsset | null>(null)
interface TemplateTarget {
  id: string
  name: string
  client_id: string | null
  template_kind: string
  revision_schema_version: number | null
  design_document_id: string | null
  head_revision_id: string | null
}
const templateMode = ref<'new' | 'revise'>('new')
const templateTargets = ref<TemplateTarget[]>([])
const templateTargetId = ref('__none__')
const templateTarget = ref<TemplateTarget | null>(null)
const templateCatalogLoading = ref(false)
const templateReviewLoading = ref(false)
const templateReviewError = ref('')
const templateConfirmed = ref(false)
const templateReview = ref<(ReviewedTemplatePublication & { previewHtml: string, destinationName: string }) | null>(null)
let submittedTemplateReview: {
  review: NonNullable<typeof templateReview.value>
  previousReceipt: typeof props.flow.lastLibraryReceipt.value
  targetDocumentId: string | null
} | null = null
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
    && !templateCatalogLoading.value
    && !templateReviewLoading.value
    && !error.value
)
const roots = computed(() => props.selectedRoots ?? (props.selectedId ? [props.selectedId] : []))
const insertion = computed(() => props.insertionTarget === undefined && draft.value
  ? { parentId: 'root', index: draft.value.source.blocks.root?.data.childrenIds?.length ?? 0 }
  : props.insertionTarget)
const selectedImage = computed(() => props.selectedId && draft.value?.source.blocks[props.selectedId]?.type === 'Image' ? props.selectedId : null)
const validSelection = computed(() => {
  if (!draft.value || !roots.value.length || roots.value.includes('root')) return false
  try {
    subtreeIds(draft.value.source, roots.value)
    return true
  } catch { return false }
})
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
  if (!selectionOnly.value || !draft.value || (props.selectedRoots === undefined && !props.selectedId)) return localPaths.value
  if (!validSelection.value) return []
  const ids = subtreeIds(draft.value.source, roots.value)
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
const canonicalId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const eligibleTemplateTargets = computed(() => templateTargets.value.filter(target =>
  target.template_kind === 'template' && target.revision_schema_version === 1
  && [target.id, target.design_document_id, target.head_revision_id].every(id => typeof id === 'string' && canonicalId.test(id))
  && typeof target.name === 'string' && !!target.name.trim()
  && target.client_id === draft.value?.source.scope.clientId
))
const templateTargetOptions = computed(() => [
  { label: 'Choose an existing template', value: '__none__' },
  ...eligibleTemplateTargets.value.map(target => ({ label: target.name, value: target.id }))
])
const templateCanReview = computed(() => ready.value && props.flow.libraryAuthoring.value.publisher
  && draft.value?.projection.state === 'current' && !!name.value.trim()
  && localPaths.value.every(path => reviewedPaths.value.includes(path))
  && (templateMode.value === 'new' || (templateTarget.value?.client_id === draft.value.source.scope.clientId
    && eligibleTemplateTargets.value.some(target => target.id === templateTarget.value?.id))))
function clearTemplateReview() {
  if (props.flow.hasPending.value) return
  templateReview.value = null
  templateConfirmed.value = false
  templateReviewError.value = ''
}
async function loadTemplateTargets() {
  if (props.flow.busy.value || props.flow.hasPending.value || !props.flow.libraryAuthoring.value.publisher) return
  templateCatalogLoading.value = true
  templateReviewError.value = ''
  try {
    const result = await $fetch<{ items: TemplateTarget[] }>('/api/email/templates')
    templateTargets.value = result.items
    // The chosen target remains a copy of the displayed revision. Refreshing
    // the catalog never substitutes a newer head into an existing review.
  } catch {
    templateReviewError.value = 'Template choices could not load. Reload choices to check your current access.'
  } finally {
    templateCatalogLoading.value = false
  }
}
async function reviewTemplate() {
  if (!templateCanReview.value || !draft.value) return
  const current = draft.value
  const sourceSnapshot = JSON.stringify(current)
  const metadata = { draftId: current.documentId, expectedRevisionId: current.headRevisionId,
    name: name.value.trim(), category: category.value.trim() || null, includedOverridePaths: [...localPaths.value] }
  const target = templateTarget.value
  const request: ReviewedTemplatePublication['request'] = templateMode.value === 'revise' && target
    ? { ...metadata, command: 'revise-template', templateId: target.id, expectedTemplateRevisionId: target.head_revision_id! }
    : { ...metadata, command: 'publish-template' }
  const selection = JSON.stringify({ mode: templateMode.value, target: templateTarget.value, name: name.value, category: category.value, paths: localPaths.value })
  templateReview.value = null
  templateConfirmed.value = false
  templateReviewLoading.value = true
  templateReviewError.value = ''
  try {
    const preview = await $fetch<DesignHistoryPreview>('/api/email/design/history', { method: 'POST', body: {
      version: 1, command: 'preview-revision', draftId: current.documentId, expectedRevisionId: current.headRevisionId, revisionId: current.headRevisionId
    } })
    if (!props.saved || props.blocked || !props.flow.libraryAuthoring.value.publisher
      || JSON.stringify(draft.value) !== sourceSnapshot
      || JSON.stringify({ mode: templateMode.value, target: templateTarget.value, name: name.value, category: category.value, paths: localPaths.value }) !== selection)
      throw new Error('The source or selection changed. Review the saved version again before publishing.')
    if (preview.draftId !== current.documentId || preview.revisionId !== current.headRevisionId || preview.expectedRevisionId !== current.headRevisionId
      || !preview.previewHtml || !preview.design || stableDesignJson(preview.design) !== stableDesignJson(current.source))
      throw new Error('The exact saved preview is unavailable. Reload the saved draft before publishing.')
    templateReview.value = { request, sourceSnapshot, previewHtml: preview.previewHtml,
      destinationName: request.command === 'revise-template' ? target!.name : request.name }
  } catch (cause) {
    templateReviewError.value = cause instanceof Error ? cause.message : 'The saved preview could not load. Review it again before publishing.'
  } finally {
    templateReviewLoading.value = false
  }
}
function publishTemplate() {
  const review = templateReview.value
  if (!review || !templateConfirmed.value || !templateCanReview.value || JSON.stringify(draft.value) !== review.sourceSnapshot) return
  const previousReceipt = props.flow.lastLibraryReceipt.value
  const targetDocumentId = templateTarget.value?.design_document_id ?? null
  emit('publishTemplate', { request: JSON.parse(JSON.stringify(review.request)), sourceSnapshot: review.sourceSnapshot })
  // The existing builder/flow starts its serialized pending write synchronously.
  // A refused adapter call must not arm consumption of another surface's receipt.
  if (props.flow.busy.value && props.flow.hasPending.value)
    submittedTemplateReview = { review, previousReceipt, targetDocumentId }
}
watch(
  () => [props.flow.busy.value, props.flow.hasPending.value, props.flow.lastLibraryReceipt.value] as const,
  ([busy, pending, receipt]) => {
    const submitted = submittedTemplateReview
    if (!submitted || busy || pending) return
    submittedTemplateReview = null
    const request = submitted.review.request
    // lastLibraryReceipt is set only after the existing immutable readback.
    // Keep unknown outcomes; close only this panel's completed template intent.
    if (!receipt?.published || !receipt.templateId || receipt.moduleId || receipt === submitted.previousReceipt
      || !canonicalId.test(receipt.documentId) || !canonicalId.test(receipt.revisionId)
      || receipt.documentId === request.draftId) return
    if (request.command === 'revise-template' && (receipt.templateId !== request.templateId
      || receipt.documentId !== submitted.targetDocumentId || receipt.revisionId === request.expectedTemplateRevisionId)) return
    if (templateReview.value === submitted.review) {
      templateReview.value = null
      templateConfirmed.value = false
      templateReviewError.value = ''
    }
    if (request.command === 'revise-template' && templateTarget.value?.id === request.templateId
      && templateTarget.value.head_revision_id === request.expectedTemplateRevisionId) {
      templateTargetId.value = '__none__'
      templateTarget.value = null
    }
  }
)
watch(templateMode, (mode) => {
  clearTemplateReview()
  if (mode === 'revise') void loadTemplateTargets()
})
watch(templateTargetId, (id) => {
  if (props.flow.hasPending.value) return
  const target = eligibleTemplateTargets.value.find(target => target.id === id)
  templateTarget.value = target ? { ...target } : null
  clearTemplateReview()
})
watch(() => [name.value, category.value, JSON.stringify(draft.value), props.saved, props.blocked, localPaths.value.join('|')], clearTemplateReview)
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
    || (props.selectedRoots !== undefined && selectionOnly.value && !validSelection.value)
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
    ...(selectionOnly.value && roots.value.length ? { rootBlockIds: roots.value } : {})
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
  if (!ready.value || !selection.value || !draft.value || !insertion.value) return
  emit('module', {
    command: 'insert-module',
    moduleId: selection.value.moduleId,
    revisionId: selection.value.revisionId,
    ...insertion.value
  })
}
function insertImage() {
  if (ready.value && image.value?.emailPublication && insertion.value)
    emit('module', { command: 'insert-published-image', assetId: image.value.id, ...insertion.value })
}
function replaceImage() {
  if (ready.value && image.value?.emailPublication && selectedImage.value)
    emit('module', { command: 'replace-published-image', assetId: image.value.id, blockId: selectedImage.value })
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
      <section v-if="!initialSection || initialSection === 'library'" class="space-y-4" aria-label="Published modules">
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
          :disabled="!ready || !selection || !insertion"
          @click="insert"
        />
      </section>
      <section
        v-if="selectedInstance && (!initialSection || initialSection === 'library')"
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
        v-if="flow.libraryAuthoring.value.publisher && initialSection !== 'images'"
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
          :disabled="!ready || (selectedRoots !== undefined ? !validSelection : !selectedId)"
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
        <UFormField label="Template publication">
          <USelect
            v-model="templateMode"
            :items="[{ label: 'New template', value: 'new' }, { label: 'New version of existing template', value: 'revise' }]"
            class="w-full"
            :disabled="!ready"
          />
        </UFormField>
        <div v-if="templateMode === 'revise'" class="space-y-3">
          <UFormField label="Existing template" help="Only published canonical templates in the same saved client or shared scope can be revised.">
            <USelect
              v-model="templateTargetId"
              :items="templateTargetOptions"
              class="w-full"
              :disabled="!ready"
            />
          </UFormField>
          <p v-if="templateTarget" class="break-all text-xs text-muted">
            {{ templateTarget.name }} — selected version {{ templateTarget.head_revision_id }}
          </p>
          <p v-if="templateTarget && eligibleTemplateTargets.some(target => target.id === templateTarget.id && target.head_revision_id !== templateTarget.head_revision_id)" class="text-sm text-muted">
            A newer version is listed. Clear this template choice and choose it again to review that version. This review keeps the displayed version.
          </p>
          <p v-if="!templateCatalogLoading && !eligibleTemplateTargets.length" class="text-sm text-muted">
            No eligible published template is available in this saved scope.
          </p>
          <UButton
            label="Reload template choices"
            color="neutral"
            variant="ghost"
            :disabled="!ready"
            @click="loadTemplateTargets"
          />
        </div>
        <UAlert v-if="templateReviewError" color="warning" :title="templateReviewError" />
        <UAlert v-if="flow.error.value" color="warning" :title="flow.error.value" />
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Publish module"
            :disabled="
              !ready || (selectedRoots !== undefined && selectionOnly && !validSelection) || !name.trim() || !category.trim() || publicationPaths.some((p) => !reviewedPaths.includes(p))
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
            label="Review full template"
            color="neutral"
            variant="outline"
            :loading="templateReviewLoading"
            :disabled="!templateCanReview"
            @click="reviewTemplate"
          />
        </div>
        <section v-if="templateReview" class="space-y-4 border-t border-default pt-4" aria-label="Template publication review">
          <h4 class="font-semibold">
            {{ templateReview.request.command === 'revise-template' ? 'Publish a new version' : 'Publish a new template' }}
          </h4>
          <p class="text-sm">
            Destination: {{ templateReview.destinationName }}
          </p>
          <p v-if="templateReview.request.command === 'revise-template'" class="break-all text-xs text-muted">
            Template {{ templateReview.request.templateId }} — reviewed current version {{ templateReview.request.expectedTemplateRevisionId }}
          </p>
          <p class="break-all text-xs text-muted">
            Saved source version {{ templateReview.request.expectedRevisionId }}
          </p>
          <p class="text-sm text-muted">
            Publish as {{ templateReview.request.name }}. This publishes the saved design to the library and leaves the source campaign or draft unchanged.
          </p>
          <iframe
            :srcdoc="templateReview.previewHtml"
            sandbox=""
            referrerpolicy="no-referrer"
            title="Compiled saved template publication preview"
            class="h-[420px] w-full rounded border border-default bg-white"
          />
          <p v-for="path in templateReview.request.includedOverridePaths" :key="path" class="break-all text-xs text-muted">
            Included override: {{ path }}
          </p>
          <UCheckbox v-model="templateConfirmed" label="I reviewed this compiled preview and the included local overrides" :disabled="!ready" />
          <div class="flex flex-wrap gap-2">
            <UButton :label="templateReview.request.command === 'revise-template' ? 'Publish new version' : 'Publish full template'" :disabled="!templateCanReview || !templateConfirmed" @click="publishTemplate" />
            <UButton
              label="Cancel template review"
              color="neutral"
              variant="ghost"
              :disabled="!ready"
              @click="clearTemplateReview"
            />
          </div>
          <UAlert
            v-if="flow.hasPending.value"
            color="warning"
            title="Publication result unconfirmed"
            description="Keep the reviewed versions until the original action is reconciled."
          />
          <UButton
            v-if="flow.hasPending.value"
            label="Reconcile original publication"
            :disabled="flow.busy.value"
            @click="emit('reconcileTemplate')"
          />
        </section>
      </section>
      <section v-if="!initialSection || initialSection === 'library' || initialSection === 'images'" class="space-y-4 border-t border-default pt-5" aria-label="Registered images">
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
            :disabled="!ready || !image.emailPublication || !insertion"
            @click="insertImage"
          />
          <UButton
            v-if="selectedImage"
            label="Replace selected image"
            :disabled="!ready || !image.emailPublication"
            @click="replaceImage"
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
