<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { z } from 'zod'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { TransferRecoveryReviewRouteSchema } from '~~/shared/pageStudio/transferRecoveryReviewPublic'
import { TransferRecoveryAdmissionControlActionSchema, TransferRecoveryAdmissionControlViewSchema, type TransferRecoveryAdmissionControlView } from '~~/shared/pageStudio/transferRecoveryAdmissionControl'

const props = defineProps<{ siteId: string, requestId: string, revision: number, actorKey: string }>()
type Action = z.infer<typeof TransferRecoveryAdmissionControlActionSchema>
type Mutation = Exclude<Action, { action: 'read' }>
const saved = ref<TransferRecoveryAdmissionControlView | null>(null)
const pending = ref<Mutation | null>(null), confirmation = ref<Mutation | null>(null), modalAction = ref<Mutation | null>(null)
const busy = ref(false), ready = ref(false), failed = ref(false)
let generation = 0
watch(confirmation, value => { if (value) modalAction.value = value }, { flush: 'sync' })
const scope = () => ({ siteId: props.siteId, requestId: props.requestId, expectedRevision: props.revision })
const valid = computed(() => !!props.actorKey && TransferRecoveryReviewRouteSchema.safeParse(scope()).success)
const endpoint = () => `/api/agency/page-studio/sites/${props.siteId}/transfer-requests/${props.requestId}/recovery/admission`
const storageKey = () => `studio-admission:${props.actorKey}:${props.siteId}:${props.requestId}:${props.revision}`
const equal = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
const detached = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function persist() {
  try {
    if (pending.value) sessionStorage.setItem(storageKey(), JSON.stringify(pending.value))
    else sessionStorage.removeItem(storageKey())
  } catch { /* Keep the exact action in this document; a fresh server read recovers its admission ID. */ }
}
function restore() {
  try {
    const value = TransferRecoveryAdmissionControlActionSchema.parse(JSON.parse(sessionStorage.getItem(storageKey()) ?? 'null'))
    if (value.action !== 'read') pending.value = value
  } catch { /* Untrusted or missing storage never authorizes an action. */ }
}
function current() { return ready.value && !busy.value && !!saved.value && Date.parse(saved.value.deadline) > Date.now() }
function superseded() {
  const state = saved.value, action = pending.value
  return current() && !!state && !!action && state.pgState === 'applied' && state.admissionId === action.admissionId
    && (action.action === 'prepare' || (action.action === 'begin' && equal(action.review, state.review)))
}
function useNewerState() {
  if (!superseded()) return
  pending.value = null; confirmation.value = null; persist()
}
function eligible(action: Mutation) {
  if (!valid.value || !current()) return false
  const state = saved.value!
  if (pending.value) return !superseded() && equal(action, pending.value) && (state.admissionId === null || state.admissionId === action.admissionId)
    && (action.action !== 'begin' || equal(action.review, state.review))
  if (action.action === 'begin') return state.pgState === 'approved' && state.admissionId === null && equal(action.review, state.review)
  if (state.admissionId !== action.admissionId) return false
  if (action.action === 'prepare') return state.pgState === 'pending' && state.d1State === 'unverified'
  if (action.action === 'apply') return state.pgState === 'pending' && state.d1State === 'prepared'
  return state.pgState === 'applied' && state.d1State === 'unverified'
}
function receive(raw: unknown, action: Action) {
  const value = TransferRecoveryAdmissionControlViewSchema.parse(raw)
  if (!equal(scope(), { siteId: value.siteId, requestId: value.requestId, expectedRevision: value.expectedRevision }) || value.action !== action.action) throw Error('Different admission scope')
  if (action.action !== 'read' && (value.admissionId !== action.admissionId || (action.action === 'begin' && !equal(value.review, action.review)))) throw Error('Different admission action')
  if (action.action !== 'read' && saved.value && (!equal(value.review, saved.value.review) || value.deadline !== saved.value.deadline)) throw Error('Changed admission review')
  return value
}
async function refresh() {
  if (busy.value || !valid.value) return
  const currentGeneration = generation
  busy.value = true; ready.value = false; failed.value = false; saved.value = null; confirmation.value = null
  try {
    const action: Action = { action: 'read' }
    const raw = await $fetch<unknown>(endpoint(), { method: 'POST', retry: 0, body: { expectedRevision: props.revision, request: action } })
    if (currentGeneration !== generation) return
    saved.value = receive(raw, action); ready.value = true
  } catch { if (currentGeneration === generation) failed.value = true }
  finally { if (currentGeneration === generation) busy.value = false }
}
function choose(kind: Mutation['action']) {
  if (!current()) return
  const state = saved.value!
  const action: Mutation = kind === 'begin' ? { action: kind, admissionId: crypto.randomUUID(), review: detached(state.review), expectedHeadVersion: 2, prepareEventId: crypto.randomUUID(), enableEventId: crypto.randomUUID() }
    : kind === 'enable' ? { action: kind, admissionId: state.admissionId!, expectedHeadVersion: 4 }
      : { action: kind, admissionId: state.admissionId!, expectedHeadVersion: 3 }
  if (eligible(action)) confirmation.value = action
}
async function submit() {
  const action = confirmation.value
  if (!action || !eligible(action)) { confirmation.value = null; return }
  const request = detached(action), currentGeneration = generation
  pending.value = request; persist(); confirmation.value = null; busy.value = true; failed.value = false
  try {
    const raw = await $fetch<unknown>(endpoint(), { method: 'POST', retry: 0, timeout: 120000, body: { expectedRevision: props.revision, request } })
    if (currentGeneration !== generation) return
    saved.value = receive(raw, request); pending.value = null; persist()
  } catch { if (currentGeneration === generation) { failed.value = true; ready.value = false; saved.value = null } }
  finally { if (currentGeneration === generation) busy.value = false }
}
function invalidate() { generation++; busy.value = false; ready.value = false; saved.value = null; confirmation.value = null }
function visibility() { if (document.visibilityState === 'hidden') invalidate() }
function restored(event: PageTransitionEvent) { if (event.persisted) invalidate() }
watch(() => [props.siteId, props.requestId, props.revision, props.actorKey], () => {
  invalidate(); failed.value = false; pending.value = null; restore(); void refresh()
}, { immediate: true, flush: 'sync' })
onMounted(() => { window.addEventListener('blur', invalidate); window.addEventListener('pageshow', restored); document.addEventListener('visibilitychange', visibility) })
onBeforeUnmount(() => { invalidate(); window.removeEventListener('blur', invalidate); window.removeEventListener('pageshow', restored); document.removeEventListener('visibilitychange', visibility) })
</script>

