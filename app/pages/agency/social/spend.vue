<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

useSeoMeta({ title: 'Ad Spend | XeroFlow' })
</script>

<template>
  <ClientOnly>
    <SocialSpendDashboard />
    <template #fallback>
      <div class="p-6 lg:p-8">
        <UCard>
          <div class="flex items-center gap-2 text-sm text-muted" role="status">
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
            Loading ad spend workspace…
          </div>
        </UCard>
      </div>
    </template>
  </ClientOnly>
</template>
