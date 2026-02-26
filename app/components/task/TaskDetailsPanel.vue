<template>
  <div class="space-y-1">
    <!-- Info Section -->
    <div class="border rounded-lg">
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
        @click="showInfo = !showInfo"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="w-4 h-4 text-gray-500" />
          <span>Info</span>
        </div>
        <UIcon
          :name="showInfo ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="w-4 h-4 text-gray-400"
        />
      </button>
      <div v-if="showInfo" class="px-4 pb-4 border-t">
        <TaskInfo :task-id="taskId" />
      </div>
    </div>

    <!-- Files Section -->
    <div class="border rounded-lg">
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
        @click="showFiles = !showFiles"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-paperclip" class="w-4 h-4 text-gray-500" />
          <span>Files</span>
        </div>
        <UIcon
          :name="showFiles ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="w-4 h-4 text-gray-400"
        />
      </button>
      <div v-if="showFiles" class="px-4 pb-4 border-t space-y-3">
        <div class="flex items-center gap-3 pt-3">
          <UButton icon="i-lucide-plus" variant="outline" size="sm">Add file</UButton>
          <UInput
            placeholder="Search for files"
            icon="i-lucide-search"
            size="sm"
            class="flex-1"
          />
        </div>
        <p class="text-sm text-gray-500">No files attached yet.</p>
      </div>
    </div>

    <!-- Activity Log Section -->
    <div class="border rounded-lg">
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 transition-colors"
        @click="showActivity = !showActivity"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-activity" class="w-4 h-4 text-gray-500" />
          <span>Activity Log</span>
        </div>
        <UIcon
          :name="showActivity ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="w-4 h-4 text-gray-400"
        />
      </button>
      <div v-if="showActivity" class="px-4 pb-4 border-t">
        <TaskActivityLog :task-id="taskId" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  taskId: string
}

defineProps<Props>()

const showInfo = ref(true)
const showFiles = ref(false)
const showActivity = ref(false)
</script>
