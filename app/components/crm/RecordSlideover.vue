<script setup lang="ts">
type CrmRecord = Record<string, unknown> & { id: string }

const props = defineProps<{
  open: boolean
  objectType: 'person' | 'company'
  clientId: string
  record: CrmRecord | null
}>()
const emit = defineEmits<{ 'update:open': [boolean], 'save': [Record<string, unknown>] }>()

const title = computed(() =>
  (props.record ? 'Edit ' : 'New ') + (props.objectType === 'person' ? 'person' : 'company')
)
</script>

<template>
  <USlideover
    :open="open"
    :title="title"
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <CrmRecordForm
        :object-type="objectType"
        :client-id="clientId"
        :record="record"
        @submit="(body) => emit('save', body)"
        @cancel="emit('update:open', false)"
      />
      <template v-if="record?.id">
        <template v-if="objectType === 'person'">
          <USeparator class="my-4" />
          <CrmContactPrefs :client-id="clientId" :record="record" />
        </template>
        <USeparator class="my-4" />
        <CrmScorePanel :client-id="clientId" :target-type="objectType" :target-id="record.id" />
        <USeparator class="my-4" />
        <CrmHealthPanel :client-id="clientId" :target-type="objectType" :target-id="record.id" />
        <USeparator class="my-4" />
        <CrmRelationshipsPanel :client-id="clientId" :target-type="objectType" :target-id="record.id" />
        <USeparator class="my-4" />
        <CrmTaskList :client-id="clientId" :target-type="objectType" :target-id="record.id" />
        <CrmMeetingActions :client-id="clientId" :target-type="objectType" :target-id="record.id" />
        <USeparator class="my-4" />
        <CrmDocuments :client-id="clientId" :target-type="objectType" :target-id="record.id" />
        <USeparator class="my-4" />
        <h3 class="text-sm font-medium text-muted mb-3">
          Communications &amp; activity
        </h3>
        <CrmCommTimeline :client-id="clientId" :target-type="objectType" :target-id="record.id" />
        <USeparator class="my-4" />
        <CrmAuditHistory :client-id="clientId" :entity-type="objectType" :entity-id="record.id" />
      </template>
    </template>
  </USlideover>
</template>
