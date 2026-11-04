<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { useEdmDesignRoundtrip } from '~~/app/composables/useEdmDesignRoundtrip'
import { figflowTemplateCapability } from '~~/app/utils/edmFigflowLibrary'
import { isExactBlankBody } from '~~/shared/emailRendering/designComposer'
import { sameDesignSource } from '~~/app/utils/edmDesignEquality'
import { templateSourceDetails } from '~~/app/utils/edmTemplateProvenance'
import type { EmailDesignDocument } from '~~/shared/emailRendering/designContract'
import type { DesignerOperation } from '~~/shared/emailRendering/designDesigner'
import type { DesignHandoff } from '~~/shared/emailRendering/designRoundtrip'

interface TemplateRead {
  id: string
  name: string
  subject: string | null
  preview_text: string | null
  body_source: unknown
  template_kind?: 'template' | 'draft' | null
  client_id: string | null
}

const props = defineProps<{ templateId: string }>()
const route = useRoute()
const router = useRouter()
const designFlow = useEdmDesignRoundtrip()
const template = ref<TemplateRead | null>(null)
const loading = ref(true)
const loadError = ref('')
const fallback = ref(false)
const showEditableCopy = ref(false)
const handoffComponent = ref<{ requestSnapshot: () => void, ready: boolean } | null>(null)
const reviewOpen = ref(false)
const localDesign = ref<EmailDesignDocument | null>(null)
const localOperations = ref<DesignerOperation[]>([])
const localOperationId = ref<string | null>(null)
const localChanged = ref(false)
const localHtml = ref('')
const localPreviewError = ref('')
const serverHtml = ref('')
const serverPreviewError = ref('')
const serverMismatch = ref(false)
const nativeDirty = ref(false)
const leaveOpen = ref(false)
const metadataOpen = ref(false)
const metadataSubject = ref('')
const metadataPreview = ref('')
const metadataError = ref('')
const metadataSnapshotPending = ref(false)
const metadataLocked = computed(() => metadataSnapshotPending.value || designFlow.busy.value || designFlow.hasPending.value)
interface MetadataSnapshotIntent { subject: string, preview: string, handoffId: string, documentId: string, headRevisionId: string }
let metadataSnapshotIntent: MetadataSnapshotIntent | null = null
let submittedMetadata: { subject: string, preview: string } | null = null
function openMetadata() {
  if (!canSave.value || metadataOpen.value || reviewOpen.value) return
  metadataSubject.value = template.value?.subject || ''
  metadataPreview.value = template.value?.preview_text || ''
  metadataError.value = ''
  metadataOpen.value = true
}
function updateMetadataOpen(open: boolean) {
  if (open || metadataLocked.value) return
  metadataSnapshotIntent = null
  metadataOpen.value = false
}
function requestMetadataSave() {
  const current = designFlow.draft.value
  const handoff = designFlow.handoff.value
  if (!canSave.value || !metadataOpen.value || !handoff || current?.state !== 'structured') return
  metadataError.value = ''
  metadataSnapshotIntent = {
    subject: metadataSubject.value, preview: metadataPreview.value,
    handoffId: handoff.id, documentId: current.documentId, headRevisionId: current.headRevisionId
  }
  metadataSnapshotPending.value = true
  handoffComponent.value?.requestSnapshot()
}
async function finishMetadata() {
  const current = designFlow.draft.value
  if (!submittedMetadata || !template.value || current?.state !== 'structured') throw new Error('Reload the confirmed metadata before continuing.')
  template.value.subject = submittedMetadata.subject
  template.value.preview_text = submittedMetadata.preview
  const next = await designFlow.open(props.templateId, clientId.value, designFlow.designerAuthoring.value.available, { draftId: current.documentId, expectedRevisionId: current.headRevisionId })
  await adoptOpen(next)
}
async function saveMetadataConfirmed(intent: MetadataSnapshotIntent) {
  submittedMetadata = { subject: intent.subject, preview: intent.preview }
  try {
    await designFlow.run(async () => {
      await designFlow.saveMetadata(submittedMetadata!.subject || null, submittedMetadata!.preview || null)
      await finishMetadata()
    })
  } catch {
    metadataError.value = designFlow.error.value
    if (!designFlow.hasPending.value) submittedMetadata = null
  }
}
let disposed = false
let localPreviewSequence = 0
let serverPreviewSequence = 0
let leaveSnapshotPending = false
let leaveResolve: ((leave: boolean) => void) | null = null

