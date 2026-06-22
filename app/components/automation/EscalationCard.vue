<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { severityMeta, summarizeProposedAction } from '~~/app/utils/escalationDisplay'
import type { AutomationEscalation } from '~~/app/composables/useAutomationEscalations'

const props = defineProps<{ escalation: AutomationEscalation, busy?: boolean }>()
const emit = defineEmits<{ approve: [], reject: [] }>()

const meta = computed(() => severityMeta(props.escalation.severity))
const proposed = computed(() => summarizeProposedAction(props.escalation.proposed_action))
const when = computed(() => {
  try {
    return formatDistanceToNow(new Date(props.escalation.created_at), { addSuffix: true })
  } catch {
    return ''
  }
})
</script>

<template>
  <div class="rounded-lg border border-default bg-default p-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="meta.color" variant="subtle" :icon="meta.icon">{{ meta.label }}</UBadge>
          <span class="font-mono text-xs text-muted">{{ escalation.capability }}</span>
        </div>
        <p class="mt-2 font-medium text-highlighted">{{ escalation.title }}</p>
        <p v-if="proposed" class="mt-1 flex items-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-corner-down-right" class="size-4 shrink-0" />
          <span>{{ proposed }}</span>
        </p>
        <p v-if="when" class="mt-1 text-xs text-dimmed">{{ when }}</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <UButton color="success" icon="i-lucide-check" :loading="busy" @click="emit('approve')">
          Approve
        </UButton>
        <UButton color="neutral" variant="outline" icon="i-lucide-x" :disabled="busy" @click="emit('reject')">
          Reject
        </UButton>
      </div>
    </div>
  </div>
</template>
