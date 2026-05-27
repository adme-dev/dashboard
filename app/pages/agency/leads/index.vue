<script setup lang="ts">
definePageMeta({ layout: 'agency' })

useHead({ title: 'Leads — XeroFlow Agency' })

const tab = ref<'inbox' | 'rules'>('inbox')
const showSetupGuide = ref(false)

const tabs = [
  { value: 'inbox', label: 'Inbox', icon: 'i-lucide-inbox' },
  { value: 'rules', label: 'Form rules', icon: 'i-lucide-list-checks' }
]
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">
          Leads
        </h1>
        <p class="text-sm text-muted">
          Route Google, Meta, webhook, and CSV leads without rebuilding Zaps.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-help-circle"
          label="Setup guide"
          @click="showSetupGuide = true"
        />
        <div role="tablist" aria-label="Lead sections" class="flex rounded-md bg-elevated p-1">
          <UButton
            v-for="item in tabs"
            :key="item.value"
            :icon="item.icon"
            :label="item.label"
            :color="tab === item.value ? 'primary' : 'neutral'"
            :variant="tab === item.value ? 'solid' : 'ghost'"
            role="tab"
            :aria-selected="tab === item.value"
            size="sm"
            @click="tab = item.value"
          />
        </div>
      </div>
    </header>

    <div class="flex-1 min-h-0">
      <LeadsInbox
        v-if="tab === 'inbox'"
        @show-help="showSetupGuide = true"
        @show-rules="tab = 'rules'"
      />
      <LeadsFormRulesTab v-else />
    </div>

    <LeadsSetupGuide v-model:open="showSetupGuide" />
  </div>
</template>
