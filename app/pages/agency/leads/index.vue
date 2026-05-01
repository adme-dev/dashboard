<script setup lang="ts">
definePageMeta({ layout: 'agency' })

useHead({ title: 'Leads — XeroFlow Agency' })

const tab = ref<'inbox' | 'rules'>('inbox')

const tabs = [
  { value: 'inbox', label: 'Inbox', icon: 'i-lucide-inbox' },
  { value: 'rules', label: 'Form rules', icon: 'i-lucide-list-checks' },
]
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">Leads</h1>
        <p class="text-sm text-muted">Real-time inbox for Meta + Google ad inquiries</p>
      </div>
      <UTabs v-model="tab" :items="tabs" />
    </header>

    <div class="flex-1 min-h-0">
      <LeadsInbox v-if="tab === 'inbox'" />
      <LeadsFormRulesTab v-else />
    </div>
  </div>
</template>
