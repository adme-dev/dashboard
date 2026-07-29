<script setup lang="ts">
definePageMeta({ layout: 'agency' })

useHead({ title: 'Leads — XeroFlow Agency' })

const route = useRoute()
const tab = ref<'inbox' | 'rules' | 'email'>('inbox')
const showSetupGuide = ref(false)
const routedLeadId = computed(() =>
  typeof route.query.leadId === 'string' ? route.query.leadId : null
)

const tabs = [
  { value: 'inbox', label: 'Inbox', icon: 'i-lucide-inbox' },
  { value: 'rules', label: 'Form rules', icon: 'i-lucide-list-checks' },
  { value: 'email', label: 'Email addresses', icon: 'i-lucide-mail' }
] satisfies Array<{ value: 'inbox' | 'rules' | 'email'; label: string; icon: string }>

function openSetupGuide() {
  showSetupGuide.value = true
}

function selectTab(value: 'inbox' | 'rules' | 'email') {
  tab.value = value
}

function openRules() {
  tab.value = 'rules'
}
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="flex flex-col gap-3 border-b border-default px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 class="text-xl font-semibold">
          Leads
        </h1>
        <p class="text-sm text-muted">
          Route Google, Meta, email, webhook, and CSV leads without rebuilding Zaps.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          variant="ghost"
          color="neutral"
          icon="i-lucide-help-circle"
          label="Setup guide"
          @click="openSetupGuide"
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
            @click="selectTab(item.value)"
          />
        </div>
      </div>
    </header>

    <div class="flex-1 min-h-0">
      <LeadsInbox
        v-if="tab === 'inbox'"
        :lead-id="routedLeadId"
        @show-help="openSetupGuide"
        @show-rules="openRules"
      />
      <LeadsFormRulesTab
        v-else-if="tab === 'rules'"
        @open-setup-guide="openSetupGuide"
      />
      <LeadsEmailEndpointsTab
        v-else
        @open-rules="openRules"
      />
    </div>

    <LeadsSetupGuide v-model:open="showSetupGuide" />
  </div>
</template>
