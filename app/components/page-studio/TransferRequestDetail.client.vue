<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { TransferControlsViewSchema, type TransferControlsView } from '~~/shared/pageStudio/transferControls'
import { TransferWorkflowPhases, TransferWorkflowViewSchema, type TransferPhaseView } from '~~/shared/pageStudio/transferWorkflow'

const props = defineProps<{ siteId: string, requestId: string, actorKey: string }>()
const emit = defineEmits<{ changed: [], busy: [value: boolean] }>()
const saved = ref<TransferControlsView | null>(null), phases = ref<TransferPhaseView[]>([])
const loading = ref(false), saving = ref(false), message = ref('')
const heading = ref<HTMLElement | null>(null)
watch(loading, async (value) => {
  if (!value) {
    await nextTick()
    heading.value?.focus()
  }
})
const confirmation = ref<{ action: string, phase?: TransferPhaseView['phase'], revision: number } | null>(null)
let generation = 0
const endpoint = computed(() => `/api/agency/page-studio/sites/${props.siteId}/transfer-requests/${props.requestId}`)
const busy = computed(() => loading.value || saving.value)
watch(busy, value => emit('busy', value), { flush: 'sync' })
const names: Record<TransferPhaseView['phase'], string> = { 'resources': 'Production resources', 'source-execution': 'Source execution', 'source-drafts': 'Freeze source drafts', 'destination-catalogue': 'Destination catalogue', 'destination-execution': 'Destination execution', 'copy-admission': 'Admit content copy', 'copy-execution': 'Copy saved content', 'forms-history': 'Forms and history', 'completion': 'Complete transfer' }
const actionName = (action: string) => ({ review: 'Review saved website', reserve: 'Reserve preparation', start: 'Start', resume: 'Resume', verify: 'Verify', prepare: 'Prepare admission', complete: 'Complete transfer' })[action] ?? action
const nextStep = computed(() => phases.value.find(phase => phase.allowedActions.length))
function control(value: unknown) {
  const result = TransferControlsViewSchema.parse(value)
  if (result.siteId !== props.siteId || result.requestId !== props.requestId) throw new Error('Mismatched request')
  return result
}
function workflow(value: unknown, revision: number) {
  const result = TransferWorkflowViewSchema.parse(value)
  if (result.siteId !== props.siteId || result.requestId !== props.requestId || result.revision !== revision
    || new Set(result.phases.map(phase => phase.phase)).size !== result.phases.length) throw new Error('Mismatched workflow')
  return result.phases
}
async function refresh(clearMessage = true, preserve = false) {
  if (busy.value) return
  const current = generation
  loading.value = true
  confirmation.value = null
  if (!preserve) {
    saved.value = null
    phases.value = []
  }
  if (clearMessage) message.value = ''
  try {
    const result = control(await $fetch<unknown>(endpoint.value))
    if (current !== generation) return
    saved.value = result
    if (result.state === 'reserved') {
      const rows = workflow(await $fetch<unknown>(`${endpoint.value}/workflow`, { query: { expectedRevision: result.revision } }), result.revision)
      if (current !== generation) return
      if (rows.length !== TransferWorkflowPhases.length) throw new Error('Incomplete status')
      phases.value = TransferWorkflowPhases.map(name => rows.find(row => row.phase === name)!)
    } else phases.value = []
  } catch {
    if (current === generation) {
      saved.value = null
      phases.value = []
      message.value = 'Saved status could not be confirmed. Check your access and refresh before continuing.'
    }
  } finally { if (current === generation) loading.value = false }
}
function choose(action: string, phase?: TransferPhaseView['phase']) {
  if (busy.value || !saved.value || (phase && saved.value.state !== 'reserved')) return
  const actions = phase ? phases.value.find(row => row.phase === phase)?.allowedActions : saved.value.allowedActions
  if (!actions?.some(value => value === action)) return
  confirmation.value = { action, phase, revision: saved.value.revision }
}
async function confirm() {
  const selected = confirmation.value, snapshot = saved.value
  if (busy.value || !selected || !snapshot || snapshot.revision !== selected.revision || (selected.phase && snapshot.state !== 'reserved')) return
  const actions = selected.phase ? phases.value.find(row => row.phase === selected.phase)?.allowedActions : snapshot.allowedActions
  if (!actions?.some(action => action === selected.action)) return
  const current = generation
  saving.value = true
  message.value = ''
  try {
    if (selected.phase) {
      const rows = workflow(await $fetch<unknown>(`${endpoint.value}/workflow`, { method: 'POST', retry: 0, body: { expectedRevision: selected.revision, phase: selected.phase, action: selected.action } }), selected.revision)
      if (current !== generation) return
      if (rows.length !== 1 || rows[0]?.phase !== selected.phase) throw new Error('Unexpected phase')
      phases.value = phases.value.map(row => row.phase === selected.phase ? rows[0]! : row)
    } else {
      const result = control(await $fetch<unknown>(endpoint.value, { method: 'POST', retry: 0, body: { action: selected.action, expectedRevision: selected.revision } }))
      if (current !== generation) return
      saved.value = result
      phases.value = []
    }
    emit('changed')
  } catch {
    if (current !== generation) return
    saved.value = null
    phases.value = []
    message.value = 'The result could not be confirmed. Refresh saved status before another explicit action. Nothing is retried automatically.'
  } finally {
    if (current === generation) {
      saving.value = false
      confirmation.value = null
      // Full GET discovers newly available phases after the single phase reply.
      await refresh(false, Boolean(saved.value))
    }
  }
}
watch(() => [props.actorKey, props.siteId, props.requestId], () => {
  generation++
  saved.value = null
  phases.value = []
  confirmation.value = null
  saving.value = false
  loading.value = false
  message.value = ''
  void refresh()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  generation++
  emit('busy', false)
})
</script>

