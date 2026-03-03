<template>
  <div class="flex items-center bg-gray-50/50 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-700">
    <div class="w-10 px-2 py-2 border-r border-gray-200 dark:border-neutral-700"></div>
    <div class="flex-1 min-w-[250px] px-4 py-2">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-plus" class="w-4 h-4 text-gray-400 dark:text-neutral-500" />
        <input
          ref="inputRef"
          v-model="title"
          type="text"
          :placeholder="placeholder"
          class="flex-1 bg-transparent border-none outline-none text-sm placeholder-gray-400 dark:placeholder-neutral-500"
          :disabled="loading"
          @keydown.enter="handleAdd"
          @click.stop
        />
        <UIcon
          v-if="loading"
          name="i-lucide-loader-2"
          class="w-4 h-4 animate-spin text-gray-400 dark:text-neutral-500"
        />
      </div>
    </div>
    <div
      v-for="col in columns"
      :key="col.id"
      class="px-4 py-2 border-r border-gray-200 dark:border-neutral-700"
      :style="{ width: (col.width || 150) + 'px' }"
    />
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  groupId: string
  columns: { id: string; width?: number }[]
  placeholder?: string
}>(), {
  placeholder: 'Add item',
})

const emit = defineEmits<{
  add: [payload: { groupId: string; title: string }]
}>()

const title = ref('')
const loading = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

async function handleAdd() {
  const trimmed = title.value.trim()
  if (!trimmed || loading.value) return

  loading.value = true
  try {
    emit('add', { groupId: props.groupId, title: trimmed })
    title.value = ''
  } finally {
    loading.value = false
  }
}

function focus() {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>
