<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TransferControlsViewSchema, type TransferControlsView } from '~~/shared/pageStudio/transferControls'

const props = withDefaults(defineProps<{ siteId: string, websiteName: string, accountKey: string, active?: boolean, pendingRequestId?: string | null }>(), { active: true, pendingRequestId: null })
const emit = defineEmits<{ 'update:pendingRequestId': [value: string | null], 'changed': [] }>()
const saved = ref<TransferControlsView | null>(null)
const pendingId = ref<string | null>(props.pendingRequestId)
const loading = ref(false), saving = ref(false), loaded = ref(false), message = ref('')
const confirmation = ref<{ action: 'request' | 'approve' | 'revoke', revision: number | null, requestId: string } | null>(null)
let generation = 0, read = 0, mutationScope = 0
const endpoint = computed(() => `/api/portal/page-studio/customer/sites/${props.siteId}/transfer-request`)
const busy = computed(() => loading.value || saving.value || !props.active)
const labels = { 'requested': 'Preparation requested', 'reviewed': 'Ready for your approval', 'approved': 'Approval saved', 'reserving': 'Preparation is being reserved', 'reserved': 'Website preparation in progress', 'revoked': 'Request cancelled', 'expired': 'Request expired', 'needs-attention': 'Preparation needs attention' }
const actionLabels = { request: 'Request preparation', approve: 'Approve this website', revoke: 'Cancel request' }
function keepIdentity(value: string | null) {
  pendingId.value = value
  emit('update:pendingRequestId', value)
}
function accept(value: unknown, expectedId?: string) {
  const result = TransferControlsViewSchema.parse(value)
  if (result.siteId !== props.siteId || (expectedId && result.requestId !== expectedId)) throw new Error('Mismatched website')
  return result
}
async function refresh(clearMessage = true) {
  if (!props.active || saving.value || loading.value) return
  const current = generation, sequence = ++read
  loading.value = true
  confirmation.value = null
  saved.value = null
  loaded.value = false
  if (clearMessage) message.value = ''
  try {
    const value = await $fetch<unknown>(endpoint.value)
    if (current !== generation || sequence !== read) return
    saved.value = value === null ? null : accept(value)
    loaded.value = true
    if (saved.value) keepIdentity(saved.value.requestId)
  } catch {
    if (current === generation && sequence === read) message.value = 'We could not check your saved preparation. Refresh before continuing.'
  } finally {
    if (current === generation && sequence === read) loading.value = false
  }
}
function choose(action: 'request' | 'approve' | 'revoke') {
  if (busy.value || !loaded.value) return
  if (action !== 'request' && !saved.value?.allowedActions.includes(action)) return
  if (action === 'request' && saved.value) return
  // The same identity survives an uncertain acknowledgement and overview refresh.
  const requestId = saved.value?.requestId ?? pendingId.value ?? crypto.randomUUID()
  if (action === 'request') keepIdentity(requestId)
  confirmation.value = { action, requestId, revision: saved.value?.revision ?? null }
}
async function confirm() {
  const selected = confirmation.value
  if (busy.value || !selected || !loaded.value) return
  if (selected.action !== 'request' && (saved.value?.requestId !== selected.requestId || saved.value?.revision !== selected.revision || !saved.value.allowedActions.includes(selected.action))) return
  const current = generation, context = mutationScope
  saving.value = true
  message.value = ''
  try {
    const body = selected.action === 'request'
      ? { action: selected.action, requestId: selected.requestId }
      : { action: selected.action, requestId: selected.requestId, expectedRevision: selected.revision }
    const result = await $fetch<unknown>(endpoint.value, { method: 'POST', retry: 0, body })
    if (current !== generation) return
    saved.value = accept(result, selected.requestId)
    keepIdentity(saved.value.requestId)
    emit('changed')
  } catch (error) {
    if (current !== generation) return
    const status = Number((error as { statusCode?: number, status?: number })?.statusCode ?? (error as { status?: number })?.status)
    if ([401, 403, 404].includes(status)) keepIdentity(null)
    saved.value = null
    loaded.value = false
    message.value = 'We could not confirm that change. Refresh to check the saved request before choosing another action.'
  } finally {
    if (current === generation) {
      saving.value = false
      confirmation.value = null
      if (!loaded.value) await refresh(false)
    } else if (context === mutationScope) {
      // An overview refresh invalidates display, but cannot unlock a pending POST.
      saving.value = false
      confirmation.value = null
      if (props.active) await refresh()
    }
  }
}
watch(() => [props.siteId, props.accountKey] as const, () => {
  generation++
  mutationScope++
  keepIdentity(null)
  saved.value = null
  loaded.value = false
  confirmation.value = null
  saving.value = false
  loading.value = false
}, { flush: 'sync' })
watch(() => [props.siteId, props.accountKey, props.active] as const, () => {
  generation++
  saved.value = null
  loaded.value = false
  confirmation.value = null
  loading.value = false
  message.value = ''
  if (props.active) void refresh()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  generation++
  mutationScope++
})
</script>

