<script setup lang="ts">
const props = defineProps<{ disabled?: boolean; disabledReason?: string; sending?: boolean }>()
const emit = defineEmits<{ send: [content: string] }>()

const draft = ref('')
function send() {
  const c = draft.value.trim()
  if (!c) return
  emit('send', c)
  draft.value = ''
}
</script>

<template>
  <div class="p-3 border-t border-default">
    <UTooltip :text="disabledReason || ''" :disabled="!disabled || !disabledReason">
      <div class="flex flex-col gap-2">
        <UTextarea
          v-model="draft" :rows="3" :disabled="disabled || sending" autoresize
          placeholder="Write a reply…" aria-label="Reply"
          class="w-full ring-1 ring-default rounded-md"
        />
        <div class="flex justify-end">
          <UButton
            label="Send reply" icon="i-lucide-send" :loading="sending"
            :disabled="disabled || !draft.trim()" @click="send"
          />
        </div>
      </div>
    </UTooltip>
  </div>
</template>
