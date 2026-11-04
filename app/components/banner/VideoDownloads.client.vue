<script setup lang="ts">
const props = defineProps<{
  open: boolean
  projectId: string
  projectName: string
  clientId?: string | null
  editorUrl: string
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <UModal
    :open="props.open"
    title="MP4 downloads"
    :description="props.projectName"
    :ui="{ content: 'sm:max-w-xl', body: 'max-h-[70svh] overflow-y-auto' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <BannerVideoResults
        v-if="props.open"
        :key="props.projectId"
        :project-id="props.projectId"
        :client-id="props.clientId"
        :completed="[]"
        :open="props.open"
        download-only
      />
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Open editor for a new export"
          icon="i-lucide-pencil"
          color="neutral"
          variant="outline"
          :to="props.editorUrl"
        />
        <UButton label="Done" @click="emit('update:open', false)" />
      </div>
    </template>
  </UModal>
</template>
