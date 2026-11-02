<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FIGFLOW_EDM_EDITOR_URL, FIGFLOW_EDM_ORIGIN, FIGFLOW_EDM_PROTOCOL, type DesignHandoff } from '~~/shared/emailRendering/designRoundtrip'
import { validateContentReturn } from '~~/shared/emailRendering/designComposer'
import { applyDesignerOperations, type DesignerCapabilities, type DesignerOperation } from '~~/shared/emailRendering/designDesigner'
import { parseNativeLibraryContext, type NativeLibraryContext } from '~~/shared/emailRendering/designModules'
import type { NativeLibraryIntent } from '~~/app/composables/useEdmNativeLibrary'
import type { EmailDesignDocument } from '~~/shared/emailRendering/designContract'

const props = defineProps<{ handoff: DesignHandoff, busy: boolean, error?: string, conflict?: boolean, subject?: string, previewText?: string, mode?: 'content' | 'designer', capabilities?: DesignerCapabilities | null, operationId?: string | null, libraryAvailable?: boolean, libraryReady?: boolean, libraryPublisher?: boolean }>()
const emit = defineEmits<{
  propose: [design: EmailDesignDocument]
  proposeDesigner: [operations: DesignerOperation[], operationId: string]
  apply: []
  cancel: []
  resume: []
  libraryRequest: [context: NativeLibraryContext, intent: NativeLibraryIntent]
}>()
const frame = ref<HTMLIFrameElement | null>(null)
const channel = crypto.randomUUID()
const ready = ref(false)
const bridgeError = ref('')
const requesting = ref(false)
const previewHtml = ref('')
const previewLoading = ref(false)
const previewDevice = ref<'desktop' | 'mobile'>('desktop')
const previewError = ref('')
const libraryIntent = ref<NativeLibraryIntent | null>(null)
const libraryContext = ref<NativeLibraryContext | null>(null)
let previewSequence = 0
async function renderProposal() {
  const proposal = props.handoff.state === 'proposed'
    ? props.handoff.proposal
    : libraryContext.value && props.operationId ? applyDesignerOperations(props.handoff.source, libraryContext.value.operations, props.operationId) : null
  if (!proposal) return
  const sequence = ++previewSequence
  previewLoading.value = true
  previewHtml.value = ''
  previewError.value = ''
  try {
    const result = await $fetch<{ html: string }>('/api/email/templates/render', {
      method: 'POST', body: { body_source: proposal.blocks, subject: props.subject || null, preview_text: props.previewText || null }
    })
    if (sequence === previewSequence) previewHtml.value = result.html
  } catch {
    if (sequence === previewSequence) previewError.value = 'The email preview could not load. Retry the preview before applying.'
  } finally {
    if (sequence === previewSequence) previewLoading.value = false
  }
}
watch(() => props.handoff.proposalRevisionId, () => {
  void renderProposal()
}, { immediate: true })
let timer: ReturnType<typeof setTimeout> | undefined
let requestId: string | null = null
let expectedReply = ''
const changes = computed(() => {
  const proposal = props.handoff.proposal
  if (!proposal) return []
  if (props.mode === 'designer') {
    const before = props.handoff.source.blocks
    const after = proposal.blocks
    const rows: Array<{ path: string, label: string, before: string, after: string }> = []
    const label = (block: EmailDesignDocument['blocks'][string]) => String(block.data.props?.text ?? block.type).slice(0, 160)
    for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!before[id]) rows.push({ path: id, label: `${after[id].type} added`, before: 'No section', after: label(after[id]) })
      else if (!after[id]) rows.push({ path: id, label: `${before[id].type} removed`, before: label(before[id]), after: 'Section removed' })
      else if (JSON.stringify(before[id]) !== JSON.stringify(after[id])) rows.push({ path: id, label: `${before[id].type} updated`, before: label(before[id]), after: label(after[id]) })
    }
    return rows
  }
  return props.handoff.source.policy.editableFields.flatMap((path) => {
    const [id, , , field] = path.split('.')
    const before = props.handoff.source.blocks[id]?.data.props?.[field]
    const after = proposal.blocks[id]?.data.props?.[field]
    return before === after ? [] : [{ path, label: `${props.handoff.source.blocks[id].type} · ${field}`, before: String(before ?? ''), after: String(after ?? '') }]
  })
})
function send(type: string, payload?: unknown) {
  expectedReply = type === 'connect' ? 'ready' : type
  requestId = crypto.randomUUID()
  frame.value?.contentWindow?.postMessage({ protocol: FIGFLOW_EDM_PROTOCOL, channel, requestId, type, payload: payload === undefined ? undefined : JSON.parse(JSON.stringify(payload)) }, FIGFLOW_EDM_ORIGIN)
}
function connect() {
  ready.value = false
  bridgeError.value = ''
  clearTimeout(timer)
  if (props.mode === 'designer' && (!props.operationId || !props.capabilities)) {
    bridgeError.value = 'Design controls are unavailable. Close and reopen this draft to refresh your access.'
    return
  }
  send('connect', { handoffId: props.handoff.id, design: props.handoff.source, ...(props.mode === 'designer' ? { mode: 'designer', operationId: props.operationId, capabilities: props.capabilities } : {}) })
  timer = setTimeout(() => {
    if (!ready.value) bridgeError.value = 'FigFlow could not open this email. Your saved draft is unchanged. Close and resume the design to reconnect.'
  }, 30_000)
}
function requestReturn() {
  if (!ready.value || props.busy || requesting.value) return
  requesting.value = true
  bridgeError.value = ''
  send('snapshot')
  clearTimeout(timer)
  timer = setTimeout(() => {
    requesting.value = false
    bridgeError.value = 'FigFlow did not confirm a snapshot. Keep this window open and retry Return for review.'
  }, 15_000)
}
function cancelLibraryRead() {
  requestId = null
  clearTimeout(timer)
  requesting.value = false
  libraryIntent.value = null
  libraryContext.value = null
  ++previewSequence
  previewHtml.value = ''
  previewError.value = ''
}
function requestLibrary(intent: NativeLibraryIntent) {
  if (!ready.value || props.busy || requesting.value || !props.libraryAvailable || props.mode !== 'designer') return
  libraryIntent.value = intent
  libraryContext.value = null
  requesting.value = true
  bridgeError.value = ''
  send('context')
  clearTimeout(timer)
  timer = setTimeout(() => {
    cancelLibraryRead()
    bridgeError.value = 'The selection could not be confirmed. Finish editing in FigFlow and choose the library again.'
  }, 15_000)
}
function confirmLibrary() {
  if (!libraryContext.value || !libraryIntent.value || props.busy || previewLoading.value || !previewHtml.value) return
  emit('libraryRequest', libraryContext.value, libraryIntent.value)
}

