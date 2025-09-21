<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/ai/recommendations')
</script>

<template>
  <UPage>
    <UPageHeader title="Recommendations" description="Suggestions to optimize costs and collections">
      <template #right>
        <UButton label="Refresh" color="neutral" @click="refresh" />
      </template>
    </UPageHeader>

    <div v-if="pending">Loading recommendations…</div>
    <div v-else-if="error">Failed to load recommendations.</div>

    <UPageCard v-else variant="subtle">
      <div v-if="!data?.recommendations?.length" class="text-sm text-muted">No recommendations available.</div>
      <ul v-else class="space-y-2">
        <li v-for="(r, i) in data?.recommendations" :key="i" class="flex items-center gap-2">
          <UBadge>{{ r.category }}</UBadge>
          <span>{{ r.text }}</span>
        </li>
      </ul>
    </UPageCard>
  </UPage>
</template>
