<script setup lang="ts">
defineProps<{
  accountName?: string
}>()
</script>

<template>
  <div class="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
    <UIcon name="i-lucide-shield-alert" class="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
    <div class="min-w-0">
      <p class="text-sm font-medium text-amber-500">Missing Ads Management Permission</p>
      <p class="text-xs text-(--ui-text-muted) mt-0.5">
        {{ accountName || 'This account' }} has read-only access. To publish ads, reconnect with the
        <span class="font-mono text-xs">ads_management</span> scope enabled.
      </p>
      <NuxtLink to="/agency/social/settings" class="inline-flex items-center gap-1 text-xs text-amber-500 hover:underline mt-1.5">
        <UIcon name="i-lucide-external-link" class="w-3 h-3" />
        Go to Social Settings
      </NuxtLink>
    </div>
  </div>
</template>