<template>
  <section class="space-y-5 rounded-xl border border-default bg-default p-5 sm:p-6" aria-label="Transfer readiness" :aria-busy="busy">
    <header class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wider text-muted">Continue the approved transfer</p>
      <h2 class="text-xl font-semibold text-highlighted">Check transfer readiness</h2>
      <p class="max-w-2xl text-sm leading-6 text-muted">Prepare the saved transfer one step at a time. Each step checks your current access and the approved review.</p>
    </header>
    <UAlert v-if="failed" title="The last check could not be confirmed" description="Refresh the saved status before continuing. An interrupted step may already be recorded; check that same step to recover its result." color="warning" />
    <div v-if="saved" class="space-y-3" aria-live="polite">
      <dl class="grid grid-cols-1 gap-4 rounded-lg bg-elevated p-4 sm:grid-cols-2">
        <div><dt class="text-sm text-muted">Saved approval</dt><dd class="mt-1 font-medium text-highlighted">{{ saved.pgState === 'approved' ? 'Ready to prepare' : saved.pgState === 'pending' ? 'Preparation started' : 'Admission recorded' }}</dd></div>
        <div><dt class="text-sm text-muted">Website readiness</dt><dd class="mt-1 font-medium text-highlighted">{{ saved.d1State === 'enabled' ? 'Verified for this step' : saved.d1State === 'prepared' ? 'Preparation verified' : 'Fresh verification required' }}</dd></div>
      </dl>
      <p class="text-sm text-muted">Review window ends {{ new Date(saved.deadline).toLocaleString() }}.</p>
      <UAlert v-if="saved.d1State === 'enabled'" title="Transfer readiness verified" description="The approved admission is enabled. Copying, destination verification and final handover are separate steps and have not been run here." color="success" />
    </div>
    <p v-if="superseded()" class="text-sm leading-6 text-muted">A fresh read confirms this same admission has advanced beyond the interrupted preparation step. Use its newer saved state, then verify website readiness again.</p>
    <p v-if="pending && !superseded()" class="text-sm leading-6 text-muted">A saved step needs its result checked. The same request will be used.</p>
    <div class="flex flex-wrap gap-3">
      <template v-if="current() && !pending">
        <UButton v-if="saved?.pgState === 'approved'" label="Start preparation" :disabled="busy" @click="choose('begin')" />
        <UButton v-if="saved?.pgState === 'pending' && saved.d1State === 'unverified'" label="Verify website preparation" :disabled="busy" @click="choose('prepare')" />
        <UButton v-if="saved?.pgState === 'pending' && saved.d1State === 'prepared'" label="Record verified admission" :disabled="busy" @click="choose('apply')" />
        <UButton v-if="saved?.pgState === 'applied' && saved.d1State === 'unverified'" label="Enable approved admission" :disabled="busy" @click="choose('enable')" />
      </template>
      <UButton v-if="superseded()" label="Use newer saved state" color="neutral" variant="outline" @click="useNewerState" />
      <UButton v-if="pending && eligible(pending)" label="Check the same step" :disabled="busy" @click="confirmation = detached(pending)" />
      <UButton label="Refresh saved readiness" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :disabled="busy || !valid" @click="refresh" />
    </div>
    <UModal :open="!!confirmation" title="Confirm this readiness step" description="Continue using the exact saved transfer and your current sign-in." @update:open="(value: boolean) => { if (!value) confirmation = null }">
      <template #body><p class="text-sm leading-6 text-muted">{{ modalAction?.action === 'begin' ? 'Record preparation for this approved transfer.' : modalAction?.action === 'prepare' ? 'Check the saved website and record its preparation under the approved review.' : modalAction?.action === 'apply' ? 'Verify the website preparation and record admission for the same transfer.' : 'Verify both saved records and enable this approved admission. Content copying and publication are separate steps.' }}</p></template>
      <template #footer><UButton label="Cancel" color="neutral" variant="ghost" @click="confirmation = null" /><UButton label="Confirm readiness step" :disabled="busy || !ready" @click="submit" /></template>
    </UModal>
  </section>
</template>
