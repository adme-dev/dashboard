<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/ai/insights')
</script>

<template>
  <UPage>
    <UPageHeader
      title="AI Insights"
      description="Plain-English financial insights generated from your Xero data"
    >
      <template #right>
        <UButton label="Refresh" color="neutral" @click="refresh" />
      </template>
    </UPageHeader>

    <div v-if="pending">Generating insights…</div>
    <div v-else-if="error">Failed to load insights.</div>

    <UPageGrid v-else class="gap-4 sm:gap-6">
      <UPageCard
        v-for="(ins, i) in data?.insights || []"
        :key="i"
        variant="subtle"
      >
        <div class="flex items-center justify-between">
          <div class="font-medium">{{ ins.title }}</div>
          <UBadge :color="ins.severity === 'warning' ? 'error' : ins.severity === 'success' ? 'success' : 'neutral'">
            {{ ins.severity || 'info' }}
          </UBadge>
        </div>
        <p class="text-sm text-muted mt-1">{{ ins.detail }}</p>
      </UPageCard>
    </UPageGrid>
  </UPage>
</template>
