<template>
  <UModal v-model:open="open" :title="title" :ui="{ content: 'max-w-3xl' }">
    <template #content>
      <div class="p-5 space-y-4">
        <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
          Generating prompt…
        </div>

        <UAlert
          v-else-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="errorMessage"
        />

        <template v-else>
          <p class="text-sm text-muted">
            Drop this into Claude Code, Cursor, or whichever IDE-AI you use.
            It includes the task, the QA checklist, and a pointer to the codebase graph.
          </p>

          <UTextarea
            v-model="prompt"
            :rows="18"
            class="font-mono text-xs"
            :ui="{ base: 'leading-snug' }"
            spellcheck="false"
          />

          <div class="flex items-center justify-between gap-2 pt-1">
            <p class="text-xs text-muted">
              {{ prompt.length.toLocaleString() }} chars · subtasks rendered live
              <a v-if="boardLink" :href="boardLink" target="_blank" class="ml-2 text-primary underline">
                board ↗
              </a>
            </p>

            <div class="flex items-center gap-2">
              <UButton color="neutral" variant="ghost" @click="open = false">
                Close
              </UButton>
              <UButton
                color="primary"
                :icon="copied ? 'i-lucide-check' : 'i-lucide-clipboard'"
                @click="copy"
              >
                {{ copied ? 'Copied' : 'Copy prompt' }}
              </UButton>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  boardId: string
  taskId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const toast = useToast()

const open = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const loading = ref(false)
const errorMessage = ref<string | null>(null)
const prompt = ref('')
const title = ref('IDE prompt')
const boardLink = ref<string | null>(null)
const copied = ref(false)

async function load(taskId: string) {
  loading.value = true
  errorMessage.value = null
  prompt.value = ''
  copied.value = false
  try {
    const res = await $fetch<{ taskId: string; title: string; boardName: string; boardLink: string; prompt: string }>(
      `/api/agency/boards/${props.boardId}/tasks/${taskId}/ide-prompt`,
    )
    title.value = `IDE prompt — ${res.title}`
    prompt.value = res.prompt
    boardLink.value = res.boardLink
  } catch (err: any) {
    errorMessage.value = err?.statusMessage || err?.data?.statusMessage || err?.message || 'Failed to generate prompt'
  } finally {
    loading.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(prompt.value)
    copied.value = true
    toast.add({ title: 'Prompt copied', description: 'Paste into your IDE chat.', color: 'success' })
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    toast.add({ title: 'Copy failed', description: 'Select the text and copy manually.', color: 'error' })
  }
}

watch(
  () => [props.modelValue, props.taskId] as const,
  ([isOpen, taskId]) => {
    if (isOpen && taskId) load(taskId)
  },
  { immediate: true },
)
</script>