<template>
  <section class="space-y-4 border-t border-default p-6 sm:p-8" aria-labelledby="transfer-request-title" :aria-busy="busy">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0 max-w-prose">
        <h3 id="transfer-request-title" class="font-semibold text-highlighted">
          Prepare your saved website
        </h3>
        <p class="mt-2 text-sm leading-6 text-muted">
          Ask our team to review your saved website before preparing its production workspace. Preparation does not publish your website or change your domain.
        </p>
      </div>
      <UButton
        class="min-h-11"
        label="Refresh preparation"
        color="neutral"
        variant="ghost"
        :disabled="busy"
        @click="refresh()"
      />
    </div>
    <div aria-live="polite" aria-atomic="true" class="space-y-3">
      <p v-if="loading || !active" class="text-sm text-muted">
        Checking saved preparation…
      </p>
      <UAlert
        v-if="message"
        color="warning"
        title="Check your preparation"
        :description="message"
      />
      <template v-if="saved">
        <p class="font-medium text-highlighted">
          {{ labels[saved.state] }}
        </p>
        <dl v-if="saved.review" class="space-y-2 rounded-lg bg-elevated p-4 text-sm">
          <div>
            <dt class="text-muted">
              Reviewed website
            </dt><dd class="break-words font-medium">
              {{ websiteName }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Saved version
            </dt><dd class="truncate" :title="saved.review.checkpointId">
              {{ saved.review.checkpointId }}
            </dd>
          </div>
          <div>
            <dt class="text-muted">
              Saved content
            </dt><dd>{{ saved.review.objectCount }} items in the reviewed copy</dd>
          </div>
          <div>
            <dt class="text-muted">
              Approval window ends
            </dt><dd>{{ new Date(saved.expiresAt).toLocaleString() }}</dd>
          </div>
        </dl>
        <p v-if="saved.state === 'requested'" class="text-sm text-muted">
          Your request is saved. Our team will review the website before you approve the exact saved copy.
        </p>
        <p v-if="saved.state === 'reserved' || saved.state === 'reserving'" class="text-sm text-muted">
          Your approval is saved and cancellation is no longer available. Refresh your website overview for saved progress and the editing connection.
        </p>
        <p v-if="['expired', 'needs-attention', 'revoked'].includes(saved.state)" class="text-sm text-muted">
          Contact support to review this saved request. No new preparation starts automatically.
        </p>
      </template>
    </div>
    <div class="flex flex-wrap gap-3">
      <UButton
        v-if="loaded && !saved"
        class="min-h-11"
        label="Request preparation"
        :disabled="busy"
        @click="choose('request')"
      />
      <UButton
        v-if="saved?.allowedActions.includes('approve')"
        class="min-h-11"
        label="Review approval"
        :disabled="busy"
        @click="choose('approve')"
      />
      <UButton
        v-if="saved?.allowedActions.includes('revoke')"
        class="min-h-11"
        label="Cancel request"
        color="neutral"
        variant="outline"
        :disabled="busy"
        @click="choose('revoke')"
      />
    </div>
    <UModal
      :open="Boolean(confirmation)"
      :title="confirmation ? actionLabels[confirmation.action] : 'Review preparation'"
      description="Review this website before confirming."
      :dismissible="!saving"
      @update:open="value => { if (!value && !saving) confirmation = null }"
    >
      <template #body>
        <div class="space-y-4">
          <p class="break-words font-medium text-highlighted">
            {{ websiteName }}
          </p>
          <dl v-if="saved?.review" class="space-y-2 text-sm">
            <div>
              <dt class="text-muted">
                Saved version
              </dt><dd class="break-all">
                {{ saved.review.checkpointId }}
              </dd>
            </div><div>
              <dt class="text-muted">
                Reviewed content
              </dt><dd>{{ saved.review.objectCount }} items</dd>
            </div>
          </dl>
          <p v-if="confirmation?.action === 'approve'" class="text-sm text-muted">
            Approve only the saved version shown in the review above. Changes to the saved copy require another review.
          </p>
          <p class="text-sm text-muted">
            This action does not publish your website or change your domain.
          </p>
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
        />
        <UButton
          class="min-h-11"
          :label="confirmation ? actionLabels[confirmation.action] : 'Confirm'"
          :loading="saving"
          :disabled="busy || !confirmation"
          @click="confirm"
        />
      </template>
    </UModal>
  </section>
</template>
