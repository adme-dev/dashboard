<script setup lang="ts">
import type { BannerBrandKit } from '~/types/banner-studio'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const toast = useToast()

function handleApply(kit: BannerBrandKit) {
  toast.add({
    title: 'Brand kit selected',
    description: `Open a project in the editor to apply "${kit.name}"`,
    color: 'info',
  })
}
</script>

<template>
  <div class="max-w-5xl mx-auto p-6">
    <div class="flex items-center gap-3 mb-6">
      <UButton
        icon="i-lucide-arrow-left"
        variant="ghost"
        size="sm"
        to="/agency/banner-studio"
      />
      <BrandCube color="purple" :size="32" :animated="false" />
      <div>
        <h1 class="text-xl font-bold text-(--ui-text)">Brand Kits</h1>
        <p class="text-sm text-(--ui-text-muted)">Manage brand colors, fonts and logos for your banner projects</p>
      </div>
    </div>

    <BannerBrandKitManager @apply="handleApply" />
  </div>
</template>
