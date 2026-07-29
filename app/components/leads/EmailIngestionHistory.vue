<script setup lang="ts">
import { ref, watch } from 'vue'

interface SafeIngestionHistoryItem {
  id: string
  status: 'received' | 'accepted' | 'duplicate' | 'quarantined' | 'failed'
  reason: string | null
  replay_available: boolean
  replay_unavailable_reason: string | null
  attempt_count: number
  next_attempt_at: string | null
  terminal_at: string | null
  created_at: string
  updated_at: string
}

const props = defineProps<{
  endpointId: string
}>()

const toast = useToast()
const items = ref<SafeIngestionHistoryItem[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const replayingId = ref<string | null>(null)

function statusColor(status: SafeIngestionHistoryItem['status']) {
  if (status === 'accepted') return 'success'
  if (status === 'failed' || status === 'quarantined') return 'error'
  if (status === 'duplicate') return 'warning'
  return 'neutral'
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Not scheduled'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

async function loadHistory() {
  loading.value = true
  loadFailed.value = false
  try {
    const result = await $fetch<{
      items: SafeIngestionHistoryItem[]
    }>(`/api/leads/email-endpoints/${props.endpointId}/ingestions`)
    items.value = result.items
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function replay(item: SafeIngestionHistoryItem) {
  if (!item.replay_available || replayingId.value) return
  replayingId.value = item.id
  try {
    await $fetch(`/api/leads/email-ingestions/${item.id}/replay`, {
      method: 'POST'
    })
    toast.add({
      title: 'Replay completed',
      description: 'The retained email was processed again.',
      color: 'success'
    })
    await loadHistory()
  } catch {
    toast.add({
      title: 'Replay unavailable',
      description: 'The message could not be replayed. Refresh and try again.',
      color: 'error'
    })
  } finally {
    replayingId.value = null
  }
}

watch(() => props.endpointId, loadHistory, { immediate: true })
</script>

<template>
  <section class="space-y-3" aria-labelledby="email-ingestion-history-heading">
    <div>
      <h3 id="email-ingestion-history-heading" class="font-medium">
        Delivery history
      </h3>
      <p class="mt-1 text-sm text-muted">
        Safe processing status and recovery actions for this address.
      </p>
    </div>

    <UAlert
      v-if="loadFailed"
      color="error"
      variant="soft"
      title="Delivery history unavailable"
      description="Refresh the address to try again."
    />
    <div
      v-else-if="loading"
      class="rounded-lg border border-default p-4 text-sm text-muted"
    >
      Loading delivery history…
    </div>
    <div
      v-else-if="items.length === 0"
      class="rounded-lg border border-dashed border-default p-4 text-sm text-muted"
    >
      No messages have been received yet.
    </div>
    <ul v-else class="space-y-3">
      <li
        v-for="item in items"
        :key="item.id"
        class="rounded-lg border border-default bg-elevated/40 p-4"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="item.status"
                :color="statusColor(item.status)"
                variant="soft"
                class="capitalize"
              />
              <span class="text-xs text-muted">
                {{ formatTimestamp(item.created_at) }}
              </span>
            </div>
            <p v-if="item.reason" class="text-sm">
              {{ item.reason }}
            </p>
            <p class="text-xs text-muted">
              Attempts: {{ item.attempt_count }}
              <template v-if="item.next_attempt_at">
                · Next attempt {{ formatTimestamp(item.next_attempt_at) }}
              </template>
            </p>
          </div>
          <div class="text-right">
            <UButton
              type="button"
              size="xs"
              color="neutral"
              variant="outline"
              label="Replay"
              icon="i-lucide-refresh-cw"
              :disabled="!item.replay_available"
              :loading="replayingId === item.id"
              @click="replay(item)"
            />
            <p
              v-if="!item.replay_available && item.replay_unavailable_reason"
              class="mt-1 max-w-48 text-xs text-muted"
            >
              {{ item.replay_unavailable_reason }}
            </p>
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
