<script setup lang="ts">
import type { PageStudioRuntimeState } from '~~/shared/pageStudio/runtimeState'

const props = defineProps<{ siteId: string }>()
const { data, error, pending, refresh } = await useFetch<PageStudioRuntimeState>(
  () => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/runtime-state`,
  { query: { environment: 'staging' } }
)
</script>

<template>
  <PageStudioRuntimePublishingPanel
    v-if="!error && data?.deliveryMode === 'runtime' && data.environment === 'staging'"
    :site-id="siteId"
    :state="data"
    :production-hostname="null"
    @changed="refresh()"
  />
  <UCard v-else aria-live="polite">
    <p class="text-sm text-muted">
      {{ pending ? 'Loading staging…' : 'Staging status unavailable. Your published version has not changed.' }}
    </p>
    <UButton
      v-if="!pending"
      class="mt-3"
      label="Retry"
      color="neutral"
      variant="outline"
      @click="refresh()"
    />
  </UCard>
</template>
