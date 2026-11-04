<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { useEdmDesignRoundtrip } from '~~/app/composables/useEdmDesignRoundtrip'
import { sameDesignSource } from '~~/app/utils/edmDesignEquality'
import type { EmailDesignDocument } from '~~/shared/emailRendering/designContract'
import type { DesignLibraryReceipt } from '~~/shared/emailRendering/designTemplates'

const props = defineProps<{
  flow: ReturnType<typeof useEdmDesignRoundtrip>
  templateId: string
  templateName: string
  ready: boolean
  dirty: boolean
  blocked: boolean
}>()
const emit = defineEmits<{ snapshot: [] }>()
const open = ref(false)
const preparing = ref(false)
const waitingSnapshot = ref(false)
const name = ref('')
const category = ref('')
const confirmed = ref(false)
const error = ref('')
const published = ref<DesignLibraryReceipt | null>(null)
const review = ref<{ handoffId: string, documentId: string, revisionId: string, source: EmailDesignDocument, html: string, paths: string[] } | null>(null)
let intent: { templateId: string, handoffId: string, documentId: string, revisionId: string } | null = null
let disposed = false
const locked = computed(() => preparing.value || props.flow.busy.value || props.flow.hasPending.value)
const canOpen = computed(() => props.ready && !props.dirty && !props.blocked && !locked.value && props.flow.templatePublication.value.available)
const canConfirm = computed(() => !!review.value && confirmed.value && !locked.value && !published.value && props.ready && !props.dirty && !props.blocked
  && props.flow.handoff.value?.id === review.value.handoffId && props.flow.handoff.value?.state === 'open'
  && props.flow.templatePublication.value.available && name.value.trim().length > 0 && name.value.trim().length <= 200 && category.value.trim().length <= 120
  && props.flow.draft.value?.state === 'structured' && props.flow.draft.value.documentId === review.value.documentId
  && props.flow.draft.value.headRevisionId === review.value.revisionId && props.flow.draft.value.projectionRevisionId === review.value.revisionId
  && props.flow.draft.value.projection.state === 'current' && sameDesignSource(props.flow.draft.value.source, review.value.source))
watch([name, category], () => { confirmed.value = false })
function beginReview() {
  const draft = props.flow.draft.value
  const handoff = props.flow.handoff.value
  if (!canOpen.value || draft?.state !== 'structured' || !handoff || handoff.state !== 'open'
    || handoff.draftId !== draft.documentId || handoff.baseRevisionId !== draft.headRevisionId || handoff.templateId !== props.templateId) return
  if (!open.value) { name.value = props.templateName; category.value = ''; published.value = null }
  review.value = null
  confirmed.value = false
  error.value = ''
  intent = { templateId: props.templateId, handoffId: handoff.id, documentId: draft.documentId, revisionId: draft.headRevisionId }
  preparing.value = true
  waitingSnapshot.value = true
  open.value = true
  emit('snapshot')
}
function snapshotFailed() {
  if (!waitingSnapshot.value) return
  waitingSnapshot.value = false
  preparing.value = false
  intent = null
  error.value = 'Native edits could not be checked. Return to the draft and save or undo them before publishing.'
}
async function acceptSnapshot(design: EmailDesignDocument, changed: boolean) {
  if (!waitingSnapshot.value || !intent || disposed) return
  waitingSnapshot.value = false
  const selected = intent
  try {
    if (changed) throw new Error('Save or undo native edits before publishing. Nothing was published.')
    const current = await props.flow.lookup(selected.templateId, selected.revisionId)
    if (current?.state !== 'structured' || current.documentId !== selected.documentId || current.projection.state !== 'current'
      || current.projectionRevisionId !== selected.revisionId || current.source.kind !== 'template' || !sameDesignSource(design, current.source)
      || !props.flow.templatePublication.value.available) throw new Error('The saved draft or publishing access changed. Return to the draft before publishing.')
    const saved = await $fetch<{ template: { id: string, template_kind: string, client_id: string | null, email_design_revision_id: string, subject: string | null, preview_text: string | null } }>(`/api/email/templates/${selected.templateId}`)
    if (saved.template.id !== selected.templateId || saved.template.template_kind !== 'draft' || saved.template.client_id !== current.source.scope.clientId
      || saved.template.email_design_revision_id !== selected.revisionId) throw new Error('The saved email details changed. Review the current draft again.')
    const preview = await $fetch<{ html: string }>('/api/email/templates/render', { method: 'POST', body: {
      body_source: current.source.blocks, subject: saved.template.subject, preview_text: saved.template.preview_text
    } })
    if (disposed || !open.value || intent !== selected || props.templateId !== selected.templateId) return
    if (!preview.html || props.dirty || !props.ready || props.blocked || props.flow.hasPending.value
      || props.flow.handoff.value?.id !== selected.handoffId || props.flow.handoff.value?.state !== 'open'
      || props.flow.draft.value?.headRevisionId !== selected.revisionId || !props.flow.templatePublication.value.available)
      throw new Error('The draft changed during review. Review the saved draft again.')
    review.value = { handoffId: selected.handoffId, documentId: current.documentId, revisionId: current.headRevisionId, source: JSON.parse(JSON.stringify(current.source)), html: preview.html,
      paths: [...props.flow.templatePublication.value.includedOverridePaths] }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The saved preview could not be confirmed. Nothing was published.'
  } finally {
    if (intent === selected) { preparing.value = false; intent = null }
  }
}
function close() {
  if (locked.value) return
  open.value = false
  intent = null
  review.value = null
}
async function publish() {
  if (!canConfirm.value || !review.value) return
  const selected = review.value
  error.value = ''
  try {
    await props.flow.run(async () => {
      published.value = await props.flow.template({ command: 'publish-template', draftId: selected.documentId,
        expectedRevisionId: selected.revisionId, name: name.value.trim(), category: category.value.trim() || null, includedOverridePaths: [...selected.paths] })
    })
  } catch {
    error.value = props.flow.error.value
    if (!props.flow.hasPending.value) { review.value = null; confirmed.value = false }
  }
}
async function reconcile() {
  if (props.flow.busy.value || !props.flow.hasPending.value) return
  try {
    await props.flow.run(async () => {
      await props.flow.reconcile()
      const receipt = props.flow.lastLibraryReceipt.value
      if (!receipt?.published || !receipt.templateId || receipt.templateId === props.templateId) throw new Error('The publication receipt is incomplete.')
      published.value = receipt
      error.value = ''
    })
  } catch { error.value = props.flow.error.value }
}
onBeforeUnmount(() => { disposed = true; intent = null })
defineExpose({ active: open, locked, acceptSnapshot, snapshotFailed })
</script>

