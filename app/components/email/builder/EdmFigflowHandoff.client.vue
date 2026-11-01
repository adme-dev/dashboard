<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FIGFLOW_EDM_EDITOR_URL, FIGFLOW_EDM_ORIGIN, FIGFLOW_EDM_PROTOCOL, type DesignHandoff } from '~~/shared/emailRendering/designRoundtrip'
import { validateContentReturn } from '~~/shared/emailRendering/designComposer'
import type { EmailDesignDocument } from '~~/shared/emailRendering/designContract'

const props = defineProps<{ handoff: DesignHandoff, busy: boolean, error?: string, conflict?: boolean, subject?: string, previewText?: string }>()
const emit = defineEmits<{
  propose: [design: EmailDesignDocument]
  apply: []
  cancel: []
  resume: []
}>()
const frame = ref<HTMLIFrameElement | null>(null)
const channel = crypto.randomUUID()
const ready = ref(false)
const bridgeError = ref('')
const requesting = ref(false)
const previewHtml = ref('')
const previewLoading = ref(false)
const previewError = ref('')
let previewSequence = 0
async function renderProposal() {
  const proposal = props.handoff.proposal
  if (!proposal || props.handoff.state !== 'proposed') return
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
  send('connect', { handoffId: props.handoff.id, design: props.handoff.source })
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
function receive(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow || event.origin !== FIGFLOW_EDM_ORIGIN) return
  const message = event.data
  if (!message || message.protocol !== FIGFLOW_EDM_PROTOCOL || message.channel !== channel || message.requestId !== requestId) return
  if (message.type !== expectedReply && message.type !== 'error') return
  if (message.type === 'ready') {
    clearTimeout(timer)
    ready.value = true
    bridgeError.value = ''
  } else if (message.type === 'snapshot') {
    requestId = null
    clearTimeout(timer)
    requesting.value = false
    try {
      emit('propose', validateContentReturn(props.handoff.source, message.payload))
    } catch {
      bridgeError.value = 'This design includes changes the email composer cannot preserve. Undo structural or unsupported edits in FigFlow, then return again.'
    }
  } else if (message.type === 'error') {
    requestId = null
    clearTimeout(timer)
    requesting.value = false
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
      Edit supported text, images and buttons in the content view. Return for review to see the rendered email before applying changes to your saved draft.
    </p>
    <UAlert v-if="error || bridgeError" color="error" :title="error || bridgeError" />
    <UAlert
      v-if="conflict"
      color="warning"
      title="Your composer has newer edits"
      description="Keep your current draft. Save it and start a new FigFlow handoff; this proposal will not overwrite those edits."
    />
    <template v-if="handoff.state === 'open'">
      <div class="min-h-96 flex-1 overflow-hidden rounded-lg border border-default">
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
      <div class="flex justify-end">
        <UButton
          label="Return for review"
          icon="i-lucide-arrow-left-right"
          :disabled="!ready || busy"
          :loading="requesting"
          @click="requestReturn"
        />
      </div>
    </template>
    <template v-else-if="handoff.state === 'proposed'">
      <div class="min-h-0 flex-1 overflow-y-auto rounded-lg border border-default p-4">
        <p class="mb-3 text-sm font-medium">
          Rendered email
        </p>
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
          class="mx-auto mb-6 block h-[480px] w-full max-w-[760px] rounded border border-default bg-white"
        />
        <p class="mb-3 text-sm font-medium">
          Content changes
        </p>
        <p v-if="!changes.length" class="text-sm text-muted">
          No content changes were returned.
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
