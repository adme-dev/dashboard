<script setup lang="ts">
const props = defineProps<{ disabled?: boolean; disabledReason?: string; sending?: boolean; conversationId?: string | null }>()
const emit = defineEmits<{ send: [content: string] }>()

const draft = ref('')
const aiDrafting = ref(false)
const toast = useToast()

function send() {
  const c = draft.value.trim()
  if (!c) return
  emit('send', c)
  draft.value = ''
}

async function aiDraft() {
  if (!props.conversationId) return
  aiDrafting.value = true
  try {
    const res = await $fetch<{ reply: string; confidence: number; risk: boolean }>(
      `/api/agency/social/inbox/conversations/${props.conversationId}/ai-draft`, { method: 'POST', body: {} })
    if (!res.reply) {
      toast.add({ title: 'No draft', description: 'This one needs a human — the model flagged it.', color: 'warning' })
    } else {
      draft.value = res.reply
      if (res.risk || (res.confidence ?? 0) < 0.6) {
        toast.add({
          title: 'Review carefully',
          description: `Low confidence (${Math.round(res.confidence * 100)}%) — edit before sending.`,
          color: 'warning',
        })
      }
    }
  } catch (e: any) {
    toast.add({ title: 'AI draft failed', description: e?.data?.statusMessage || e?.message || 'Try again', color: 'error' })
  } finally {
    aiDrafting.value = false
  }
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
        <div class="flex justify-end gap-2">
          <UButton
            v-if="conversationId"
            label="AI draft" icon="i-lucide-sparkles" color="neutral" variant="ghost"
            :loading="aiDrafting" :disabled="disabled || aiDrafting" @click="aiDraft"
          />
          <UButton
            label="Send reply" icon="i-lucide-send" :loading="sending"
            :disabled="disabled || !draft.trim()" @click="send"
          />
        </div>
      </div>
    </UTooltip>
  </div>
</template>
