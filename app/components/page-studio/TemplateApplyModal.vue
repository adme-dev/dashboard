<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
defineProps<{ kind: 'page' | 'site', name: string, pageCount?: number }>()
const emit = defineEmits<{ confirm: [], cancel: [] }>()

function cancel() {
  open.value = false
  emit('cancel')
}

function confirm() {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :title="`Apply ${name}?`">
    <template #content>
      <div class="space-y-5 p-6">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">
            Apply {{ name }}?
          </h2>
          <p class="mt-2 text-sm leading-6 text-muted">
            <template v-if="kind === 'site'">
              This replaces the complete unsaved draft with {{ pageCount }} new pages and its site shell.
            </template>
            <template v-else>
              This replaces every section on the selected page in the unsaved draft.
            </template>
          </p>
        </div>
        <UAlert
          title="Production is unchanged"
          description="Nothing is saved or published until you explicitly save the draft and complete the review workflow."
          color="neutral"
          variant="subtle"
          icon="i-lucide-shield-check"
        />
        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            @click="cancel"
          />
          <UButton :label="kind === 'site' ? 'Replace draft site' : 'Replace page sections'" icon="i-lucide-layout-template" @click="confirm" />
        </div>
      </div>
    </template>
  </UModal>
</template>
