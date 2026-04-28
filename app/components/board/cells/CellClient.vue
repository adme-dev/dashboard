<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="flex items-center gap-1 min-h-[28px] px-1 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 cursor-pointer w-full"
      @click="togglePicker"
    >
      <span v-if="selectedClient" class="text-sm truncate">{{ selectedClient.name }}</span>
      <span v-else class="text-gray-400 dark:text-neutral-500 text-sm">-</span>
    </div>

    <!-- Client Selector Popover -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 w-72"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <!-- Search -->
        <div class="p-3 border-b border-gray-200 dark:border-neutral-700">
          <div class="relative">
            <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search clients..."
              class="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-md outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <!-- Client List -->
        <div class="max-h-64 overflow-y-auto py-1">
          <!-- Clear option -->
          <button
            v-if="selectedClientId"
            class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors text-gray-400 dark:text-neutral-500"
            @click="selectClient(null)"
          >
            <UIcon name="i-lucide-x" class="w-4 h-4" />
            <span class="text-sm">Clear</span>
          </button>

          <button
            v-for="client in filteredClients"
            :key="client.id"
            class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
            :class="{ 'bg-blue-50 dark:bg-blue-900/30': selectedClientId === client.id }"
            @click="selectClient(client)"
          >
            <div class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-medium flex-shrink-0">
              {{ getInitials(client.name) }}
            </div>
            <div class="text-left flex-1 min-w-0">
              <div class="text-sm font-medium text-gray-900 dark:text-neutral-100 truncate">{{ client.name }}</div>
              <div v-if="client.activeProjects" class="text-xs text-gray-500 dark:text-neutral-400">{{ client.activeProjects }} active project{{ client.activeProjects !== 1 ? 's' : '' }}</div>
            </div>
            <UIcon v-if="selectedClientId === client.id" name="i-lucide-check" class="w-4 h-4 text-blue-600 flex-shrink-0" />
          </button>

          <p v-if="!filteredClients.length && searchQuery" class="px-3 py-3 text-sm text-gray-400 dark:text-neutral-500 text-center">No matching clients</p>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { CustomColumn, TaskColumnValue } from '~/types'

interface ClickOutsideElement extends HTMLElement { _clickOutside?: (event: Event) => void }
const vClickOutside = {
  mounted(el: ClickOutsideElement, binding: any) {
    el._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) binding.value()
    }
    document.addEventListener('click', el._clickOutside, true)
  },
  unmounted(el: ClickOutsideElement) {
    if (el._clickOutside) document.removeEventListener('click', el._clickOutside, true)
  },
}

interface ClientOption {
  id: string
  name: string
  activeProjects?: number
}

const props = defineProps<{
  column: CustomColumn
  value: TaskColumnValue | null
  taskId: string
  readonly?: boolean
}>()

const emit = defineEmits<{ update: [payload: any] }>()

const showPicker = ref(false)
const searchQuery = ref('')
const pickerPosition = ref({ x: 0, y: 0 })

// Fetch clients from API — fixed key + `dedupe: 'defer'` so every
// CellClient instance on the board shares one in-flight request. Without
// `defer`, Nuxt's default `cancel` mode lets each instance fall through and
// fire its own fetch (the abort signal isn't propagated to `$fetch` here).
const { data: clientsData } = useAsyncData(
  'agency-clients',
  () => $fetch<ClientOption[]>('/api/agency/clients'),
  { dedupe: 'defer' },
)
const allClients = computed<ClientOption[]>(() => (clientsData.value as any) || [])

const selectedClientId = computed<string | null>(() => props.value?.jsonValue?.clientId || null)
const selectedClient = computed(() =>
  allClients.value.find(c => c.id === selectedClientId.value) || null
)

const filteredClients = computed(() => {
  if (!searchQuery.value) return allClients.value
  const q = searchQuery.value.toLowerCase()
  return allClients.value.filter(c => c.name.toLowerCase().includes(q))
})

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = computePopoverPosition(rect, 288, 350)
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
  searchQuery.value = ''
}

function selectClient(client: ClientOption | null) {
  if (client) {
    emit('update', { textValue: client.name, jsonValue: { clientId: client.id, clientName: client.name } })
  } else {
    emit('update', { textValue: null, jsonValue: null })
  }
  closePicker()
}
</script>
