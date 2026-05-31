<script setup lang="ts">
const props = defineProps<{
  open: boolean
  objectType: 'person' | 'company'
  clientId: string
  record: Record<string, any> | null
}>()
const emit = defineEmits<{ 'update:open': [boolean], 'save': [Record<string, unknown>] }>()

const title = computed(() =>
  (props.record ? 'Edit ' : 'New ') + (props.objectType === 'person' ? 'person' : 'company'),
)
</script>

<template>
  <USlideover
    :open="open"
    :title="title"
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
    </template>
  </USlideover>
</template>
