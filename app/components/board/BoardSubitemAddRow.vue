<template>
  <div class="flex items-center border-b border-gray-100 dark:border-neutral-700/50 bg-gray-50/50 dark:bg-neutral-800/50 border-l-2 border-l-blue-400/40">
    <!-- Checkbox placeholder -->
    <div class="w-10 px-2 py-2 border-r border-gray-200 dark:border-neutral-700" />

    <!-- Add input -->
    <div class="flex-shrink-0 px-4 py-1.5 border-r border-gray-200 dark:border-neutral-700" :style="{ width: itemColWidth + 'px' }">
      <div class="flex items-center gap-1.5 pl-6">
        <UIcon name="i-lucide-plus" class="w-3.5 h-3.5 text-gray-400 dark:text-neutral-500 flex-shrink-0" />
        <input
          v-model="newTitle"
          type="text"
          placeholder="+ Add subitem"
          class="flex-1 text-sm bg-transparent border-none outline-none text-gray-600 dark:text-neutral-400 placeholder-gray-400 dark:placeholder-neutral-500"
          @keydown.enter="handleAdd"
        />
        <!-- Cross-board task button -->
        <UTooltip text="Create task on another board">
          <button
            class="p-1 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-400 dark:text-neutral-500 hover:text-blue-500 transition-colors flex-shrink-0"
            @click.stop="$emit('createCrossBoard')"
          >
            <UIcon name="i-lucide-git-branch" class="w-3.5 h-3.5" />
          </button>
        </UTooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  parentTaskId: string
  boardId: string
}>()

defineEmits<{
  createCrossBoard: []
}>()

const newTitle = ref('')
const { addSubitem } = useBoardSubitems()
const toast = useToast()
const itemColWidth = inject<Ref<number>>('itemColWidth', ref(320))

async function handleAdd() {
  const title = newTitle.value.trim()
  if (!title) return

  try {
    await addSubitem(props.parentTaskId, title, props.boardId)
    newTitle.value = ''
  } catch (err: any) {
    toast.add({
      title: 'Failed to add subitem',
      description: err?.data?.statusMessage || 'Something went wrong',
      color: 'error',
    })
  }
}
</script>
