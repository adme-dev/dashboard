<!-- app/pages/agency/email/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Email Marketing — XeroFlow Agency' })

const tab = ref<'lists' | 'subscribers' | 'suppressions' | 'templates' | 'campaigns'>('lists')
const tabs = [
  { value: 'lists', label: 'Lists', icon: 'i-lucide-list' },
  { value: 'subscribers', label: 'Subscribers', icon: 'i-lucide-users' },
  { value: 'suppressions', label: 'Suppressions', icon: 'i-lucide-shield-ban' },
  { value: 'templates', label: 'Templates', icon: 'i-lucide-layout-template' },
  { value: 'campaigns', label: 'Campaigns', icon: 'i-lucide-send' }
]
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">
          Email Marketing
        </h1>
        <p class="text-sm text-muted">
          Build lists, import subscribers, and (soon) send campaigns.
        </p>
      </div>
      <UButton
        to="/agency/email/compose"
        icon="i-lucide-pen-line"
        color="primary"
        label="Compose email"
      />
    </header>

    <div class="px-6 pt-4">
      <UTabs v-model="tab" :items="tabs" />
    </div>

    <div class="flex-1 overflow-auto px-6 py-4">
      <EmailListsPanel v-if="tab === 'lists'" />
      <EmailSubscribersPanel v-else-if="tab === 'subscribers'" />
      <EmailSuppressionPanel v-else-if="tab === 'suppressions'" />
      <EmailTemplatesPanel v-else-if="tab === 'templates'" />
      <EmailCampaignsPanel v-else-if="tab === 'campaigns'" />
    </div>
  </div>
</template>
