<script setup lang="ts">
definePageMeta({ title: 'Site Analytics', layout: 'agency', middleware: ['role-media'] })
const route = useRoute()
const clientId = computed(() => route.params.clientId as string)
const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const client = ref<any | null>(null)

watch(clientId, async (id) => {
  client.value = await apiFetch<any>(`/api/agency/clients/${id}`).catch(() => null)
}, { immediate: true })

const clientName = computed(() => client.value?.client?.name || client.value?.name || 'Client')
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center gap-2">
      <UButton
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="ghost"
        size="sm"
        to="/agency/tracking"
      />
      <h1 class="text-xl font-semibold tracking-tight">
        {{ clientName }} — Website analytics
      </h1>
    </div>
    <TrackingAnalyticsContainer :client-id="clientId" />
  </div>
</template>