const isDraft = computed(() => template.value?.template_kind === 'draft')
const isImported = computed(() => !!template.value && !!templateSourceDetails(template.value.body_source))
const clientId = computed(() => template.value?.client_id ?? null)
const saveState = computed(() => {
  if (designFlow.hasPending.value) return 'Save needs reconciliation'
  if (designFlow.busy.value) return 'Confirming saved revision'
  if (designFlow.handoff.value?.state === 'proposed') return 'Proposal awaiting confirmation'
  if (nativeDirty.value) return 'Unsaved native edits'
  if (designFlow.handoff.value?.state === 'open') return 'Saved revision · native changes may be unsaved'
  return 'Saved draft'
})
const canSave = computed(() => !!designFlow.handoff.value && designFlow.handoff.value.state === 'open' && handoffComponent.value?.ready === true && !designFlow.busy.value && !designFlow.hasPending.value && !metadataSnapshotPending.value)

const reviewChanges = computed(() => {
  const before = designFlow.handoff.value?.source.blocks
  const after = (serverMismatch.value ? designFlow.handoff.value?.proposal : localDesign.value)?.blocks
  if (!before || !after) return []
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap(id => {
    if (sameDesignSource(before[id], after[id])) return []
    return [`${after[id]?.type || before[id]?.type}: ${!before[id] ? 'added' : !after[id] ? 'removed' : 'updated'}`]
  })
})

