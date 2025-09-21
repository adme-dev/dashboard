<script setup lang="ts">
const { data, pending, error, refresh } = await useFetch('/api/ai/anomalies')
</script>

<template>
  <UPage>
    <UPageHeader title="Anomalies" description="Detected issues in revenue and expenses">
      <template #right>
        <UButton label="Refresh" color="neutral" @click="refresh" />
      </template>
    </UPageHeader>

    <div v-if="pending">Scanning…</div>
    <div v-else-if="error">Failed to load anomalies.</div>

    <UPageCard v-else variant="subtle">
      <div v-if="!data?.anomalies?.length" class="text-sm text-muted">No anomalies detected.</div>
      <ul v-else class="space-y-2">
        <li v-for="(a, i) in data?.anomalies" :key="i" class="flex items-center gap-2">
          <UBadge :color="a.severity === 'warning' ? 'error' : 'neutral'">{{ a.type }}</UBadge>
          <span>{{ a.message }}</span>
        </li>
      </ul>
    </UPageCard>
  </UPage>
</template>
