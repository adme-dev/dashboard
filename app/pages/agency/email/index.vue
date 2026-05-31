<!-- app/pages/agency/email/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Email Marketing — XeroFlow Agency' })

const tab = ref<'lists' | 'subscribers'>('lists')
const tabs = [
  { value: 'lists', label: 'Lists', icon: 'i-lucide-list' },
  { value: 'subscribers', label: 'Subscribers', icon: 'i-lucide-users' }
]
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default">
      <h1 class="text-xl font-semibold">
        Email Marketing
      </h1>
      <p class="text-sm text-muted">
        Build lists, import subscribers, and (soon) send campaigns.
      </p>
    </header>

    <div class="px-6 pt-4">
      <UTabs v-model="tab" :items="tabs" />
    </div>

    <div class="flex-1 overflow-auto px-6 py-4">
      <EmailListsPanel v-if="tab === 'lists'" />
      <EmailSubscribersPanel v-else />
    </div>
  </div>
</template>
