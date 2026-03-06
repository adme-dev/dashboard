<template>
  <div class="bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 w-80">
    <!-- Header -->
    <div class="p-3 border-b border-gray-200 dark:border-neutral-700 flex items-center justify-between">
      <h4 class="text-sm font-medium text-gray-900 dark:text-neutral-100">Linked Items</h4>
      <button @click="$emit('close')" class="text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300">
        <UIcon name="i-lucide-x" class="w-4 h-4" />
      </button>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="px-3 py-6 text-center">
      <span class="text-sm text-gray-400 dark:text-neutral-500">Loading...</span>
    </div>

    <!-- Current links list -->
    <template v-else>
      <div v-if="links.length" class="max-h-48 overflow-y-auto py-1">
        <div
          v-for="link in links"
          :key="link.id"
          class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-neutral-800 group"
        >
          <UIcon name="i-lucide-link-2" class="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <NuxtLink
            :to="`/agency/boards/${link.task.boardSlug}?task=${link.task.id}`"
            class="text-sm text-blue-600 dark:text-blue-400 hover:underline truncate flex-1"
            @click.stop
          >
            {{ link.task.title }}
          </NuxtLink>
          <UBadge size="xs" variant="subtle" color="neutral" class="shrink-0">{{ link.task.boardName }}</UBadge>
          <button
            @click="unlinkItem(link.id)"
            class="text-gray-400 dark:text-neutral-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p v-else class="px-3 py-4 text-sm text-gray-400 dark:text-neutral-500 text-center">No linked items</p>
    </template>

    <!-- Search section -->
    <div class="p-2 border-t border-gray-200 dark:border-neutral-700">
      <UInput
        v-model="searchQuery"
        placeholder="Search tasks to link..."
        icon="i-lucide-search"
        size="sm"
        autofocus
      />
    </div>

    <!-- Search results -->
    <div v-if="searchResults.length" class="max-h-48 overflow-y-auto border-t border-gray-200 dark:border-neutral-700 py-1">
      <button
        v-for="task in searchResults"
        :key="task.id"
        class="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-neutral-800 w-full text-left"
        @click="linkItem(task.id)"
      >
        <UIcon name="i-lucide-plus" class="w-3.5 h-3.5 text-green-500 shrink-0" />
        <span class="text-sm text-gray-700 dark:text-neutral-300 truncate flex-1">{{ task.title }}</span>
        <UBadge size="xs" variant="subtle" color="neutral" class="shrink-0">{{ task.boardName }}</UBadge>
      </button>
    </div>
    <div v-else-if="searchQuery.length >= 2 && !searching" class="px-3 py-3 border-t border-gray-200 dark:border-neutral-700 text-center">
      <span class="text-xs text-gray-400 dark:text-neutral-500">No tasks found</span>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  taskId: string
}>()

const emit = defineEmits<{
  close: []
  updated: [count: number]
}>()

const toast = useToast()

interface LinkedTask {
  id: string
  title: string
  boardSlug: string
  boardName: string
}

interface LinkedItem {
  id: string
  linkType: string
  task: LinkedTask
}

interface SearchResult {
  id: string
  title: string
  boardName: string
}

const links = ref<LinkedItem[]>([])
const loading = ref(true)
const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

async function fetchLinks() {
  try {
    const data = await $fetch<{ linkedItems: LinkedItem[] }>(`/api/agency/tasks/${props.taskId}/linked-items`)
    links.value = data.linkedItems || []
  } catch (e: any) {
    toast.add({ title: 'Error', description: 'Failed to load linked items', color: 'error' })
  } finally {
    loading.value = false
  }
}

async function searchTasks(q: string) {
  if (q.length < 2) {
    searchResults.value = []
    return
  }
  searching.value = true
  try {
    const data = await $fetch<{ tasks: SearchResult[] }>(`/api/agency/tasks/search`, {
      params: { q, excludeTaskId: props.taskId },
    })
    const linkedIds = new Set(links.value.map(l => l.task.id))
    searchResults.value = (data.tasks || []).filter(t => !linkedIds.has(t.id))
  } catch {
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

async function linkItem(linkedTaskId: string) {
  try {
    await $fetch(`/api/agency/tasks/${props.taskId}/linked-items`, {
      method: 'POST',
      body: { linkedTaskId },
    })
    searchQuery.value = ''
    searchResults.value = []
    await fetchLinks()
    emit('updated', links.value.length)
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.statusMessage || 'Failed to link item', color: 'error' })
  }
}

async function unlinkItem(linkId: string) {
  try {
    await $fetch(`/api/agency/tasks/${props.taskId}/linked-items/${linkId}`, {
      method: 'DELETE',
    })
    await fetchLinks()
    emit('updated', links.value.length)
  } catch (e: any) {
    toast.add({ title: 'Error', description: 'Failed to unlink item', color: 'error' })
  }
}

watch(searchQuery, (val) => {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => searchTasks(val), 300)
})

onMounted(fetchLinks)
</script>
