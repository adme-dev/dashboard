<script setup lang="ts">
import TransferRecoveryAdmission from './TransferRecoveryAdmission.client.vue'
import TransferRecoveryApproval from './TransferRecoveryApproval.client.vue'
import { TransferRecoveryInspectionViewSchema } from '~~/shared/pageStudio/transferRecoveryCoordinatorPublic'
import type { z } from 'zod'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TransferRecoveryViewSchema, type TransferRecoveryView } from '~~/shared/pageStudio/transferRecovery'

const props = defineProps<{ siteId: string, requestId: string, revision: number, actorKey: string }>()
const saved = ref<TransferRecoveryView | null>(null)
const loading = ref(false), failed = ref(false), reviewControlsOpen = ref(false), admissionControlsOpen = ref(false)
const busy = ref(false), actionFailed = ref(false), inspectionFailed = ref(false)
const modal = ref<'open' | 'revoke' | null>(null)
const modalAction = ref<'open' | 'revoke'>('open')
// Preserve the dialog copy throughout Nuxt UI's leave transition.
watch(modal, value => { if (value) modalAction.value = value }, { flush: 'sync' })
const evidence = ref<z.infer<typeof TransferRecoveryInspectionViewSchema> | null>(null)
let captureId: string | null = null
let generation = 0
const canInspect = computed(() => !!saved.value?.allowedActions.includes('revoke')
  && saved.value.recovery?.state === 'reconciling' && !saved.value.recovery.expired)
