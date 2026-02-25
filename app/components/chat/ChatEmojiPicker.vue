<script setup lang="ts">
const emit = defineEmits<{
  'select': [emoji: string]
}>()

const searchQuery = ref('')

// Curated emoji categories
const categories = [
  {
    label: 'Smileys',
    icon: 'i-lucide-smile',
    emojis: ['😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳', '😏', '🤔', '🤫', '🫡', '😌', '😴', '🤯', '😱', '😤', '😭', '🥺', '😈', '👻', '💀', '🤡', '💩', '🤖', '👽']
  },
  {
    label: 'Gestures',
    icon: 'i-lucide-hand',
    emojis: ['👍', '👎', '👋', '🤝', '👏', '🙌', '🤞', '✌️', '🤟', '💪', '🫶', '🙏', '☝️', '👆', '👇', '👈', '👉', '✋', '🤚', '🫱', '🫲']
  },
  {
    label: 'Hearts',
    icon: 'i-lucide-heart',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💗', '💖', '💝', '💘', '💞', '❤️‍🔥', '💔']
  },
  {
    label: 'Reactions',
    icon: 'i-lucide-zap',
    emojis: ['🎉', '🔥', '⭐', '✨', '💯', '👀', '💡', '✅', '❌', '⚠️', '🚀', '💎', '🏆', '🎯', '📌', '🔔', '⏰', '🎁', '🍕', '🍺', '☕', '🎶']
  },
  {
    label: 'Work',
    icon: 'i-lucide-briefcase',
    emojis: ['📋', '📊', '📈', '📉', '💻', '📱', '🖥️', '⌨️', '📁', '📂', '✏️', '📝', '📅', '🗓️', '💰', '📧', '🔗', '🔒', '🔓']
  }
]

const activeCategory = ref(0)

const filteredEmojis = computed(() => {
  if (!searchQuery.value) return categories[activeCategory.value].emojis
  const q = searchQuery.value.toLowerCase()
  // Flatten all categories and return matches (basic search by checking if category label matches)
  return categories.flatMap(c =>
    c.label.toLowerCase().includes(q) ? c.emojis : []
  )
})

// Frequently used (stored in localStorage)
const recentEmojis = ref<string[]>([])

onMounted(() => {
  try {
    const stored = localStorage.getItem('chat-recent-emojis')
    if (stored) recentEmojis.value = JSON.parse(stored)
  } catch { /* ignore */ }
})

function selectEmoji(emoji: string) {
  emit('select', emoji)

  // Track recent
  recentEmojis.value = [emoji, ...recentEmojis.value.filter(e => e !== emoji)].slice(0, 16)
  try {
    localStorage.setItem('chat-recent-emojis', JSON.stringify(recentEmojis.value))
  } catch { /* ignore */ }
}
</script>

<template>
  <div class="w-72 max-h-80 flex flex-col">
    <!-- Search -->
    <div class="px-3 pt-3 pb-2">
      <UInput
        v-model="searchQuery"
        placeholder="Search emojis..."
        icon="i-lucide-search"
        size="sm"
      />
    </div>

    <!-- Category tabs -->
    <div class="flex gap-0.5 px-2 pb-1.5 border-b border-default">
      <button
        v-for="(cat, idx) in categories"
        :key="cat.label"
        :class="[
          'w-7 h-7 flex items-center justify-center rounded transition-colors',
          idx === activeCategory ? 'bg-primary/10 text-primary' : 'hover:bg-elevated text-muted'
        ]"
        :title="cat.label"
        @click="activeCategory = idx; searchQuery = ''"
      >
        <UIcon :name="cat.icon" class="w-4 h-4" />
      </button>
    </div>

    <!-- Recent (if any) -->
    <div v-if="recentEmojis.length > 0 && !searchQuery" class="px-2 pt-2">
      <p class="text-[10px] text-muted font-medium uppercase mb-1 px-1">Recent</p>
      <div class="flex flex-wrap gap-0.5">
        <button
          v-for="emoji in recentEmojis"
          :key="emoji"
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-elevated text-lg"
          @click="selectEmoji(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </div>

    <!-- Emoji grid -->
    <div class="flex-1 overflow-y-auto px-2 py-2">
      <p v-if="!searchQuery" class="text-[10px] text-muted font-medium uppercase mb-1 px-1">
        {{ categories[activeCategory].label }}
      </p>
      <div class="flex flex-wrap gap-0.5">
        <button
          v-for="emoji in filteredEmojis"
          :key="emoji"
          class="w-8 h-8 flex items-center justify-center rounded hover:bg-elevated text-lg transition-transform hover:scale-110"
          @click="selectEmoji(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
      <p v-if="filteredEmojis.length === 0" class="text-center text-sm text-muted py-4">
        No emojis found
      </p>
    </div>
  </div>
</template>
