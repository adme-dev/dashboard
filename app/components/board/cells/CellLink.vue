<template>
  <div class="min-h-[28px] flex items-center" @click.stop="startEditing">
    <template v-if="editing">
      <div class="flex items-center gap-1 w-full" @click.stop>
        <input
          ref="inputRef"
          v-model="localUrl"
          type="url"
          placeholder="https://..."
          class="flex-1 px-1 py-0.5 text-sm border rounded outline-none focus:border-blue-500 bg-white"
          @keydown.enter="save"
          @keydown.escape="cancel"
        />
        <UButton size="xs" color="primary" @click="save">OK</UButton>
      </div>
    </template>
    <template v-else>
      <a
        v-if="displayUrl"
        :href="displayUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-sm text-blue-600 hover:underline truncate flex items-center gap-1"
        @click.stop
      >
        <UIcon name="i-lucide-external-link" class="w-3.5 h-3.5 flex-shrink-0" />
        <span class="truncate">{{ displayLabel }}</span>
      </a>
      <span v-else class="text-sm text-gray-400 cursor-text hover:bg-gray-100 px-1 py-0.5 rounded">-</span>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'

const props = defineProps<{
  column: CustomColumn
  value: TaskColumnValue | null
  taskId: string
  readonly?: boolean
}>()

const emit = defineEmits<{ update: [payload: any] }>()

const editing = ref(false)
const localUrl = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const displayUrl = computed(() => props.value?.textValue || '')
const displayLabel = computed(() => {
  const label = props.value?.jsonValue?.label
  if (label) return label
  try {
    return new URL(displayUrl.value).hostname
  } catch {
    return displayUrl.value
  }
})

function startEditing() {
  if (props.readonly) return
  localUrl.value = displayUrl.value
  editing.value = true
  nextTick(() => inputRef.value?.focus())
}

function save() {
  editing.value = false
  if (localUrl.value !== displayUrl.value) {
    emit('update', { textValue: localUrl.value || null })
  }
}

function cancel() {
  editing.value = false
}
</script>
