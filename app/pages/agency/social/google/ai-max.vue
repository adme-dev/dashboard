<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

useSeoMeta({
  title: 'Google Ads AI Max Readiness | XeroFlow',
  description: 'Review Google Search campaign AI Max migration exposure and effective controls.'
})
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8">
    <SocialSpendSectionNav class="mb-5" />
    <ClientOnly>
      <SocialSpendAiMaxReadiness />
      <template #fallback>
        <UCard>
          <div class="flex items-center gap-2 text-sm text-muted" role="status">
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
            Loading Google AI Max readiness…
          </div>
        </UCard>
      </template>
    </ClientOnly>
  </div>
</template>