<template>
  <UButton label="Publish template" icon="i-lucide-upload" color="neutral" variant="outline" size="sm" :disabled="!canOpen || open" @click="beginReview" />
  <UModal :open="open" title="Publish a new library template" :dismissible="!locked" :close="!locked" :ui="{ content: 'sm:max-w-5xl' }" @update:open="value => { if (!value) close() }">
    <template #body>
      <div class="@container space-y-4">
        <p class="max-w-prose text-sm text-muted">Publish the saved version as a new library template in the same client or shared scope. This working draft keeps its identity; existing templates and campaigns stay unchanged.</p>
        <p v-if="preparing" role="status" class="text-sm text-muted">Checking native edits and the current saved email…</p>
        <UAlert v-if="error" color="error" :title="error" />
        <UAlert v-if="flow.hasPending.value" color="warning" title="Publication needs reconciliation" description="The result is uncertain. Reconcile this same publication before editing or starting another one." />
        <UAlert v-if="published" color="success" title="Published as a new library template" description="The exact published revision was verified. You can continue editing the original working draft." :data-published-template="published.templateId" />
        <template v-else-if="review">
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Template name"><UInput v-model="name" class="w-full" :disabled="locked" :maxlength="200" /></UFormField>
            <UFormField label="Category" hint="Optional"><UInput v-model="category" class="w-full" :disabled="locked" :maxlength="120" /></UFormField>
          </div>
          <ul v-if="review.paths.length" class="list-disc pl-5 text-sm text-muted"><li v-for="path in review.paths" :key="path">Include local module change: {{ path }}</li></ul>
          <div class="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <section class="min-w-0"><h2 class="mb-2 text-sm font-medium">Saved desktop email</h2><div class="h-[45svh] overflow-auto rounded-lg border border-default"><iframe :srcdoc="review.html" title="Publication desktop preview" sandbox="" referrerpolicy="no-referrer" class="h-full w-[700px] max-w-none border-0 bg-white" /></div></section>
            <section class="min-w-0"><h2 class="mb-2 text-sm font-medium">Saved mobile email</h2><div class="h-[45svh] overflow-auto rounded-lg border border-default"><iframe :srcdoc="review.html" title="Publication mobile preview" sandbox="" referrerpolicy="no-referrer" class="h-full w-[390px] max-w-none border-0 bg-white" /></div></section>
          </div>
          <UFormField label="Publication confirmation"><UCheckbox v-model="confirmed" label="I reviewed this saved email and its listed module changes for a new library template." :disabled="locked" /></UFormField>
        </template>
      </div>
    </template>
    <template #footer>
      <UButton label="Back to draft" color="neutral" variant="outline" :disabled="locked" @click="close" />
      <UButton v-if="flow.hasPending.value" label="Reconcile publication" :loading="flow.busy.value" @click="reconcile" />
      <UButton v-else-if="review && !published" label="Confirm publication" icon="i-lucide-upload" :loading="flow.busy.value" :disabled="!canConfirm" @click="publish" />
      <UButton v-else-if="!published" label="Review saved draft again" :disabled="!canOpen" @click="beginReview" />
    </template>
  </UModal>
</template>