const endpoint = () => `/api/agency/page-studio/sites/${props.siteId}/transfer-requests/${props.requestId}/recovery`
function acceptView(raw: unknown) {
  const result = TransferRecoveryViewSchema.parse(raw)
  if (result.siteId !== props.siteId || result.requestId !== props.requestId || result.revision !== props.revision) throw new Error('Mismatched recovery')
  return result
}
async function changeReview() {
  const action = modal.value
  if (!action || busy.value || loading.value || !saved.value?.allowedActions.includes(action)) return
  const current = generation, previous = saved.value.recovery
  const recoveryId = action === 'open' ? crypto.randomUUID() : previous!.recoveryId
  const deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  busy.value = true
  actionFailed.value = false
  modal.value = null
  try {
    const raw = await $fetch<unknown>(endpoint(), { method: 'POST', retry: 0,
      body: { action, expectedRevision: props.revision, recoveryId,
        expectedHeadVersion: action === 'open' ? null : previous!.version,
        ...(action === 'open' ? { deadline } : {}) } })
    if (current !== generation) return
    const result = acceptView(raw)
    if (!result.recovery || result.recovery.recoveryId !== recoveryId
      || (action === 'open' && (result.recovery.epoch !== 1 || result.recovery.version !== 1
        || result.recovery.state !== 'reconciling' || Date.parse(result.recovery.deadline) !== Date.parse(deadline)))
      || (action === 'revoke' && (result.recovery.state !== 'revoked' || result.recovery.version !== previous!.version + 1))) throw new Error('Mismatched action')
    saved.value = result
    evidence.value = null
    captureId = null
    inspectionFailed.value = false
  } catch {
    if (current === generation) { actionFailed.value = true; saved.value = null }
  } finally { if (current === generation) busy.value = false }
}
async function inspect() {
  const head = saved.value?.recovery
  if (!canInspect.value || !head || busy.value || loading.value || evidence.value) return
  const current = generation, selectedCaptureId = captureId ?? crypto.randomUUID()
  captureId = selectedCaptureId
  busy.value = true
  inspectionFailed.value = false
  try {
    const raw = await $fetch<unknown>(`${endpoint()}/inspect`, { method: 'POST', retry: 0,
      body: { action: 'inspect', expectedRevision: props.revision, expectedHeadVersion: head.version,
        recoveryId: head.recoveryId, captureId: selectedCaptureId } })
    if (current !== generation) return
    const result = TransferRecoveryInspectionViewSchema.parse(raw)
    if (result.siteId !== props.siteId || result.requestId !== props.requestId || result.revision !== props.revision
      || result.recoveryId !== head.recoveryId || result.captureId !== selectedCaptureId) throw new Error('Mismatched inspection')
    evidence.value = result
  } catch {
    if (current === generation) inspectionFailed.value = true
  } finally { if (current === generation) busy.value = false }
}
const title = computed(() => {
  if (!saved.value?.recovery) return 'No recovery review yet'
  if (saved.value.recovery.state === 'revoked') return 'Recovery review revoked'
  if (saved.value.recovery.expired) return 'Recovery review expired'
  return { approved: 'Recovery review approved', pending: 'Recovery admission pending', applied: 'Recovery admission recorded', reconciling: 'Recovery review open' }[saved.value.recovery.state]
})
const description = computed(() => {
  if (!saved.value?.recovery) return 'A new review and approval are required before this transfer can continue.'
  if (saved.value.recovery.state === 'revoked') return 'This review was closed. Refreshing its status will not reopen it.'
  if (saved.value.recovery.expired) return 'This review has expired. It cannot authorize the transfer to continue.'
  if (['approved', 'pending', 'applied'].includes(saved.value.recovery.state)) return 'The review is approved. Check saved readiness for the current admission status before continuing.'
  return 'This review does not authorize transfer execution. Further checks and approvals are required.'
})
async function refresh() {
  if (loading.value || busy.value) return
  const current = generation
  loading.value = true
  failed.value = false
  actionFailed.value = false
  saved.value = null
  try {
    const raw = await $fetch<unknown>(`/api/agency/page-studio/sites/${props.siteId}/transfer-requests/${props.requestId}/recovery`, {
      query: { expectedRevision: props.revision }, retry: 0
    })
    if (current !== generation) return
    saved.value = acceptView(raw)
  } catch {
    if (current === generation) failed.value = true
  } finally { if (current === generation) loading.value = false }
}
watch(() => [props.siteId, props.requestId, props.revision, props.actorKey], () => {
  generation++
  loading.value = false
  busy.value = false
  modal.value = null
  evidence.value = null
  captureId = null
  inspectionFailed.value = false
  actionFailed.value = false
  reviewControlsOpen.value = false
  admissionControlsOpen.value = false
  void refresh()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="space-y-3 rounded-lg border border-default p-4" aria-label="Recovery review status" :aria-busy="loading || busy">
    <h3 class="font-medium text-highlighted">
      Recovery review
    </h3>
    <div aria-live="polite">
      <p v-if="loading" class="text-sm text-muted">
        Reading recovery status…
      </p>
      <UAlert
        v-else-if="failed"
        color="warning"
        title="Recovery status unavailable"
        description="Check your access and refresh before taking another action."
      />
      <template v-else-if="saved">
        <p class="text-sm font-medium text-highlighted">
          {{ title }}
        </p>
        <p class="mt-1 text-sm text-muted">
          {{ description }}
        </p>
        <p v-if="saved.recovery" class="mt-2 text-sm text-muted">
          Review deadline: {{ new Date(saved.recovery.deadline).toLocaleString() }}
        </p>
      </template>
    </div>
    <UAlert
      v-if="actionFailed"
      color="warning"
      title="Review change not confirmed"
      description="Refresh the saved status before another action. The review may already have changed."
    />
    <UAlert
      v-if="inspectionFailed"
      color="warning"
      title="Inspection not confirmed"
      description="Check this same inspection explicitly before continuing. No automatic retry was sent."
    />
    <div v-if="evidence" class="rounded-md bg-elevated p-3 text-sm" aria-live="polite">
      <p class="font-medium text-highlighted">
        {{ evidence.historical ? 'Saved inspection retrieved' : 'Inspection recorded' }}
      </p>
      <p class="mt-1 text-muted">
        Observed {{ new Date(evidence.observedCompletedAt).toLocaleString() }}. Further checks and approvals are required before the transfer can continue.
      </p>
    </div>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="saved?.allowedActions.includes('open')"
        label="Open recovery review"
        class="min-h-11"
        :disabled="busy || loading"
        @click="modal = 'open'"
      />
      <UButton
        v-if="canInspect"
        :label="inspectionFailed ? 'Check this inspection' : 'Inspect retained transfer'"
        class="min-h-11"
        :disabled="busy || loading || !!evidence"
        @click="inspect"
      />
      <UButton
        v-if="saved?.allowedActions.includes('revoke')"
        label="Close review"
        class="min-h-11"
        color="neutral"
        variant="outline"
        :disabled="busy || loading"
        @click="modal = 'revoke'"
      />
      <UButton
        label="Refresh recovery status"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        class="min-h-11"
        :disabled="loading || busy"
        @click="refresh"
      />
    </div>
    <UButton v-if="saved?.recovery && !saved.recovery.expired && saved.recovery.state !== 'revoked' && saved.allowedActions.includes('revoke') && !reviewControlsOpen" label="Prepare recovery approval" color="neutral" variant="outline" @click="reviewControlsOpen = true" />
    <TransferRecoveryApproval v-if="reviewControlsOpen" :site-id="siteId" :request-id="requestId" :revision="revision" :actor-key="actorKey" mode="operator" />
    <UButton v-if="saved?.recovery && !saved.recovery.expired && ['approved', 'pending', 'applied'].includes(saved.recovery.state) && !admissionControlsOpen" label="Check transfer readiness" color="neutral" variant="outline" @click="admissionControlsOpen = true" />
    <TransferRecoveryAdmission v-if="admissionControlsOpen" :site-id="siteId" :request-id="requestId" :revision="revision" :actor-key="actorKey" />
    <UModal
      :open="!!modal"
      :title="modalAction === 'open' ? 'Open a recovery review' : 'Close this review'"
      :description="modalAction === 'open' ? 'Open a review for up to one hour. This does not resume, publish or renew the website.' : 'Close this review and prevent further recovery actions under it. Saved history is retained.'"
      @update:open="(value: boolean) => { if (!value) modal = null }"
    >
      <template #footer>
        <UButton label="Cancel" color="neutral" variant="outline" @click="modal = null" />
        <UButton :label="modalAction === 'open' ? 'Open review' : 'Confirm close'" :disabled="busy || loading" @click="changeReview" />
      </template>
    </UModal>
  </section>
</template>
