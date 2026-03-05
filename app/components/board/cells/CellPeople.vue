<template>
  <div class="min-h-[28px] flex items-center" @click.stop>
    <div
      class="flex items-center gap-1 min-h-[28px] px-1 rounded hover:bg-gray-100 dark:hover:bg-neutral-800 cursor-pointer w-full"
      @click="togglePicker"
    >
      <div v-if="assignedPeople.length" class="flex items-center -space-x-2">
        <UAvatar
          v-for="person in assignedPeople.slice(0, 4)"
          :key="person.id"
          :src="person.avatarUrl"
          :alt="person.name"
          :fallback="getInitials(person.name)"
          size="sm"
          class="ring-2 ring-white dark:ring-neutral-900"
        />
        <span
          v-if="assignedPeople.length > 4"
          class="w-8 h-8 rounded-full bg-gray-200 dark:bg-neutral-700 text-xs font-medium flex items-center justify-center ring-2 ring-white dark:ring-neutral-900 text-gray-600 dark:text-neutral-300"
        >
          +{{ assignedPeople.length - 4 }}
        </span>
      </div>
      <span v-else class="text-gray-400 dark:text-neutral-500 text-sm">-</span>
    </div>

    <!-- People Selector Popover -->
    <Teleport to="body">
      <div
        v-if="showPicker"
        class="fixed z-[100] bg-white dark:bg-neutral-900 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 w-80"
        :style="popoverStyle"
        v-click-outside="closePicker"
      >
        <!-- Selected -->
        <div v-if="assignedPeople.length" class="p-3 border-b border-gray-200 dark:border-neutral-700">
          <div class="flex flex-wrap gap-2">
            <div
              v-for="person in assignedPeople"
              :key="person.id"
              class="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 px-2 py-1 rounded-full text-sm"
            >
              <UAvatar :src="person.avatarUrl" :alt="person.name" :fallback="getInitials(person.name)" size="2xs" class="bg-blue-500 text-white" />
              <span>{{ person.name }}</span>
              <button @click="togglePerson(person.id)" class="hover:text-blue-900 ml-0.5">
                <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Search -->
        <div class="p-3 border-b border-gray-200 dark:border-neutral-700">
          <div class="relative">
            <UIcon name="i-lucide-search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search names, roles or teams"
              class="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 rounded-md outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <!-- People List -->
        <div class="max-h-64 overflow-y-auto py-2">
          <div class="px-3 pb-2 text-xs font-medium text-gray-500 dark:text-neutral-400 uppercase">Suggested people</div>
          <button
            v-for="person in filteredPeople"
            :key="person.id"
            class="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
            :class="{ 'bg-blue-50 dark:bg-blue-900/30': isSelected(person.id) }"
            @click="togglePerson(person.id)"
          >
            <UAvatar :src="person.avatarUrl" :alt="person.name" :fallback="person.initials || getInitials(person.name)" size="sm" class="bg-gray-700 text-white" />
            <div class="text-left flex-1">
              <div class="text-sm font-medium text-gray-900 dark:text-neutral-100">{{ person.name }}</div>
              <div v-if="person.role" class="text-xs text-gray-500 dark:text-neutral-400">{{ person.role }}</div>
            </div>
            <UIcon v-if="isSelected(person.id)" name="i-lucide-check" class="w-4 h-4 text-blue-600" />
          </button>
          <p v-if="!filteredPeople.length && searchQuery" class="px-3 py-2 text-sm text-gray-400 dark:text-neutral-500">No matching people</p>
        </div>

        <!-- Footer -->
        <div class="p-3 border-t border-gray-200 dark:border-neutral-700 bg-blue-50/50 dark:bg-blue-900/20 flex items-center justify-between">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-neutral-400">
            <UIcon name="i-lucide-bell" class="w-4 h-4" />
            <span>Assignees will be notified</span>
          </div>
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

interface TeamMember {
  id: string
  name: string
  role?: string
  initials?: string
  avatarUrl?: string
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

// Fetch team members from API
const { data: teamData } = useFetch('/api/agency/team-members')
const allPeople = computed<TeamMember[]>(() => (teamData.value as any)?.members || [])

const selectedIds = computed<string[]>(() => props.value?.jsonValue?.userIds || [])

const assignedPeople = computed(() =>
  allPeople.value.filter((p) => selectedIds.value.includes(p.id))
)

const filteredPeople = computed(() => {
  if (!searchQuery.value) return allPeople.value
  const q = searchQuery.value.toLowerCase()
  return allPeople.value.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.role || '').toLowerCase().includes(q)
  )
})

const popoverStyle = computed(() => ({
  left: pickerPosition.value.x + 'px',
  top: pickerPosition.value.y + 'px',
}))

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function isSelected(personId: string): boolean {
  return selectedIds.value.includes(personId)
}

function togglePicker(event: MouseEvent) {
  if (props.readonly) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  pickerPosition.value = { x: rect.left, y: rect.bottom + 8 }
  showPicker.value = true
}

function closePicker() {
  showPicker.value = false
  searchQuery.value = ''
}

function togglePerson(personId: string) {
  const current = [...selectedIds.value]
  const idx = current.indexOf(personId)
  if (idx > -1) current.splice(idx, 1)
  else current.push(personId)
  emit('update', { jsonValue: { userIds: current } })
}

function removePerson(personId: string) {
  const current = selectedIds.value.filter((id) => id !== personId)
  emit('update', { jsonValue: { userIds: current } })
}
</script>
