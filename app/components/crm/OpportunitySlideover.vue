<script setup lang="ts">
import type { CrmOpportunity, CrmStage } from '~/types/crm'

const props = defineProps<{ open: boolean, clientId: string, record: CrmOpportunity | null, stages: CrmStage[] }>()
const emit = defineEmits<{ 'update:open': [boolean], 'save': [Record<string, unknown>] }>()
const title = computed(() => props.record ? 'Edit opportunity' : 'New opportunity')
</script>

<template>
  <USlideover :open="open" :title="title" @update:open="emit('update:open', $event)">
    <template #body>
      <CrmOpportunityForm
        :client-id="clientId"
        :record="record"
        :stages="stages"
        @submit="(b) => emit('save', b)"
        @cancel="emit('update:open', false)"
      />
    </template>
  </USlideover>
</template>
