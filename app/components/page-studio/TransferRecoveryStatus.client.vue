<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TransferRecoveryViewSchema, type TransferRecoveryView } from '~~/shared/pageStudio/transferRecovery'

const props = defineProps<{ siteId: string, requestId: string, revision: number, actorKey: string }>()
const saved = ref<TransferRecoveryView | null>(null)
const loading = ref(false), failed = ref(false)
let generation = 0
const title = computed(() => {
  if (!saved.value?.recovery) return 'No recovery review yet'
  if (saved.value.recovery.state === 'revoked') return 'Recovery review revoked'
  return saved.value.recovery.expired ? 'Recovery review expired' : 'Recovery review open'
})
const description = computed(() => {
  if (!saved.value?.recovery) return 'A new review and approval are required before this transfer can continue.'
  if (saved.value.recovery.state === 'revoked') return 'This review was closed. Refreshing its status will not reopen it.'
  if (saved.value.recovery.expired) return 'This review has expired. It cannot authorize the transfer to continue.'
  return 'This review does not authorize transfer execution. Further checks and approvals are required.'
})
async function refresh() {
  if (loading.value) return
  const current = generation
  loading.value = true
  failed.value = false
  saved.value = null
  try {
    const raw = await $fetch<unknown>(`/api/agency/page-studio/sites/${props.siteId}/transfer-requests/${props.requestId}/recovery`, {
      query: { expectedRevision: props.revision }, retry: 0
    })
    if (current !== generation) return
    const result = TransferRecoveryViewSchema.parse(raw)
    if (result.siteId !== props.siteId || result.requestId !== props.requestId || result.revision !== props.revision) throw new Error('Mismatched recovery')
    saved.value = result
  } catch {
    if (current === generation) failed.value = true
  } finally { if (current === generation) loading.value = false }
}
watch(() => [props.siteId, props.requestId, props.revision, props.actorKey], () => {
  generation++
  loading.value = false
  void refresh()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <section class="space-y-3 rounded-lg border border-default p-4" aria-label="Recovery review status" :aria-busy="loading">
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
    <UButton
      label="Refresh recovery status"
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="outline"
      class="min-h-11"
      :disabled="loading"
      @click="refresh"
    />
  </section>
</template>
