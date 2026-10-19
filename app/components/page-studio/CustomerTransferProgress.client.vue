<script setup lang="ts">
import type { CustomerManagedTransfer } from '~~/shared/pageStudio/customerManagedTransfer'

defineProps<{ progress: CustomerManagedTransfer, busy: boolean, error: string }>()
const emit = defineEmits<{ recover: [action: 'retry-connection' | 'retry-retention'] }>()
const stageLabels = {
  'preparing-resources': 'Preparing website storage',
  'freezing-source': 'Protecting the saved source',
  'preparing-destination': 'Preparing the production website',
  'copying-content': 'Copying saved content and forms',
  'verifying': 'Verifying the completed copy',
  'needs-attention': 'Transfer needs attention'
}
</script>

<template>
  <section class="space-y-4 rounded-lg border border-default bg-elevated/40 p-4 sm:p-5" aria-label="Website transfer progress" :aria-busy="busy">
    <div aria-live="polite">
      <h3 class="font-medium text-highlighted">
        {{ progress.completed ? 'Website transfer completed' : stageLabels[progress.stage] }}
      </h3>
      <p class="mt-1 text-sm leading-6 text-muted">
        {{ progress.completed ? 'Your saved website is in its production workspace. Editing connections and protection of the previous website are checked separately below.' : 'This is the saved transfer stage. Refresh to check progress. Contact support if the transfer needs attention.' }}
      </p>
      <p class="mt-1 text-sm text-muted">
        Transferring your website does not publish it or change your domain.
      </p>
    </div>
    <template v-if="progress.completed">
      <dl class="divide-y divide-default border-t border-default">
        <div class="grid gap-2 py-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="text-sm font-medium text-highlighted">
            Editing
          </dt>
          <dd class="text-sm text-muted">
            {{ progress.editorConnection === 'ready' ? 'Editor connected' : progress.editorConnection === 'pending' ? 'Editor connection pending' : 'Editor connection could not be checked' }}
          </dd>
        </div>
        <div class="grid gap-2 py-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="text-sm font-medium text-highlighted">
            Previous website
          </dt>
          <dd class="text-sm text-muted">
            {{ progress.sourceRetention === 'retained' ? 'Previous website protection verified' : progress.sourceRetention === 'pending' ? 'Previous website protection pending' : 'Previous website protection could not be checked' }}
          </dd>
        </div>
      </dl>
      <div v-if="progress.canRetryConnection || progress.canRetryRetention" class="flex flex-wrap gap-3">
        <UButton
          v-if="progress.canRetryConnection"
          label="Retry editor connection"
          icon="i-lucide-plug"
          color="neutral"
          variant="outline"
          :disabled="busy"
          :loading="busy"
          @click="emit('recover', 'retry-connection')"
        />
        <UButton
          v-if="progress.canRetryRetention"
          label="Retry previous website protection"
          icon="i-lucide-shield-check"
          color="neutral"
          variant="outline"
          :disabled="busy"
          :loading="busy"
          @click="emit('recover', 'retry-retention')"
        />
      </div>
    </template>
    <UAlert
      v-if="error"
      color="warning"
      title="Refresh your connection status"
      :description="error"
      role="alert"
    />
  </section>
</template>