function receive(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow || event.origin !== FIGFLOW_EDM_ORIGIN) return
  const message = event.data
  if (!message || message.protocol !== FIGFLOW_EDM_PROTOCOL || message.channel !== channel || message.requestId !== requestId) return
  if (message.type !== expectedReply && message.type !== 'error') return
  if (message.type === 'ready') {
    clearTimeout(timer)
    ready.value = true
    bridgeError.value = ''
  } else if (message.type === 'context') {
    requestId = null
    clearTimeout(timer)
    requesting.value = false
    try {
      if (!props.operationId || !libraryIntent.value || props.mode !== 'designer' || !props.libraryAvailable) throw new Error('Selection unavailable')
      const context = parseNativeLibraryContext(props.handoff.source, message.payload, props.operationId)
      if (libraryIntent.value === 'section' && (!context.selectedBlockIds.length || context.selectedBlockIds.includes('root'))) throw new Error('Choose a complete section')
      libraryContext.value = context
      void renderProposal()
    } catch {
      cancelLibraryRead()
      bridgeError.value = 'Choose a mapped email section in FigFlow before opening the library. Your edits are kept.'
    }
  } else if (message.type === 'snapshot') {
    requestId = null
    clearTimeout(timer)
    requesting.value = false
    try {
      if (props.mode === 'designer') {
        const payload = message.payload
        if (!payload || typeof payload !== 'object' || Object.keys(payload).sort().join(',') !== 'operationId,operations' || payload.operationId !== props.operationId) throw new Error('Invalid design return')
        applyDesignerOperations(props.handoff.source, payload.operations, payload.operationId)
        emit('proposeDesigner', payload.operations, payload.operationId)
      } else emit('propose', validateContentReturn(props.handoff.source, message.payload))
    } catch {
      bridgeError.value = 'This design includes changes the email composer cannot preserve. Undo structural or unsupported edits in FigFlow, then return again.'
    }
  } else if (message.type === 'error') {
    requestId = null
    clearTimeout(timer)
    requesting.value = false
    if (libraryIntent.value) cancelLibraryRead()
    bridgeError.value = 'FigFlow cannot return these changes safely. Undo unsupported changes, finish editing any active text, then retry.'
  }
}
onMounted(() => window.addEventListener('message', receive))
onBeforeUnmount(() => {
  previewSequence++
  clearTimeout(timer)
  window.removeEventListener('message', receive)
})
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-4">
    <p class="text-sm text-muted">
      {{ mode === 'designer' ? 'Build your email with the design controls. Review the rendered desktop and mobile email before applying changes to this draft.' : 'Edit supported text, images and buttons in the content view. Return for review to see the rendered email before applying changes to your saved draft.' }}
    </p>
    <UAlert v-if="error || bridgeError" color="error" :title="error || bridgeError" />
    <UAlert
      v-if="conflict"
      color="warning"
      title="Your composer has newer edits"
      description="Keep your current draft. Save it and start a new FigFlow handoff; this proposal will not overwrite those edits."
    />
    <template v-if="libraryReady">
      <slot name="library" />
    </template>
    <UAlert
      v-else-if="handoff.state === 'open' && mode !== 'designer' && !handoff.source.policy.editableFields.length"
      color="warning"
      title="This template supports composer editing only"
      description="FigFlow cannot edit its HTML or locked sections yet. Return to the composer to continue; your saved draft is kept."
    />
    <template v-else-if="handoff.state === 'open'">
      <section v-if="libraryIntent" class="flex min-h-0 flex-col gap-3 rounded border border-default bg-elevated p-4" aria-label="Review selection for library">
        <UAlert
          :title="libraryContext ? 'Review the current design' : 'Confirming FigFlow selection'"
          color="info"
          :description="libraryContext?.operations.length ? 'Save these design changes before inserting or publishing library content.' : 'Opening the library does not publish or change this saved design.'"
        />
        <iframe
          v-if="libraryContext && previewHtml"
          :srcdoc="previewHtml"
          sandbox=""
          referrerpolicy="no-referrer"
          title="Captured email preview"
          :class="['mx-auto block h-[320px] w-full rounded border border-default bg-white', previewDevice === 'mobile' ? 'max-w-[390px]' : 'max-w-[1000px]']"
        />
        <UAlert
          v-if="previewError"
          :title="previewError"
          color="error"
          :actions="[{ label: 'Retry preview', onClick: renderProposal }]"
        />
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            label="Desktop"
            color="neutral"
            variant="ghost"
            @click="previewDevice = 'desktop'"
          />
          <UButton
            label="Mobile"
            color="neutral"
            variant="ghost"
            @click="previewDevice = 'mobile'"
          />
          <UButton
            label="Continue editing"
            color="neutral"
            variant="outline"
            :disabled="busy"
            @click="cancelLibraryRead"
          />
          <UButton
            :label="libraryContext?.operations.length ? 'Review and save for library' : 'Use saved design in library'"
            :disabled="!libraryContext || busy || previewLoading || !previewHtml"
            @click="confirmLibrary"
          />
        </div>
      </section>
      <div :inert="libraryIntent !== null || undefined" class="min-h-96 flex-1 overflow-hidden rounded-lg border border-default">
        <iframe
          ref="frame"
          :src="FIGFLOW_EDM_EDITOR_URL"
          class="h-full min-h-96 w-full"
          title="FigFlow email design"
          sandbox="allow-scripts allow-same-origin allow-downloads"
          referrerpolicy="no-referrer"
          @load="connect"
        />
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          label="Return for review"
          icon="i-lucide-arrow-left-right"
          :disabled="!ready || busy || !!libraryIntent"
          :loading="requesting"
          @click="requestReturn"
        />
        <template v-if="libraryAvailable && mode === 'designer'">
          <UButton
            label="Library"
            color="neutral"
            variant="outline"
            :disabled="!ready || busy || requesting || !!libraryIntent"
            @click="requestLibrary('library')"
          />
          <UButton
            label="Images"
            color="neutral"
            variant="outline"
            :disabled="!ready || busy || requesting || !!libraryIntent"
            @click="requestLibrary('images')"
          />
          <UButton
            label="Save selected section"
            color="neutral"
            variant="outline"
            :disabled="!libraryPublisher || !ready || busy || requesting || !!libraryIntent"
            @click="requestLibrary('section')"
          />
          <UButton
            label="Publish template"
            color="neutral"
            variant="outline"
            :disabled="!libraryPublisher || !ready || busy || requesting || !!libraryIntent"
            @click="requestLibrary('template')"
          />
        </template>
      </div>
    </template>
    <template v-else-if="handoff.state === 'proposed'">
      <div class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-default p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm font-medium">
            Rendered email
          </p>
          <div class="flex gap-1" role="group" aria-label="Email preview size">
            <UButton
              label="Desktop"
              color="neutral"
              :variant="previewDevice === 'desktop' ? 'solid' : 'ghost'"
              :aria-pressed="previewDevice === 'desktop'"
              @click="previewDevice = 'desktop'"
            />
            <UButton
              label="Mobile"
              color="neutral"
              :variant="previewDevice === 'mobile' ? 'solid' : 'ghost'"
              :aria-pressed="previewDevice === 'mobile'"
              @click="previewDevice = 'mobile'"
            />
          </div>
        </div>
        <p v-if="previewLoading" class="text-sm text-muted">
          Rendering the email preview…
        </p>
        <UAlert
          v-if="previewError"
          color="error"
          :title="previewError"
          :actions="[{ label: 'Retry preview', onClick: renderProposal }]"
        />
        <iframe
          v-if="previewHtml"
          :srcdoc="previewHtml"
          sandbox=""
          referrerpolicy="no-referrer"
          title="Proposed email preview"
          :class="['mx-auto mb-6 block h-[480px] w-full rounded border border-default bg-white', previewDevice === 'mobile' ? 'max-w-[390px]' : 'max-w-[1000px]']"
        />
        <p class="mb-3 text-sm font-medium">
          {{ mode === 'designer' ? 'Design changes' : 'Content changes' }}
        </p>
        <p v-if="!changes.length" class="text-sm text-muted">
          No changes were returned.
        </p>
        <div v-for="change in changes" :key="change.path" class="border-b border-default py-4 first:pt-0 last:border-0">
          <p class="mb-2 text-sm font-medium">
            {{ change.label }}
          </p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p class="text-xs text-muted">
                Current draft
              </p><p class="whitespace-pre-wrap break-words text-sm">
                {{ change.before }}
              </p>
            </div>
            <div>
              <p class="text-xs text-muted">
                Proposed change
              </p><p class="whitespace-pre-wrap break-words text-sm">
                {{ change.after }}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <UButton
          label="Keep current draft"
          color="neutral"
          variant="outline"
          :loading="busy"
          @click="emit('cancel')"
        />
        <UButton
          label="Apply and save changes"
          :loading="busy"
          :disabled="conflict || previewLoading || !previewHtml"
          @click="emit('apply')"
        />
      </div>
    </template>
    <UAlert
      v-else
      :color="handoff.state === 'applied' ? 'success' : 'neutral'"
      :title="handoff.state === 'applied' ? 'Design changes saved' : handoff.state === 'expired' ? 'This handoff expired' : 'Current draft kept'"
      description="Close this panel to continue in the composer. Start a new handoff from the current saved draft for further design edits."
    />
    <UButton
      v-if="error"
      label="Refresh saved handoff"
      color="neutral"
      variant="ghost"
      :loading="busy"
      @click="emit('resume')"
    />
  </div>
</template>
