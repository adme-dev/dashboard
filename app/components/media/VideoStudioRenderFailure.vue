<script setup lang="ts">
import { computed } from 'vue'
import type { MediaRenderJob } from '~~/app/types'
import { retryVideoRenderFormats } from '~~/app/utils/video/renderFormats'
import { renderFailureMessage, renderFormatLabel } from '~~/app/utils/video/renderJobSummary'

const props = defineProps<{ job: MediaRenderJob, rendering?: boolean, historyNote?: string | null, history?: boolean }>()
const emit = defineEmits<{ retry: [job: MediaRenderJob] }>()
const requested = computed(() => retryVideoRenderFormats(props.job))
</script>

<template>
  <div class="space-y-1.5 text-xs">
    <p class="font-medium text-highlighted">{{ renderFailureMessage(job.error) }}</p>
    <p v-if="requested" class="text-muted">Requested outputs · {{ requested.map(renderFormatLabel).join(', ') }}</p>
    <p v-else class="text-muted">The full list of requested formats was not recorded.</p>
    <p v-if="job.progress?.formatKey" class="text-muted">Last reported format · {{ renderFormatLabel(job.progress.formatKey) }}</p>
    <details v-if="history && job.error" class="text-muted">
      <summary class="cursor-pointer">Technical details</summary>
      <p class="mt-1 whitespace-pre-wrap break-words">{{ job.error }}</p>
    </details>
    <p v-if="historyNote" class="text-muted">{{ historyNote }}</p>
    <div v-else-if="requested" class="space-y-1.5">
      <p class="text-muted">A retry uses the current timeline.</p>
      <UButton
        :label="requested.length === 1 ? `Retry ${renderFormatLabel(requested[0]!)}` : `Retry all ${requested.length} requested formats`"
        icon="i-lucide-refresh-cw"
        size="xs"
        variant="soft"
        :loading="rendering"
        @click="emit('retry', job)"
      />
    </div>
    <p v-else class="text-muted">To render the current timeline, choose the output formats in the toolbar and select Render.</p>
  </div>
</template>
