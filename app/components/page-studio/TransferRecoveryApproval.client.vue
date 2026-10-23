<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { z } from 'zod'
import { RecoveryReviewOperatorAction, RecoveryReviewOwnerAction, RecoveryReviewOperatorPublicResponse, RecoveryReviewPublicView, type RecoveryReviewControlView } from '~~/shared/pageStudio/transferRecoveryReviewControl'
import { TransferRecoveryReviewReferenceSchema, TransferRecoveryReviewRouteSchema } from '~~/shared/pageStudio/transferRecoveryReview'
import { TransferRecoveryViewSchema, type TransferRecoveryView } from '~~/shared/pageStudio/transferRecovery'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'

const props = defineProps<{ siteId: string, requestId: string, revision: number, mode: 'owner' | 'operator', actorKey?: string, reference?: unknown }>()
type Action = z.infer<typeof RecoveryReviewOperatorAction>
type Reference = z.infer<typeof TransferRecoveryReviewReferenceSchema>
const head = ref<TransferRecoveryView['recovery']>(null), selectedReview = ref<Reference | null>(null)
const saved = ref<Extract<RecoveryReviewControlView, { action: 'read' | 'create-review' }> | null>(null)
const renewal = ref<string | null>(null), customerOrigin = ref<string | null>(null)
const busy = ref(false), ready = ref(false), failed = ref(false), uncertain = ref(false), approved = ref(false), consentRecorded = ref(false)
const confirmation = ref<Action | null>(null), modalAction = ref<Action | null>(null), pending = ref<Action | null>(null)
watch(confirmation, value => { if (value) modalAction.value = value }, { flush: 'sync' })
let generation = 0
const detach = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const Stored = z.object({ reference: TransferRecoveryReviewReferenceSchema.nullable(), renewal: z.string().uuid().nullable(), pending: RecoveryReviewOperatorAction.nullable() }).strict()
const storageKey = () => `studio-review:${props.mode}:${props.actorKey ?? 'native'}:${props.siteId}:${props.requestId}:${props.revision}`
function persist() {
  try { sessionStorage.setItem(storageKey(), JSON.stringify({ reference: selectedReview.value, renewal: renewal.value, pending: pending.value })) } catch { /* Current document still retains the exact pending request. */ }
}
function restore() {
  try {
    const value = Stored.parse(JSON.parse(sessionStorage.getItem(storageKey()) ?? 'null'))
    if (props.mode === 'owner' && !equal(value.reference, selectedReview.value)) return
    if (props.mode === 'owner' && value.pending && !RecoveryReviewOwnerAction.safeParse(value.pending).success) return
    selectedReview.value = value.reference; renewal.value = value.renewal; pending.value = value.pending; uncertain.value = !!value.pending
  } catch { /* No valid saved receipt; start from an authenticated read. */ }
}
const scope = () => ({ siteId: props.siteId, requestId: props.requestId, expectedRevision: props.revision })
const valid = computed(() => TransferRecoveryReviewRouteSchema.safeParse(scope()).success && (props.mode === 'operator' || Boolean(selectedReview.value)))
const endpoint = () => `/api/${props.mode === 'operator' ? 'agency/page-studio' : 'portal/page-studio/customer'}/sites/${props.siteId}/transfer-requests/${props.requestId}/recovery/review`
const equal = (a: unknown, b: unknown) => collectionCanonical(a) === collectionCanonical(b)
function currentReview() { return !!saved.value && Date.parse(saved.value.review.maximumDeadline) > Date.now() }
function currentHead() { return !!head.value && head.value.state === 'reconciling' && head.value.version === 1 && !head.value.expired && Date.parse(head.value.deadline) > Date.now() }
function eligible(action: Action) {
  if (!ready.value || busy.value || !valid.value) return false
  if (uncertain.value) return !!pending.value && equal(action, pending.value)
  if (approved.value || (props.mode === 'operator' && !currentHead())) return false
  if (action.action === 'renew-plan') return props.mode === 'operator' && currentHead() && !renewal.value && !selectedReview.value
  if (action.action === 'create-review') return props.mode === 'operator' && currentHead() && renewal.value === action.body.renewalRequestId && !selectedReview.value
  if (action.action === 'consent-review') return currentReview() && equal(action.review, selectedReview.value) && !saved.value!.review.consents.some(row => row.party === props.mode)
  if (action.action === 'approve-review') return props.mode === 'operator' && currentReview() && equal(action.review, selectedReview.value) && saved.value!.review.consents.length === 2 && saved.value!.review.consents.every(row => !row.expired)
  return false
}
function receive(raw: unknown, action: Action) {
  const response = props.mode === 'operator' ? RecoveryReviewOperatorPublicResponse.parse(raw) : null
  const value = RecoveryReviewPublicView.parse(response ? response.view : raw)
  if (value.siteId !== props.siteId || value.requestId !== props.requestId || value.expectedRevision !== props.revision || value.action !== action.action) throw Error('Different review operation')
  if (value.action === 'read' && action.action === 'read' && !equal(value.review.reference, action.review)) throw Error('Different review')
  if (value.action === 'create-review' && action.action === 'create-review' && (value.review.reference.reviewId !== action.body.reviewId || value.review.reference.revision !== action.body.expectedReviewRevision + 1 || value.review.maximumDeadline !== action.body.maximumDeadline)) throw Error('Different creation')
  if (value.action === 'renew-plan' && action.action === 'renew-plan' && (value.renewalRequestId !== action.renewalRequestId || value.recoveryId !== action.recoveryId || value.effectiveUntil !== action.effectiveUntil)) throw Error('Different renewal')
  if (value.action === 'consent-review' && action.action === 'consent-review' && (value.consentId !== action.consentId || value.party !== props.mode || !equal(value.review, action.review))) throw Error('Different consent')
  if (value.action === 'approve-review' && action.action === 'approve-review' && (value.approvalId !== action.approvalId || !equal(value.review, action.review))) throw Error('Different approval')
  if (response) customerOrigin.value = response.customerOrigin
  return value
}
async function refresh() {
  if (busy.value || !valid.value) return
  const current = generation
  busy.value = true; ready.value = false; failed.value = false; consentRecorded.value = false; confirmation.value = null; saved.value = null
  try {
    if (props.mode === 'operator') {
      const raw = await $fetch<unknown>(`/api/agency/page-studio/sites/${props.siteId}/transfer-requests/${props.requestId}/recovery`, { query: { expectedRevision: props.revision }, retry: 0 })
      if (current !== generation) return
      const value = TransferRecoveryViewSchema.parse(raw)
      if (value.siteId !== props.siteId || value.requestId !== props.requestId || value.revision !== props.revision) throw Error('Different recovery')
      head.value = value.recovery
      approved.value = !!value.recovery && ['approved', 'pending', 'applied'].includes(value.recovery.state)
    }
    if (selectedReview.value) {
      const action: Action = { action: 'read', review: detach(selectedReview.value) }
      const raw = await $fetch<unknown>(endpoint(), { method: 'POST', retry: 0, body: { expectedRevision: props.revision, request: action } })
      if (current !== generation) return
      const value = receive(raw, action)
      if (value.action !== 'read') throw Error('Wrong view')
      saved.value = value
    }
    ready.value = true
  } catch { if (current === generation) failed.value = true }
  finally { if (current === generation) busy.value = false }
}
function choose(kind: 'renew-plan' | 'create-review' | 'consent-review' | 'approve-review') {
  const action: Action = kind === 'renew-plan' ? { action: kind, renewalRequestId: crypto.randomUUID(), recoveryId: head.value!.recoveryId, expectedHeadVersion: 1, effectiveUntil: head.value!.deadline, reason: 'Complete the original reviewed website transfer with unchanged plan allowances.' }
    : kind === 'create-review' ? { action: kind, body: { reviewId: crypto.randomUUID(), expectedReviewRevision: 0, recoveryId: head.value!.recoveryId, expectedHeadVersion: 1, renewalRequestId: renewal.value!, captureId: crypto.randomUUID(), maximumDeadline: head.value!.deadline } }
      : kind === 'consent-review' ? { action: kind, review: selectedReview.value!, consentId: crypto.randomUUID() }
        : { action: kind, review: selectedReview.value!, approvalId: crypto.randomUUID(), captureId: crypto.randomUUID() }
  if (eligible(action)) confirmation.value = action
}
async function submit() {
  const action = confirmation.value
  if (!action || !eligible(action)) { confirmation.value = null; return }
  const request = (props.mode === 'owner' ? RecoveryReviewOwnerAction : RecoveryReviewOperatorAction).parse(action)
  const current = generation
  pending.value = detach(request); persist(); confirmation.value = null; busy.value = true; failed.value = false
  try {
    const raw = await $fetch<unknown>(endpoint(), { method: 'POST', retry: 0, timeout: 120000, body: { expectedRevision: props.revision, request } })
    if (current !== generation) return
    const value = receive(raw, request)
    uncertain.value = false; pending.value = null
    if (value.action === 'renew-plan') renewal.value = value.renewalRequestId
    if (value.action === 'create-review') { selectedReview.value = value.review.reference; saved.value = value }
    if (value.action === 'consent-review') { consentRecorded.value = true; ready.value = false; saved.value = null }
    if (value.action === 'approve-review') { approved.value = true; ready.value = false; saved.value = null }
    persist()
  } catch { if (current === generation) { failed.value = true; uncertain.value = true; ready.value = false; saved.value = null } }
  finally { if (current === generation) busy.value = false }
}
const customerLink = computed(() => {
  if (!customerOrigin.value || !selectedReview.value) return null
  const query = new URLSearchParams({ revision: String(props.revision), reviewId: selectedReview.value.reviewId, reviewRevision: String(selectedReview.value.revision), digest: selectedReview.value.reviewDigest })
  return `${customerOrigin.value}/studio/sites/${props.siteId}/transfer-review/${props.requestId}?${query}`
})
function invalidate() { generation++; if (busy.value && pending.value) uncertain.value = true; busy.value = false; ready.value = false; saved.value = null; consentRecorded.value = false; confirmation.value = null }
function visibility() { if (document.visibilityState === 'hidden') invalidate() }
function restored(event: PageTransitionEvent) { if (event.persisted) invalidate() }
watch(() => [props.siteId, props.requestId, props.revision, props.mode, props.actorKey, props.reference], () => {
  invalidate(); failed.value = false; uncertain.value = false; approved.value = false; head.value = null; renewal.value = null; pending.value = null; customerOrigin.value = null
  const parsed = TransferRecoveryReviewReferenceSchema.safeParse(props.reference); selectedReview.value = parsed.success ? parsed.data : null
  restore()
  void refresh()
}, { immediate: true, flush: 'sync' })
onMounted(() => { window.addEventListener('blur', invalidate); window.addEventListener('pageshow', restored); document.addEventListener('visibilitychange', visibility) })
onBeforeUnmount(() => { invalidate(); window.removeEventListener('blur', invalidate); window.removeEventListener('pageshow', restored); document.removeEventListener('visibilitychange', visibility) })
</script>