<template>
  <section class="min-w-0 space-y-5" aria-label="Transfer request details" :aria-busy="busy">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 ref="heading" tabindex="-1" class="text-lg font-semibold text-highlighted">
          Saved preparation
        </h2><p class="mt-1 break-all text-sm text-muted">
          Website {{ siteId }}
        </p>
      </div>
      <UButton
        class="min-h-11"
        label="Refresh request"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :disabled="busy"
        @click="refresh()"
      />
    </div>
    <div aria-live="polite" class="space-y-3">
      <p v-if="loading" class="text-sm text-muted">
        Reading saved status…
      </p>
      <UAlert
        v-if="message"
        color="warning"
        title="Check saved status"
        :description="message"
      />
      <template v-if="saved">
        <UBadge color="neutral" variant="subtle">
          {{ saved.state }}
        </UBadge>
        <dl class="space-y-2 text-sm">
          <div>
            <dt class="text-muted">
              Request / revision
            </dt><dd class="break-all">
              {{ saved.requestId }} / {{ saved.revision }}
            </dd>
          </div>
          <div v-if="saved.review">
            <dt class="text-muted">
              Original reviewed version / content
            </dt><dd class="break-all">
              {{ saved.review.checkpointId }} / {{ saved.review.objectCount }} items
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Expires
            </dt><dd>{{ new Date(saved.expiresAt).toLocaleString() }}</dd>
          </div>
        </dl>
        <p v-if="saved.state === 'reviewed'" class="text-sm text-muted">
          Waiting for the owner to approve this exact saved review.
        </p>
        <p v-else-if="saved.state === 'needs-attention'" class="text-sm text-muted">
          The original authority needs attention. Session recovery is not available here.
        </p>
        <p v-if="nextStep" class="text-sm text-highlighted">
          Next available step: {{ names[nextStep.phase] }}. Choose an explicit action below.
        </p>
        <p v-if="phases.find(row => row.phase === 'completion')?.state === 'completed'" class="font-medium text-success">
          Transfer completion saved. Editor connection and publication are separate checks.
        </p>
      </template>
    </div>
    <div v-if="saved" class="flex flex-wrap gap-3">
      <UButton
        v-for="action in saved.allowedActions.filter(value => value === 'review' || value === 'reserve')"
        :key="action"
        class="min-h-11"
        :label="actionName(action)"
        :disabled="busy"
        @click="choose(action)"
      />
    </div>
    <ol v-if="phases.length" class="divide-y divide-default border-y border-default">
      <li v-for="(phase, index) in phases" :key="phase.phase" class="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <h3 class="font-medium text-highlighted">
            {{ index + 1 }}. {{ names[phase.phase] }}
          </h3><p class="mt-1 text-sm text-muted">
            {{ phase.state }}
          </p><p v-if="phase.state === 'ready'" class="mt-1 text-sm text-muted">
            Ready is not saved verification. Verify explicitly when offered.
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <UButton
            v-for="action in phase.allowedActions"
            :key="action"
            class="min-h-11"
            :label="actionName(action)"
            color="neutral"
            variant="outline"
            :disabled="busy"
            :aria-label="`${actionName(action)}: ${names[phase.phase]}`"
            @click="choose(action, phase.phase)"
          />
        </div>
      </li>
    </ol>
    <p class="text-sm text-muted">
      Each action advances only its selected phase. Preparation does not publish the website or change its domain. Refresh only reads saved state.
    </p>
    <UModal
      :open="Boolean(confirmation)"
      :title="confirmation ? actionName(confirmation.action) : 'Confirm action'"
      description="Confirm one action for this saved request."
      :dismissible="!saving"
      @update:open="value => { if (!value && !saving) confirmation = null }"
    >
      <template #body>
        <div class="space-y-3 text-sm">
          <p class="break-all">
            Website {{ siteId }}
          </p><p v-if="confirmation?.phase">
            Phase: {{ names[confirmation.phase] }}
          </p><p v-if="confirmation?.action === 'reserve'">
            Reserve the owner-approved saved copy. The owner can no longer cancel once reservation starts.
          </p><p>This runs one action once. Verify and Complete require their own confirmations. It does not publish or change the domain.</p>
        </div>
      </template>
      <template #footer>
        <UButton
          class="min-h-11"
          label="Go back"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="confirmation = null"
        /><UButton
          class="min-h-11"
          label="Confirm action"
          :loading="saving"
          :disabled="busy || !confirmation"
          @click="confirm"
        />
      </template>
    </UModal>
  </section>
</template>
