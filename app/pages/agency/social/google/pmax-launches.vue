<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const PmaxLaunchControl = defineAsyncComponent(
  () => import('~/components/social/GooglePmaxLaunchControl.client.vue')
)

definePageMeta({ layout: 'agency', middleware: ['role-media'] })

useSeoMeta({
  title: 'Google PMax Inventory Launches | XeroFlow',
  description: 'Govern Google Vehicle Ads launches from approved brief through paused creation and separately approved activation.'
})
</script>

<template>
  <div class="p-4 sm:p-6 lg:p-8">
    <SocialSpendSectionNav class="mb-5" />
    <ClientOnly>
      <PmaxLaunchControl />
    </ClientOnly>
  </div>
</template>
