<script setup lang="ts">
defineProps<{
  open: boolean
  destinations: string[]
  saving: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: []
}>()

function close() {
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="open"
    title="Confirm routing preset"
    description="The endpoint and these destinations will be created together."
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-muted">
          Review the exact destinations before applying this preset.
        </p>
        <ul class="space-y-2 text-sm">
          <li
            v-for="destination in destinations"
            :key="destination"
            class="flex items-center gap-2"
          >
            <UIcon name="i-lucide-route" class="size-4 text-muted" />
            <span>{{ destination }}</span>
          </li>
        </ul>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          type="button"
          label="Cancel"
          color="neutral"
          variant="ghost"
          autofocus
          :disabled="saving"
          @click="close"
        />
        <UButton
          type="button"
          label="Apply preset and create"
          icon="i-lucide-check"
          :loading="saving"
          :disabled="saving"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
