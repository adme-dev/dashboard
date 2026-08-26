<script setup lang="ts">
import type { SocialConversation } from '~/types'
import {
  getSocialInboxAccountContextDisplay,
  getSocialInboxIdentityDisplay
} from '~/utils/socialInboxDisplay'

defineProps<{ conversations: SocialConversation[], selectedId: string | null, loading?: boolean, hasMore?: boolean }>()
const emit = defineEmits<{ select: [id: string], filter: [f: Record<string, string>], loadMore: [] }>()

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
  { label: 'Google Business', value: 'google-business' }
]
const channelOptions = [
  { label: 'All types', value: 'all' },
  { label: 'Comments', value: 'comment' },
  { label: 'Reviews', value: 'review' },
  { label: 'DMs', value: 'dm' },
  { label: 'Mentions', value: 'mention' }
]
const statusOptions = [
  { label: 'Open', value: 'open' },
  { label: 'Snoozed', value: 'snoozed' },
  { label: 'Closed', value: 'closed' },
  { label: 'All', value: 'all' }
]

function emitFilter() {
  const f: Record<string, string> = {}
  const q = search.value.trim()
  if (q) f.search = q
  if (platform.value !== 'all') f.platform = platform.value
  if (channel.value !== 'all') f.channel = channel.value
  if (status.value !== 'all') f.status = status.value
  emit('filter', f)
}
watch([platform, channel, status], emitFilter)

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(emitFilter, 250)
})
onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})

const PLATFORM_COLOR: Record<string, string> = {
  'facebook': 'info',
  'instagram': 'error',
  'linkedin': 'primary',
  'youtube': 'error',
  'tiktok': 'neutral',
  'google-business': 'success'
}
function relative(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : ''
}
function identityFor(c: SocialConversation) {
  return getSocialInboxIdentityDisplay({ platform: c.platform, name: c.participant_name })
}
function accountFor(c: SocialConversation) {
  return getSocialInboxAccountContextDisplay({
    accountName: c.social_account_name,
    platformAccountId: c.social_account_platform_id
  })
}
</script>

<template>
  <div class="flex flex-col h-full border-r border-default min-h-0">
    <div class="p-3 space-y-2 border-b border-default">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Search conversations"
        size="sm"
        class="w-full"
      />
      <div class="grid grid-cols-2 gap-2">
        <USelectMenu
          v-model="platform"
          :items="platformOptions"
          value-key="value"
          size="sm"
        />
        <USelectMenu
          v-model="channel"
          :items="channelOptions"
          value-key="value"
          size="sm"
        />
      </div>
      <USelectMenu
        v-model="status"
        :items="statusOptions"
        value-key="value"
        size="sm"
        class="w-full"
      />
    </div>
    <div class="flex-1 overflow-y-auto">
      <div v-if="loading && !conversations.length" class="p-4 text-sm text-muted">
        Loading…
      </div>
      <div v-else-if="!conversations.length" class="p-4 text-sm text-muted">
        No conversations.
      </div>
      <button
        v-for="c in conversations"
        :key="c.id"
        type="button"
        class="w-full text-left p-3 border-b border-default hover:bg-elevated transition-colors"
        :class="c.id === selectedId ? 'bg-elevated' : ''"
        @click="emit('select', c.id)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="font-medium truncate" :class="identityFor(c).unavailable ? 'text-muted' : ''" :title="identityFor(c).reason || undefined">
            {{ identityFor(c).label }}
          </span>
          <span class="text-xs text-muted shrink-0">{{ relative(c.last_message_at) }}</span>
        </div>
        <p class="text-sm text-muted truncate mt-0.5">
          {{ c.last_message_preview || '—' }}
        </p>
        <div class="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <UIcon name="i-lucide-panels-top-left" class="size-3 shrink-0" />
          <span class="truncate">
            {{ accountFor(c) ? `via ${accountFor(c)}` : 'Account not linked' }}
            <template v-if="c.client_name"> · {{ c.client_name }}</template>
          </span>
        </div>
        <div class="flex items-center gap-1 mt-1.5">
          <UBadge :color="(PLATFORM_COLOR[c.platform] || 'neutral') as any" variant="subtle" size="xs">
            {{ c.platform }}
          </UBadge>
          <UBadge color="neutral" variant="subtle" size="xs">
            {{ c.channel_type }}
          </UBadge>
          <UBadge
            v-if="c.channel_type === 'review' && c.rating"
            color="warning"
            variant="subtle"
            size="xs"
          >
            ★ {{ c.rating }}
          </UBadge>
          <span v-if="c.unread_count > 0" class="ml-auto w-2 h-2 rounded-full bg-primary" />
        </div>
      </button>
      <div v-if="hasMore" class="p-3">
        <UButton
          label="Load more"
          icon="i-lucide-chevron-down"
          variant="ghost"
          size="sm"
          block
          :loading="loading"
          @click="emit('loadMore')"
        />
      </div>
    </div>
  </div>
</template>
