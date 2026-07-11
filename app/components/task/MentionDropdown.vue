<template>
  <div
    v-if="show"
    class="mention-dropdown absolute z-50 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 py-2 min-w-[280px] max-h-[320px] overflow-y-auto"
    :style="position"
  >
    <!-- Loading State -->
    <div v-if="loading" class="px-4 py-3 text-sm text-gray-500 dark:text-neutral-400 flex items-center gap-2">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
      Searching...
    </div>

    <!-- Empty State -->
    <div v-else-if="suggestions.length === 0" class="px-4 py-3 text-sm text-gray-500 dark:text-neutral-400">
      No matches found
    </div>

    <template v-else>
      <!-- Group by category -->
      <template v-for="(group, category) in groupedSuggestions" :key="category">
        <div class="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-neutral-400 uppercase tracking-wide bg-gray-50/50 dark:bg-neutral-700/50">
          {{ formatCategory(String(category)) }}
        </div>
        
        <div
          v-for="(item, index) in group"
          :key="item.id + item.type"
          class="mention-item px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer flex items-center gap-3 transition-colors"
          :class="{ 'bg-blue-50 dark:bg-blue-900/30': isSelected(item) }"
          @click="selectItem(item)"
          @mouseenter="selectedIndex = getGlobalIndex(String(category), index)"
        >
          <!-- Team Icon -->
          <div 
            v-if="item.is_team"
            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            :style="{ backgroundColor: (item.color || '#6B7280') + '20' }"
          >
            <UIcon 
              :name="item.icon || 'i-lucide-users'" 
              class="w-4 h-4" 
              :style="{ color: item.color || '#6B7280' }" 
            />
          </div>
          
          <!-- User Avatar -->
          <UAvatar
            v-else
            :src="item.avatar_url || undefined"
            :alt="item.name"
            size="sm"
            class="flex-shrink-0"
          />
          
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-gray-900 dark:text-neutral-100 truncate">
              {{ item.name }}
            </div>
            <div class="text-xs text-gray-500 dark:text-neutral-400 truncate">
              {{ item.subtitle || getSubtitle(item) }}
            </div>
          </div>
          
          <!-- Team badge -->
          <UBadge 
            v-if="item.is_team" 
            color="primary" 
            variant="soft" 
            size="xs"
            class="flex-shrink-0"
          >
            Team
          </UBadge>
        </div>
      </template>
      
      <!-- Invite Option -->
      <div class="border-t border-gray-100 dark:border-neutral-700 mt-1 pt-1">
        <button
          class="w-full px-3 py-2 flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
          @click="$emit('invite')"
        >
          <UIcon name="i-lucide-mail" class="w-4 h-4" />
          Invite a new member by email
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
interface MentionSuggestion {
  id: string
  name: string
  type: string
  category: string
  icon: string
  subtitle?: string
  avatar_url?: string | null
  color?: string
  is_team: boolean
}

interface Props {
  show: boolean
  suggestions: MentionSuggestion[]
  loading?: boolean
  position: { top: string; left: string }
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  select: [item: MentionSuggestion]
  close: []
  invite: []
}>()

const selectedIndex = ref(0)

// Group suggestions by category
const groupedSuggestions = computed(() => {
  const groups: Record<string, MentionSuggestion[]> = {
    person: [],
    team: [],
    special: []
  }
  
  props.suggestions.forEach(item => {
    if (groups[item.category]) {
      groups[item.category].push(item)
    }
  })
  
  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([_, items]) => items.length > 0)
  )
})

// Reset selection when suggestions change
watch(() => props.suggestions, () => {
  selectedIndex.value = 0
}, { immediate: true })

// Format category name
const formatCategory = (category: string): string => {
  const names: Record<string, string> = {
    person: 'People',
    team: 'Teams',
    special: 'Special'
  }
  return names[category] || category
}

// Get subtitle for item
const getSubtitle = (item: MentionSuggestion): string => {
  if (item.is_team) {
    const descriptions: Record<string, string> = {
      board: 'All board members',
      item: 'All task participants',
      workspace: 'All workspace members',
      company: 'Everyone in organization',
      here: 'Currently active users',
      channel: 'All participants'
    }
    return descriptions[item.type] || 'Team mention'
  }
  return item.subtitle || ''
}

// Check if item is currently selected
const isSelected = (item: MentionSuggestion): boolean => {
  const flatIndex = getFlatIndex(item)
  return flatIndex === selectedIndex.value
}

// Get global index across all groups
const getGlobalIndex = (category: string, localIndex: number): number => {
  let index = 0
  for (const [cat, items] of Object.entries(groupedSuggestions.value)) {
    if (cat === category) {
      return index + localIndex
    }
    index += items.length
  }
  return 0
}

// Get flat index of an item
const getFlatIndex = (target: MentionSuggestion): number => {
  let index = 0
  for (const items of Object.values(groupedSuggestions.value)) {
    for (const item of items) {
      if (item.id === target.id && item.type === target.type) {
        return index
      }
      index++
    }
  }
  return -1
}

// Get selected item
const getSelectedItem = (): MentionSuggestion | null => {
  let index = 0
  for (const items of Object.values(groupedSuggestions.value)) {
    for (const item of items) {
      if (index === selectedIndex.value) {
        return item
      }
      index++
    }
  }
  return null
}

// Handle keyboard navigation
const handleKeydown = (event: KeyboardEvent) => {
  if (!props.show) return
  
  const totalItems = props.suggestions.length

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex.value = (selectedIndex.value + 1) % totalItems
      break
      
    case 'ArrowUp':
      event.preventDefault()
      selectedIndex.value = (selectedIndex.value - 1 + totalItems) % totalItems
      break
      
    case 'Enter':
      event.preventDefault()
      const selected = getSelectedItem()
      if (selected) {
        selectItem(selected)
      }
      break
      
    case 'Escape':
      event.preventDefault()
      emit('close')
      break
  }
}

// Select an item
const selectItem = (item: MentionSuggestion) => {
  emit('select', item)
}

// Expose for parent
defineExpose({
  handleKeydown
})
</script>

<style scoped>
.mention-dropdown {
  animation: dropdown-appear 0.15s ease-out;
}

@keyframes dropdown-appear {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
