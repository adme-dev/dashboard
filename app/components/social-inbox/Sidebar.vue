<script setup lang="ts">
import type { SocialConversation } from '~/types'

const props = defineProps<{ conversations: SocialConversation[]; selectedId: string | null; loading?: boolean }>()
const emit = defineEmits<{ select: [id: string]; filter: [f: Record<string, string>] }>()

const search = ref('')
const platform = ref('all')
const channel = ref('all')
const status = ref('open')

const platformOptions = [
  { label: 'All networks', value: 'all' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Google Business', value: 'google-business' },
]
const channelOptions = [
  { label: 'All types', value: 'all' },
  { label: 'Comments', value: 'comment' },
  { label: 'Reviews', value: 'review' },
  { label: 'DMs', value: 'dm' },
  { label: 'Mentions', value: 'mention' },
]
const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'Snoozed', value: 'snoozed' },
  { label: 'Closed', value: 'closed' },
  { label: 'All', value: 'all' },
]

function emitFilter() {
  const f: Record<string, string> = {}
  if (platform.value !== 'all') f.platform = platform.value
  if (channel.value !== 'all') f.channel = channel.value
  if (status.value !== 'all') f.status = status.value
  emit('filter', f)
}
watch([platform, channel, status], emitFilter)

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.conversations
  return props.conversations.filter(c =>
    (c.participant_name || '').toLowerCase().includes(q)
    || (c.last_message_preview || '').toLowerCase().includes(q))
})

const PLATFORM_COLOR: Record<string, string> = {
  facebook: 'info', instagram: 'error', linkedin: 'primary', youtube: 'error', tiktok: 'neutral', 'google-business': 'success',
}
function relative(iso: string | null) { return iso ? new Date(iso).toLocaleDateString() : '' }
</script>

<template>
  <div class="flex flex-col h-full border-r border-default min-h-0">
    <div class="p-3 space-y-2 border-b border-default">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search conversations" size="sm" class="w-full" />
      <div class="grid grid-cols-2 gap-2">
        <USelectMenu v-model="platform" :items="platformOptions" value-key="value" size="sm" />
        <USelectMenu v-model="channel" :items="channelOptions" value-key="value" size="sm" />
      </div>
      <USelectMenu v-model="status" :items="statusOptions" value-key="value" size="sm" class="w-full" />
    </div>
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading" class="p-4 text-sm text-muted">Loading…</div>
      <div v-else-if="!filtered.length" class="p-4 text-sm text-muted">No conversations.</div>
      <button
        v-for="c in filtered" :key="c.id" type="button"
        class="w-full text-left p-3 border-b border-default hover:bg-elevated transition-colors"
        :class="c.id === selectedId ? 'bg-elevated' : ''"
        @click="emit('select', c.id)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium truncate">{{ c.participant_name || 'Unknown' }}</span>
          <span class="text-xs text-muted shrink-0">{{ relative(c.last_message_at) }}</span>
        </div>
        <p class="text-sm text-muted truncate mt-0.5">{{ c.last_message_preview || '—' }}</p>
        <div class="flex items-center gap-1 mt-1.5">
          <UBadge :color="(PLATFORM_COLOR[c.platform] || 'neutral') as any" variant="subtle" size="xs">{{ c.platform }}</UBadge>
          <UBadge color="neutral" variant="subtle" size="xs">{{ c.channel_type }}</UBadge>
          <UBadge v-if="c.channel_type === 'review' && c.rating" color="warning" variant="subtle" size="xs">★ {{ c.rating }}</UBadge>
          <span v-if="c.unread_count > 0" class="ml-auto w-2 h-2 rounded-full bg-primary" />
        </div>
      </button>
    </div>
  </div>
</template>
