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

const { clientId } = useSocialPublishingClient()

// Clients for the global selector. /api/agency/clients is sometimes a bare array
// and sometimes { clients } — handle both (see agency-clients-bare-array note).
const { data: clientsData } = useFetch('/api/agency/clients', { query: { limit: 200 } })
const clientOptions = computed(() => {
  const d = clientsData.value as any
  const list = Array.isArray(d) ? d : (d?.clients ?? [])
  return list.map((c: any) => ({ label: c.name, value: c.id }))
})

// Default to the first client the first time the list loads with nothing chosen,
// so the suite is never stuck on an empty selection.
watchEffect(() => {
  if (!clientId.value && clientOptions.value.length) {
    clientId.value = clientOptions.value[0].value
  }
})

// Live tile-nav badge counts, refetched whenever the client changes.
const { data: countsData } = useFetch('/api/agency/social/publishing/nav-counts', {
  query: { clientId },
  watch: [clientId]
})
const counts = computed(
  () => (countsData.value ?? null) as Partial<Record<SocialPublishingNavCountKey, number>> | null
)
</script>

<template>
  <div class="p-6 h-full overflow-y-auto">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
        <p v-if="subtitle" class="text-sm text-muted mt-0.5">{{ subtitle }}</p>
      </div>
      <div class="flex items-center gap-2">
        <USelectMenu
          v-model="clientId"
          :items="clientOptions"
          value-key="value"
          label-key="label"
          placeholder="Select client"
          icon="i-lucide-building-2"
          class="w-56"
        />
        <slot name="actions" />
      </div>
    </div>

    <SocialPublishingNav :counts="counts" />

    <slot />
  </div>
</template>
