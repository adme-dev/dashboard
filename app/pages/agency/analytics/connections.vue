<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })
useHead({ title: 'Analytics Data Sources - XeroFlow Agency' })

if (import.meta.client) {
  onMounted(() => {
    document.title = 'Analytics Data Sources - XeroFlow Agency'
  })
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-6xl space-y-5 p-6">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-sm text-muted">
            <NuxtLink to="/agency/analytics" class="hover:text-default transition-colors">
              Analytics
            </NuxtLink>
            <UIcon name="i-lucide-chevron-right" class="size-4" />
            <span>Data sources</span>
          </div>
          <h1 class="mt-2 text-2xl font-bold text-default">
            Analytics Data Sources
          </h1>
          <p class="mt-1 text-sm text-muted">
            Connect website analytics sources and map properties to agency clients.
          </p>
        </div>

        <UButton
          to="/agency/analytics"
          icon="i-lucide-arrow-left"
          label="Back to Analytics"
          color="neutral"
          variant="ghost"
          class="self-start sm:self-auto"
        />
      </div>

      <SocialGa4ConnectCard />
    </div>
  </div>
</template>