<template>
  <section class="space-y-5 rounded-xl border border-default bg-default p-5 sm:p-6" aria-label="Approve the recovery plan" :aria-busy="busy">
    <header class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-wider text-muted">Your saved website</p>
      <h2 class="text-xl font-semibold text-highlighted">{{ mode === 'owner' ? 'Review your website transfer' : 'Prepare the recovery approval' }}</h2>
      <p class="max-w-2xl text-sm leading-6 text-muted">Review the original transfer and its unchanged plan limits. Both the website owner and account manager must agree before the remaining transfer checks can proceed.</p>
    </header>
    <UAlert v-if="!valid" title="This review link is incomplete" description="Ask your account manager for the complete review link." color="warning" />
    <UAlert v-if="failed" title="The last step could not be confirmed" description="Refresh your access, then check the same step. No automatic retry was sent." color="warning" />
    <UAlert v-if="consentRecorded" title="Your agreement is recorded" description="Refresh the review to check both agreements. No transfer has started." color="success" />
    <UAlert v-if="approved" title="Recovery review approved" description="Both parties have agreed and the final review is recorded. Transfer execution still requires its separate admission checks." color="success" />
    <div v-if="saved" class="space-y-4" aria-live="polite">
      <p class="text-sm text-muted">Saved review · valid until {{ new Date(saved.review.maximumDeadline).toLocaleString() }}</p>
      <dl class="grid grid-cols-2 gap-4 rounded-lg bg-elevated p-4 sm:grid-cols-3">
        <div><dt class="text-xs text-muted">Pages</dt><dd class="mt-1 font-semibold">{{ saved.review.plan.pages }}</dd></div>
        <div><dt class="text-xs text-muted">Custom domains</dt><dd class="mt-1 font-semibold">{{ saved.review.plan.customDomains }}</dd></div>
        <div><dt class="text-xs text-muted">Monthly builds</dt><dd class="mt-1 font-semibold">{{ saved.review.plan.monthlyBuilds }}</dd></div>
        <div><dt class="text-xs text-muted">Storage</dt><dd class="mt-1 font-semibold">{{ saved.review.plan.storageBytes.toLocaleString() }} bytes</dd></div>
        <div><dt class="text-xs text-muted">Monthly traffic</dt><dd class="mt-1 font-semibold">{{ saved.review.plan.monthlyTrafficBytes.toLocaleString() }} bytes</dd></div>
        <div><dt class="text-xs text-muted">AI operations</dt><dd class="mt-1 font-semibold">0</dd></div>
      </dl>
      <p class="text-sm leading-6 text-muted">Remaining work: prepare the original transfer, copy saved content and form history, verify the destination, and retain the original website.</p>
      <div class="flex flex-wrap gap-2"><UBadge v-for="party in (['owner', 'operator'] as const)" :key="party" color="neutral" variant="soft">{{ party === 'owner' ? 'Website owner' : 'Account manager' }}: {{ saved.review.consents.some(row => row.party === party && !row.expired) ? 'agreement recorded' : 'agreement needed' }}</UBadge></div>
    </div>
    <div v-if="customerLink" class="rounded-lg bg-elevated p-4 text-sm"><p class="mb-2 font-medium">Owner review link</p><a :href="customerLink" class="block break-all text-primary underline" target="_blank" rel="noopener noreferrer">{{ customerLink }}</a></div>
    <p v-if="ready && !saved && !approved" class="text-sm text-muted">{{ renewal ? 'The original plan limits are renewed for this review window. Create the review to inspect the saved transfer.' : mode === 'operator' ? 'Open a recovery review above first, then renew its original plan limits for the same review window.' : 'Refresh to read the saved review.' }}</p>
    <div class="flex flex-wrap gap-3">
      <UButton v-if="mode === 'operator' && ready && currentHead() && !renewal && !selectedReview && !uncertain" label="Renew original plan limits" :disabled="busy" @click="choose('renew-plan')" />
      <UButton v-if="mode === 'operator' && ready && currentHead() && renewal && !selectedReview && !uncertain" label="Create recovery review" :disabled="busy" @click="choose('create-review')" />
      <UButton v-if="ready && !approved && (mode === 'owner' || currentHead()) && currentReview() && !saved?.review.consents.some(row => row.party === mode) && !uncertain" label="Agree to this review" :disabled="busy" @click="choose('consent-review')" />
      <UButton v-if="mode === 'operator' && ready && !approved && currentHead() && currentReview() && saved?.review.consents.length === 2 && saved.review.consents.every(row => !row.expired) && !uncertain" label="Approve after fresh checks" :disabled="busy" @click="choose('approve-review')" />
      <UButton v-if="ready && uncertain && pending" label="Check the same step" :disabled="busy" @click="confirmation = pending" />
      <UButton label="Refresh review" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :disabled="busy || !valid" @click="refresh" />
      <UButton v-if="mode === 'owner' && failed" to="/studio/signup" label="Sign in" color="neutral" variant="ghost" />
    </div>
    <UModal :open="!!confirmation" title="Confirm this recovery step" description="Use your current sign-in for this exact saved transfer. This step does not publish the website or enable AI." @update:open="(value: boolean) => { if (!value) confirmation = null }">
      <template #body><p class="text-sm leading-6 text-muted">{{ modalAction?.action === 'renew-plan' ? 'Renew only the original plan limits, until the current recovery review closes.' : modalAction?.action === 'create-review' ? 'Inspect the saved transfer and create the immutable review both parties will approve.' : modalAction?.action === 'consent-review' ? 'Record your agreement to the plan limits and remaining work shown in this review.' : 'Check both agreements and inspect the original transfer again before recording approval.' }}</p></template>
      <template #footer><UButton label="Cancel" color="neutral" variant="ghost" @click="confirmation = null" /><UButton label="Confirm this step" :disabled="busy || !ready" @click="submit" /></template>
    </UModal>
  </section>
</template>
