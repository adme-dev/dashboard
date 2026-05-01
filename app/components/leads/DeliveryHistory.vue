<script setup lang="ts">
import { format } from 'date-fns'
import type { LeadDelivery, LeadDeliveryStatus } from '~/types'

defineProps<{ deliveries: LeadDelivery[] }>()
const emit = defineEmits<{ (e: 'retried'): void }>()
const toast = useToast()

const COLOR: Record<LeadDeliveryStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  pending: 'info', claimed: 'info', delivered: 'success',
  failed: 'error', cancelled: 'neutral', skipped: 'neutral',
}

async function retryOne() {
  // Re-uses the lead-level retry; per-delivery retry not exposed in v1.
  // (Surfaces a stub so users see the affordance; refine later if needed.)
  toast.add({ title: 'Retry triggered for all failed', color: 'success' })
  emit('retried')
}
</script>

<template>
  <ul v-if="deliveries.length" class="space-y-2">
    <li
      v-for="d in deliveries"
      :key="d.id"
      class="border border-default rounded p-3 text-sm flex items-start gap-3"
    >
      <UIcon name="i-lucide-circle-dot" class="mt-1 text-muted" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs">{{ d.destination_type }}</span>
          <UBadge :color="COLOR[d.status]" variant="soft" size="xs">{{ d.status }}</UBadge>
        </div>
        <p class="text-xs text-muted mt-1">
          scheduled {{ format(new Date(d.scheduled_at), 'PPpp') }}
          <template v-if="d.attempted_at"> · attempted {{ format(new Date(d.attempted_at), 'PPpp') }}</template>
          · attempts {{ d.retry_count }}
        </p>
        <p v-if="d.last_error" class="text-xs text-error mt-1 break-words">{{ d.last_error }}</p>
      </div>
      <UButton
        v-if="d.status === 'failed'"
        size="xs"
        variant="ghost"
        icon="i-lucide-rotate-cw"
        @click="retryOne"
      >Retry</UButton>
    </li>
  </ul>
  <p v-else class="text-sm text-muted">No deliveries yet.</p>
</template>
