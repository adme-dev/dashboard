<template>
  <div class="task-activity-feed">
    <UTabs :items="tabs" class="w-full" :unmount-on-hide="false">
      <template #content="{ item }">
        <div class="py-4">
          <!-- Updates Tab -->
          <template v-if="item.key === 'updates'">
            <TaskCommentThread
              :task-id="taskId"
              placeholder="Write an update and mention others with @"
            />
          </template>

          <!-- Files Tab -->
          <template v-else-if="item.key === 'files'">
            <div class="text-center py-8 text-gray-500">
              <UIcon name="i-lucide-folder-open" class="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No files attached</p>
              <UButton
                variant="soft"
                color="primary"
                size="sm"
                class="mt-2"
                @click="showFileUpload = true"
              >
                Upload File
              </UButton>
            </div>
          </template>

          <!-- Activity Log Tab -->
          <template v-else-if="item.key === 'activity'">
            <TaskActivityLog :task-id="taskId" />
          </template>

          <!-- Info Tab -->
          <template v-else-if="item.key === 'info'">
            <TaskInfo :task-id="taskId" />
          </template>
        </div>
      </template>
    </UTabs>
  </div>
</template>

<script setup lang="ts">
interface Props {
  taskId: string
}

const props = defineProps<Props>()

const tabs = [
  {
    key: 'updates',
    label: 'Updates',
    icon: 'i-lucide-message-square'
  },
  {
    key: 'files',
    label: 'Files',
    icon: 'i-lucide-paperclip'
  },
  {
    key: 'activity',
    label: 'Activity Log',
    icon: 'i-lucide-activity'
  },
  {
    key: 'info',
    label: 'Info',
    icon: 'i-lucide-info'
  }
]

const showFileUpload = ref(false)
</script>

<style scoped>
.task-activity-feed :deep(.u-tabs-list) {
  border-bottom: 1px solid #e5e7eb;
}
</style>