async function renderLocalReview(design: EmailDesignDocument) {
  const sequence = ++localPreviewSequence
  localHtml.value = ''
  localPreviewError.value = ''
  try {
    const result = await $fetch<{ html: string }>('/api/email/templates/render', {
      method: 'POST', body: { body_source: design.blocks, subject: template.value?.subject || null, preview_text: template.value?.preview_text || null }
    })
    if (sequence === localPreviewSequence) localHtml.value = result.html
  } catch {
    if (sequence === localPreviewSequence) localPreviewError.value = 'The proposed email could not be rendered. Nothing was saved; retry this preview before saving.'
  }
}
async function renderServerReview(design: EmailDesignDocument) {
  const sequence = ++serverPreviewSequence
  serverHtml.value = ''
  serverPreviewError.value = ''
  try {
    const result = await $fetch<{ html: string }>('/api/email/templates/render', {
      method: 'POST', body: { body_source: design.blocks, subject: template.value?.subject || null, preview_text: template.value?.preview_text || null }
    })
    if (sequence === serverPreviewSequence) serverHtml.value = result.html
  } catch {
    if (sequence === serverPreviewSequence) serverPreviewError.value = 'The server proposal could not be rendered. It has not been applied; retry before confirming it.'
  }
}
function settleLeave(leave: boolean) {
  const resolve = leaveResolve
  leaveResolve = null
  leaveSnapshotPending = false
  leaveOpen.value = false
  resolve?.(leave)
}
function snapshotFailed() {
  metadataSnapshotPending.value = false
  metadataSnapshotIntent = null
  if (metadataOpen.value) metadataError.value = 'Native edits could not be checked. Save or undo them before changing email details.'
  nativeDirty.value = true
  settleLeave(false)
}
function requestLeave() {
  if (loading.value || metadataOpen.value || metadataLocked.value) return false
  if (leaveResolve) return false
  if (nativeDirty.value || designFlow.handoff.value?.state === 'proposed' || (designFlow.handoff.value?.state === 'open' && !handoffComponent.value?.ready)) {
    leaveOpen.value = true
    return new Promise<boolean>((resolve) => { leaveResolve = resolve })
  }
  if (!designFlow.handoff.value || designFlow.handoff.value.state !== 'open') return true
  leaveSnapshotPending = true
  const pending = new Promise<boolean>((resolve) => { leaveResolve = resolve })
  handoffComponent.value.requestSnapshot()
  return pending
}
onBeforeRouteLeave(requestLeave)
function beforeUnload(event: BeforeUnloadEvent) {
  if (nativeDirty.value || designFlow.hasPending.value || designFlow.handoff.value?.state === 'proposed' || designFlow.handoff.value?.state === 'open') {
    event.preventDefault()
    event.returnValue = ''
  }
}
function reviewSnapshot(design: EmailDesignDocument, operations: DesignerOperation[], operationId: string | null, changed: boolean) {
  nativeDirty.value = changed
  if (metadataSnapshotPending.value) {
    const intent = metadataSnapshotIntent
    const current = designFlow.draft.value
    metadataSnapshotPending.value = false
    metadataSnapshotIntent = null
    if (disposed || !metadataOpen.value || !intent) return
    if (designFlow.handoff.value?.id !== intent.handoffId || designFlow.handoff.value?.state !== 'open'
      || current?.state !== 'structured' || current.documentId !== intent.documentId || current.headRevisionId !== intent.headRevisionId) {
      metadataError.value = 'The saved design changed while checking native edits. Reopen email details before saving.'
      return
    }
    if (changed) metadataError.value = 'Save or undo native edits before saving email details. Your entries are kept.'
    else void saveMetadataConfirmed(intent)
    return
  }
  // Unsolicited reads cannot resume metadata saving during this dialog or after unmount.
  if (disposed || metadataOpen.value) return
  if (leaveSnapshotPending) {
    if (changed) leaveOpen.value = true
    else settleLeave(true)
    return
  }
  localDesign.value = design
  localOperations.value = operations
  localOperationId.value = operationId
  localChanged.value = changed
  serverMismatch.value = false
  serverHtml.value = ''
  serverPreviewError.value = ''
  reviewOpen.value = true
  void renderLocalReview(design)
}
function requestSave() {
  if (canSave.value && !metadataOpen.value) handoffComponent.value?.requestSnapshot()
}
async function adoptOpen(next: DesignHandoff) {
  const current = designFlow.draft.value
  if (next.state !== 'open' || next.templateId !== props.templateId || current?.state !== 'structured'
    || next.draftId !== current.documentId || next.baseRevisionId !== current.headRevisionId
    || next.source.scope.clientId !== clientId.value) throw new Error('The reopened draft identity or head does not match.')
  loadError.value = ''
  metadataOpen.value = false
  metadataSnapshotPending.value = false
  metadataSnapshotIntent = null
  submittedMetadata = null
  loading.value = false
  reviewOpen.value = false
  localDesign.value = null
  localOperations.value = []
  localOperationId.value = null
  localChanged.value = false
  nativeDirty.value = false
  serverMismatch.value = false
  await router.replace({ query: { ...route.query, designSession: next.id, designMode: designFlow.mode.value } })
}
async function continueApplied(handoff: DesignHandoff) {
  const revisionId = handoff.appliedRevisionId
  const current = designFlow.draft.value
  if (!revisionId || current?.state !== 'structured' || current.headRevisionId !== revisionId || current.documentId !== handoff.draftId)
    throw new Error('The applied revision could not be verified. Reconcile before reopening.')
  const next = await designFlow.open(props.templateId, clientId.value, designFlow.designerAuthoring.value.available, { draftId: current.documentId, expectedRevisionId: revisionId })
  if (next.templateId !== props.templateId || next.baseRevisionId !== revisionId) throw new Error('The continued design does not match the applied draft.')
  await adoptOpen(next)
}
async function reviewProposal(handoff: DesignHandoff) {
  if (!handoff.proposal) throw new Error('The server proposal is incomplete.')
  serverMismatch.value = true
  nativeDirty.value = true
  reviewOpen.value = true
  await renderServerReview(handoff.proposal)
}
async function reopenSavedDraft() {
  if (designFlow.busy.value || designFlow.hasPending.value) return
  try {
    await designFlow.run(async () => {
      if (designFlow.handoff.value?.state === 'proposed') await designFlow.finish('cancel')
      await designFlow.lookup(props.templateId)
      const current = designFlow.draft.value
      if (current?.state !== 'structured') throw new Error('The saved draft is unavailable.')
      const next = await designFlow.open(props.templateId, clientId.value, designFlow.designerAuthoring.value.available, { draftId: current.documentId, expectedRevisionId: current.headRevisionId })
      await adoptOpen(next)
    })
  } catch { /* Keep the proposal and exact pending operation available. */ }
}
function keepEditing() {
  if (designFlow.handoff.value?.state === 'proposed') void reopenSavedDraft()
  else reviewOpen.value = false
}
async function applyProposal() {
  const applied = await designFlow.finish('apply')
  await continueApplied(applied)
}
async function confirmSave() {
  const design = localDesign.value
  if (!design || !localChanged.value || !localHtml.value || designFlow.handoff.value?.state !== 'open' || designFlow.busy.value || designFlow.hasPending.value) return
  try {
    await designFlow.run(async () => {
      if (designFlow.mode.value === 'designer') {
        if (!localOperationId.value) throw new Error('Open the designer again before saving.')
        await designFlow.proposeDesigner(localOperations.value, localOperationId.value)
      } else await designFlow.propose(design)
      const proposal = designFlow.handoff.value?.proposal
      if (!proposal) throw new Error('The server proposal is incomplete. Reconcile before applying.')
      if (!sameDesignSource(proposal, design)) {
        serverMismatch.value = true
        await renderServerReview(proposal)
        return
      }
      await applyProposal()
    })
  } catch { /* The composable retains the exact operation and proposal. */ }
}
async function confirmServerProposal() {
  const preview = serverMismatch.value ? serverHtml.value : localHtml.value
  if (designFlow.handoff.value?.state !== 'proposed' || !preview || designFlow.busy.value || designFlow.hasPending.value) return
  try { await designFlow.run(applyProposal) } catch { /* CAS refusal and pending writes stay visible. */ }
}
async function reconcileSave() {
  try {
    await designFlow.run(async () => {
      const result = await designFlow.reconcile()
      if (!result) {
        if (submittedMetadata) await finishMetadata()
        return
      }
      if (result.state === 'applied') {
        await continueApplied(result)
        return
      }
      if (result.state === 'proposed') await reviewProposal(result)
      if (result.state === 'open') await adoptOpen(result)
      if (result.state === 'cancelled') { reviewOpen.value = false; loadError.value = 'Proposal discarded. Reopen the saved draft to continue.' }
    })
  } catch {
    if (metadataOpen.value) metadataError.value = designFlow.error.value
    // Exact retained payloads can be reconciled again inside the active dialog.
  }
}
async function initialise() {
  loading.value = true
  loadError.value = ''
  fallback.value = false
  try {
    const result = await $fetch<{ template: TemplateRead }>(`/api/email/templates/${props.templateId}`)
    if (disposed) return
    template.value = result.template
    if (result.template.id !== props.templateId) throw new Error('The saved template identity does not match this route.')
    await designFlow.lookup(props.templateId)
    if (disposed) return
    if (result.template.template_kind !== 'draft') return
    const sessionId = route.query.designSession
    if (typeof sessionId === 'string' && sessionId) {
      const session = await designFlow.resume(sessionId, route.query.designMode === 'designer')
      if (session.templateId !== props.templateId) throw new Error('This handoff belongs to a different template.')
      if (session.state === 'proposed') await reviewProposal(session)
      else if (session.state === 'applied') await continueApplied(session)
      else if (session.state === 'open') await adoptOpen(session)
      else throw new Error('This handoff is closed. Reopen the saved draft to continue.')
      return
    }
    const current = designFlow.draft.value
    if (current?.state !== 'structured' && isImported.value) return
    if (current?.state === 'structured') {
      if (current.projection.state !== 'current' || current.projectionRevisionId !== current.headRevisionId) throw new Error('The saved design projection is not current. Reopen from the template library.')
      if (!current.source.policy.editableFields.length && !designFlow.designerAuthoring.value.available) {
        fallback.value = true
        return
      }
      await designFlow.open(props.templateId, clientId.value, designFlow.designerAuthoring.value.available, { draftId: current.documentId, expectedRevisionId: current.headRevisionId })
    } else {
      const capability = figflowTemplateCapability(result.template.body_source)
      if (!capability.canOpen && !(isExactBlankBody(result.template.body_source) && designFlow.designerAuthoring.value.available)) {
        fallback.value = true
        return
      }
      await designFlow.open(props.templateId, clientId.value, designFlow.designerAuthoring.value.available)
    }
    if (designFlow.handoff.value) await adoptOpen(designFlow.handoff.value)
  } catch (cause) {
    loadError.value = designFlow.error.value || (cause instanceof Error && cause.message !== 'The action could not be confirmed. Retry the same action to reconcile it; your current composer content is kept.'
      ? cause.message
      : 'This design could not be opened. Your saved template is unchanged; retry or use the explicit composer fallback.')
  } finally {
    loading.value = false
  }
}
function editableCopyCreated(id: string) {
  showEditableCopy.value = false
  return navigateTo(`/agency/email/design/${encodeURIComponent(id)}`)
}
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload)
  void initialise()
})
onBeforeUnmount(() => {
  disposed = true
  metadataSnapshotPending.value = false
  metadataSnapshotIntent = null
  localPreviewSequence++
  serverPreviewSequence++
  settleLeave(false)
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<template>
  <div class="flex h-svh min-h-0 flex-col bg-default text-default">
    <header class="flex shrink-0 flex-wrap items-center gap-3 border-b border-default bg-elevated/40 px-3 py-2 sm:px-4">
      <UButton to="/agency/email?tab=templates" icon="i-lucide-arrow-left" label="Email templates" color="neutral" variant="ghost" size="sm" />
      <div class="hidden h-7 w-px bg-border sm:block" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-pen-tool" class="size-4 shrink-0 text-primary" />
          <h1 class="truncate text-sm font-semibold">{{ template?.name || 'Email design' }}</h1>
        </div>
        <p class="truncate text-xs text-muted">FigFlow · {{ clientId ? 'Client draft' : 'Shared draft' }} · {{ saveState }}</p>
      </div>
      <UButton v-if="designFlow.hasPending.value" label="Reconcile save" icon="i-lucide-refresh-cw" color="neutral" variant="outline" size="sm" :loading="designFlow.busy.value" @click="reconcileSave" />
      <UButton v-if="designFlow.handoff.value?.state === 'proposed'" label="Review saved proposal" :disabled="designFlow.busy.value || designFlow.hasPending.value" @click="reviewProposal(designFlow.handoff.value!)" />
      <UButton v-if="(designFlow.error.value || loadError) && designFlow.handoff.value && !designFlow.hasPending.value" label="Reopen saved draft" :disabled="designFlow.busy.value" @click="reopenSavedDraft" />
      <UButton v-if="designFlow.handoff.value" label="Save draft" icon="i-lucide-save" size="sm" :disabled="!canSave" @click="requestSave" />
      <UButton label="Email details" color="neutral" variant="outline" :disabled="!canSave" @click="openMetadata" />
      <UTooltip text="Publishing is not enabled yet">
        <UButton v-if="isDraft" label="Publish template" icon="i-lucide-upload" color="neutral" variant="outline" size="sm" disabled />
      </UTooltip>
    </header>

    <main class="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4">
      <p v-if="loading" role="status" class="p-6 text-sm text-muted">Opening the saved email design…</p>
      <UAlert v-else-if="loadError" color="error" :title="loadError" :actions="[{ label: 'Retry saved design', onClick: initialise }]" />
      <template v-else-if="template && !isDraft">
        <UAlert
          color="info"
          title="Create a separate design draft first"
          description="This library template stays unchanged. FigFlow saves edits only to an independent draft with a new template ID."
          :actions="isImported
            ? [{ label: 'Review editable copy', onClick: () => { showEditableCopy = true } }]
            : [{ label: 'Duplicate as draft', to: `/agency/email?tab=templates&workspace=figflow&copyTemplate=${template.id}` }]"
        />
      </template>
      <template v-else-if="template && isImported && designFlow.draft.value?.state !== 'structured' && !designFlow.handoff.value">
        <UAlert
          color="warning"
          title="Review one explicit editable copy"
          description="The imported original stays unchanged. Supported sections become editable layers in a separate draft; protected HTML remains preserved and visible in compiled output."
          :actions="[{ label: 'Review editable copy', onClick: () => { showEditableCopy = true } }]"
        />
      </template>
      <template v-else-if="fallback">
        <UAlert
          color="info"
          title="This saved source needs the staff composer"
          description="FigFlow has no editable fields or server authoring admission for this draft. Nothing was converted or copied."
          :actions="[{ label: 'Open in composer', to: `/agency/email/compose?id=${templateId}` }]"
        />
      </template>
      <EmailBuilderEdmFigflowHandoff
        v-else-if="designFlow.handoff.value"
        ref="handoffComponent"
        :inert="metadataOpen || metadataLocked || undefined"
        :key="designFlow.handoff.value.id"
        presentation="workspace"
        :handoff="designFlow.handoff.value"
        :mode="designFlow.mode.value"
        :capabilities="designFlow.designerCapabilities.value"
        :operation-id="designFlow.designerOperationId.value"
        :busy="designFlow.busy.value || designFlow.hasPending.value"
        :error="designFlow.error.value"
        :subject="template?.subject || ''"
        :preview-text="template?.preview_text || ''"
        @review="reviewSnapshot"
        @dirty-change="nativeDirty = $event"
        @snapshot-failed="snapshotFailed"
        @resume="initialise"
      />
      <UAlert v-else color="info" title="Choose an explicit editing route" description="This draft was not opened automatically because its saved design is unavailable." :actions="[{ label: 'Open in composer', to: `/agency/email/compose?id=${templateId}` }]" />
    </main>

    <EmailBuilderEdmEditableCopyModal
      v-if="template"
      v-model:open="showEditableCopy"
      :template-id="template.id"
      :template-name="template.name"
      :unsaved-changes="false"
      @created="editableCopyCreated"
    />

    <USlideover :open="reviewOpen" title="Review and save draft" description="Nothing is written until you confirm this compiled proposal." :dismissible="!designFlow.busy.value" :ui="{ content: 'sm:max-w-6xl' }" @update:open="value => { if (!value && !designFlow.busy.value) reviewOpen = false }">
      <template #body>
        <div class="space-y-4 p-4 sm:p-6">
          <UAlert v-if="serverMismatch" color="warning" title="The server proposal differs from your local review" description="It has not been applied. Review this server-compiled output and explicitly confirm it, or discard the proposal and reopen the current saved draft." />
          <UAlert v-else-if="!localChanged" color="info" title="No changes to save" description="The native document matches its saved source. Keep editing or close this review; no revision will be created." />
          <UAlert v-else color="info" title="Compiled from your local snapshot" description="The server will replay the typed changes and compare the result before Apply. Save does not publish or copy this template." />
          <UAlert v-if="localPreviewError && !serverMismatch" color="error" :title="localPreviewError" :actions="localDesign ? [{ label: 'Retry proposal preview', onClick: () => renderLocalReview(localDesign!) }] : []" />
          <UAlert v-if="serverPreviewError && serverMismatch" color="error" :title="serverPreviewError" :actions="designFlow.handoff.value?.proposal ? [{ label: 'Retry server preview', onClick: () => renderServerReview(designFlow.handoff.value!.proposal!) }] : []" />
          <ul v-if="reviewChanges.length" class="list-disc pl-5 text-sm text-muted"><li v-for="(change, index) in reviewChanges" :key="index">{{ change }}</li></ul>
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,700px)_390px]">
            <section class="min-w-0 space-y-2">
              <h2 class="text-sm font-medium">Desktop</h2>
              <div class="h-[65svh] overflow-auto rounded-lg border border-default bg-elevated/30 p-3">
                <iframe v-if="serverMismatch ? serverHtml : localHtml" :srcdoc="serverMismatch ? serverHtml : localHtml" sandbox="" referrerpolicy="no-referrer" title="Proposed desktop email" class="block h-full w-[700px] max-w-none border-0 bg-white" />
              </div>
            </section>
            <section class="min-w-0 space-y-2">
              <h2 class="text-sm font-medium">Mobile · 390 px</h2>
              <div class="h-[65svh] overflow-auto rounded-lg border border-default bg-elevated/30 p-3">
                <iframe v-if="serverMismatch ? serverHtml : localHtml" :srcdoc="serverMismatch ? serverHtml : localHtml" sandbox="" referrerpolicy="no-referrer" title="Proposed mobile email at 390 pixels" class="block h-full w-[390px] max-w-none border-0 bg-white" />
              </div>
            </section>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton :label="designFlow.handoff.value?.state === 'proposed' ? 'Discard proposal and reopen saved draft' : 'Keep editing'" color="neutral" variant="outline" :disabled="designFlow.busy.value || designFlow.hasPending.value" @click="keepEditing" />
        <UButton v-if="designFlow.handoff.value?.state === 'proposed'" label="Apply server proposal" color="warning" :loading="designFlow.busy.value" :disabled="!(serverMismatch ? serverHtml : localHtml) || designFlow.hasPending.value" @click="confirmServerProposal" />
        <UButton v-else label="Save draft" icon="i-lucide-save" :loading="designFlow.busy.value" :disabled="!localChanged || !localHtml || designFlow.hasPending.value" @click="confirmSave" />
      </template>
    </USlideover>

    <UModal :open="metadataOpen" title="Email details" :dismissible="!metadataLocked" :close="!metadataLocked" @update:open="updateMetadataOpen">
      <template #body>
        <div class="@container grid grid-cols-1 gap-4">
          <UFormField label="Subject"><UInput v-model="metadataSubject" class="w-full" :disabled="metadataLocked" /></UFormField>
          <UFormField label="Preheader"><UInput v-model="metadataPreview" class="w-full" :disabled="metadataLocked" /></UFormField>
          <UAlert v-if="metadataError" color="error" :title="metadataError" />
        </div>
      </template>
      <template #footer>
        <UButton label="Back to design" color="neutral" variant="outline" :disabled="metadataLocked" @click="updateMetadataOpen(false)" />
        <UButton v-if="designFlow.hasPending.value" label="Reconcile email details" :loading="designFlow.busy.value" @click="reconcileSave" />
        <UButton v-else label="Save email details" :loading="metadataSnapshotPending || designFlow.busy.value" :disabled="!canSave" @click="requestMetadataSave" />
      </template>
    </UModal>

    <UModal :open="leaveOpen" title="Leave without saving?" :dismissible="false" :close="false">
      <template #body>
        <p class="text-sm text-muted">Native edits are not saved. Leaving discards them; the current saved draft stays unchanged.</p>
      </template>
      <template #footer>
        <UButton label="Keep editing" color="neutral" variant="outline" @click="settleLeave(false)" />
        <UButton label="Leave without saving" color="error" @click="settleLeave(true)" />
      </template>
    </UModal>
  </div>
</template>
