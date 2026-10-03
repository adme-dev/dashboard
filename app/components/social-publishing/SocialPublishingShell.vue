<script setup lang="ts">
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import type { SocialPublishingNavCountKey } from '~/utils/socialPublishingNavigation'

/**
 * Shared shell for every Social Publishing page. Owns the three things that used
 * to be re-rolled (inconsistently) per page: the full-width scroll container,
 * the global client selector, and the tile nav. Pages drop their own container +
 * client picker and just provide a title, optional #actions, and body content.
 */
defineProps<{
  title: string
  subtitle?: string
}>()

const { clientId, clients, invalidSelection } = useSocialPublishingClient()

// Clients for the global selector. /api/agency/clients is sometimes a bare array
// and sometimes { clients } — handle both (see agency-clients-bare-array note).
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))

// Live tile-nav badge counts, refetched whenever the client changes.
const { data: countsData } = useFetch('/api/agency/social/publishing/nav-counts', {
  key: 'social-publishing-nav-counts',
  query: { clientId },
  watch: [clientId]
})
const counts = computed(
  () => (countsData.value ?? null) as Partial<Record<SocialPublishingNavCountKey, number>> | null
)
</script>

<template>
  <div class="min-h-0 h-full overflow-y-auto p-4 sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">
          {{ title }}
        </h1>
        <p v-if="subtitle" class="text-sm text-muted mt-0.5">
          {{ subtitle }}
        </p>
      </div>
      <div class="flex w-full sm:w-auto flex-wrap items-end gap-3">
        <UFormField label="Client" class="w-full sm:w-64">
          <USelectMenu
            v-model="clientId"
            size="lg"
            :items="clientOptions"
            value-key="value"
            label-key="label"
            placeholder="Select client"
            icon="i-lucide-building-2"
            class="w-full"
          />
        </UFormField>
        <slot name="actions" />
      </div>
    </div>

    <UAlert
      v-if="invalidSelection"
      title="Choose a client"
      description="The selected client is unavailable. Choose a client before editing or publishing."
      color="warning"
      icon="i-lucide-building-2"
      class="mb-4"
    />
    <SocialPublishingNav :counts="counts" />

    <slot />
  </div>
</template>
