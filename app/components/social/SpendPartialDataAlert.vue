<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SpendSyncJobStatus } from '~/types'
import { buildSpendSyncWarning } from '~/utils/spendSyncStatus'

const props = defineProps<{
  job: SpendSyncJobStatus | null
  platformName: string
}>()

const expanded = ref(false)
const warning = computed(() => buildSpendSyncWarning(props.job, props.platformName))

watch(() => props.job?.jobId, () => {
  expanded.value = false
})

function toggleExpanded() {
  expanded.value = !expanded.value
}

const completedLabel = computed(() => {
  if (!warning.value?.finishedAt) return null

  return new Date(warning.value.finishedAt).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Melbourne'
  })
})
</script>

<template>
  <div v-if="warning" class="space-y-3">
    <UAlert
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
      :title="warning.title"
    >
      <template #description>
        <div class="space-y-2">
          <p>{{ warning.summary }}</p>
          <p v-if="completedLabel" class="text-xs text-muted">
            Latest attempt completed {{ completedLabel }}
          </p>
          <UButton
            v-if="warning.groups.length"
            color="warning"
            variant="link"
            size="xs"
            class="px-0"
            :label="expanded ? 'Hide affected accounts' : `View ${warning.failedAccounts} affected account${warning.failedAccounts === 1 ? '' : 's'}`"
            :aria-expanded="expanded"
            @click="toggleExpanded"
          />
        </div>
      </template>
    </UAlert>

    <div
      v-if="expanded"
      class="space-y-4 rounded-lg border border-warning/30 bg-warning/5 p-4"
    >
      <section v-for="group in warning.groups" :key="group.reason" class="space-y-2">
        <h3 class="text-sm font-medium">
          {{ group.reason }} · {{ group.accounts.length }}
        </h3>
        <ul class="grid grid-cols-1 gap-1 text-sm text-muted sm:grid-cols-2 xl:grid-cols-3">
          <li v-for="account in group.accounts" :key="account">
            {{ account }}
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
