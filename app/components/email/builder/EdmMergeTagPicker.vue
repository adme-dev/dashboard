<script setup lang="ts">
import { inject, ref } from 'vue'
import { EDM_MERGE_AUTHORING } from '~~/app/composables/useEdmMergeTags'
import { BUILTIN_MERGE_CHOICES } from '~~/shared/emailRendering/mergeTagDefinitions'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ insert: [token: string] }>()
const authoring = inject(EDM_MERGE_AUTHORING, null)
const open = ref(false)
function insert(value: string) {
  emit('insert', value)
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'bottom', align: 'start' }">
    <UButton
      icon="i-lucide-braces"
      label="Insert tag"
      size="xs"
      color="neutral"
      variant="soft"
      :disabled="disabled"
      @mousedown.prevent
      @click.stop
    />
    <template #content>
      <div class="w-72 max-h-80 overflow-y-auto p-2 space-y-1 bg-default text-default" @click.stop>
        <p class="px-2 py-1 text-xs text-muted">
          Recipient fields use sender values at delivery.
        </p>
        <UButton
          v-for="choice in authoring?.choices.value || BUILTIN_MERGE_CHOICES"
          :key="choice.token"
          class="w-full justify-start"
          color="neutral"
          variant="ghost"
          @click="insert(choice.value)"
        >
          <span class="text-left"><span class="block text-sm">{{ choice.name }}</span><span class="block text-xs text-muted font-mono">{{ choice.value }}</span></span>
        </UButton>
        <p class="px-2 py-1 text-xs text-muted">
          Custom tags use their written fallback at delivery. Sample values are preview only.
        </p>
        <p v-if="authoring?.error.value" class="px-2 text-xs text-error">
          {{ authoring.error.value }}
        </p>
      </div>
    </template>
  </UPopover>
</template>
