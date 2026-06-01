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
        :key="record?.id ?? 'new'"
        :client-id="clientId"
        :record="record"
        :stages="stages"
        @submit="(b) => emit('save', b)"
        @cancel="emit('update:open', false)"
      />
      <template v-if="record?.id">
        <USeparator class="my-4" />
        <CrmLineItems :client-id="clientId" :opportunity="record" />
        <USeparator class="my-4" />
        <CrmTaskList :client-id="clientId" target-type="opportunity" :target-id="record.id" />
        <USeparator class="my-4" />
        <CrmDocuments :client-id="clientId" target-type="opportunity" :target-id="record.id" />
        <USeparator class="my-4" />
        <h3 class="text-sm font-medium text-muted mb-3">Activity</h3>
        <CrmActivityTimeline :client-id="clientId" target-type="opportunity" :target-id="record.id" />
        <USeparator class="my-4" />
        <CrmAuditHistory :client-id="clientId" entity-type="opportunity" :entity-id="record.id" />
      </template>
    </template>
  </USlideover>
</template>
