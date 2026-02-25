<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import type { ChatChannel, ChatPresenceStatus } from '~/types'

const props = defineProps<{
  channels: ChatChannel[]
  activeChannelId?: string
  loading?: boolean
  userStatuses?: Map<string, ChatPresenceStatus>
}>()

const emit = defineEmits<{
  'select': [channel: ChatChannel]
  'create-channel': []
  'create-dm': []
  'browse-channels': []
}>()

const searchFilter = ref('')
const expandedSections = ref({ channels: true, dms: true })

const filtered = computed(() => {
  const q = searchFilter.value.toLowerCase()
  const all = q
    ? props.channels.filter(c => c.name.toLowerCase().includes(q))
    : props.channels

  return {
    channels: all.filter(c => c.type === 'channel'),
    dms: all.filter(c => c.type === 'dm' || c.type === 'group_dm')
  }
})

function relativeTime(date: string | null) {
  if (!date) return ''
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  } catch {
    return ''
  }
}

function statusColor(status: ChatPresenceStatus | undefined): string {
  switch (status) {
    case 'online': return 'bg-green-500'
    case 'away': return 'bg-amber-500'
    case 'dnd': return 'bg-red-500'
    default: return 'bg-gray-400'
  }
}

// Extract the "other" user ID from a DM channel name/members for presence lookup
// DM slugs are sorted user IDs; we use created_by as a rough proxy
function getDmUserId(ch: ChatChannel): string | undefined {
  // For DMs, members array has the other user(s)
  if (ch.members && ch.members.length > 0) {
    return ch.members[0]?.user_id
  }
  return ch.created_by
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center gap-2 p-3 border-b border-default">
      <h2 class="text-sm font-semibold flex-1">Chat</h2>
      <UDropdownMenu
        :items="[
          [
            { label: 'New Channel', icon: 'i-lucide-hash', click: () => emit('create-channel') },
            { label: 'New Message', icon: 'i-lucide-pen-square', click: () => emit('create-dm') }
          ]
        ]"
      >
        <UButton icon="i-lucide-plus" variant="ghost" color="neutral" size="xs" />
      </UDropdownMenu>
    </div>

    <!-- Search -->
    <div class="px-3 py-2">
      <UInput
        v-model="searchFilter"
        placeholder="Search channels..."
        icon="i-lucide-search"
        size="sm"
      />
    </div>

    <!-- Channel list -->
    <div class="flex-1 overflow-y-auto">
      <!-- Loading -->
      <div v-if="loading" class="p-4 text-center text-sm text-muted">
        Loading channels...
      </div>

      <template v-else>
        <!-- Channels Section -->
        <div>
          <div class="flex items-center">
            <button
              class="flex-1 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted uppercase tracking-wide hover:text-default"
              @click="expandedSections.channels = !expandedSections.channels"
            >
              <UIcon
                :name="expandedSections.channels ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="w-3 h-3"
              />
              Channels
              <UBadge
                v-if="filtered.channels.reduce((s, c) => s + (c.unread_count || 0), 0) > 0"
                :label="String(filtered.channels.reduce((s, c) => s + (c.unread_count || 0), 0))"
                size="xs"
                color="primary"
                variant="subtle"
              />
            </button>
          </div>

          <div v-show="expandedSections.channels">
            <button
              v-for="ch in filtered.channels"
              :key="ch.id"
              :class="[
                'w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-elevated/80 transition-colors',
                activeChannelId === ch.id ? 'bg-elevated' : ''
              ]"
              @click="emit('select', ch)"
            >
              <UIcon
                :name="ch.is_private ? 'i-lucide-lock' : 'i-lucide-hash'"
                :class="['w-4 h-4 shrink-0', ch.muted_until ? 'text-muted/50' : 'text-muted']"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm truncate" :class="[
                    (ch.unread_count || 0) > 0 ? 'font-semibold' : '',
                    ch.muted_until ? 'text-muted' : ''
                  ]">
                    {{ ch.name }}
                  </span>
                  <UIcon v-if="ch.muted_until" name="i-lucide-volume-x" class="w-3 h-3 text-muted/50 shrink-0" />
                </div>
                <p v-if="ch.last_message" class="text-xs text-muted truncate">
                  <span class="font-medium">{{ ch.last_message.user_name }}:</span>
                  {{ ch.last_message.content }}
                </p>
              </div>
              <div class="shrink-0 flex flex-col items-end gap-0.5">
                <span v-if="ch.last_message" class="text-[10px] text-muted">
                  {{ relativeTime(ch.last_message.created_at) }}
                </span>
                <UBadge
                  v-if="(ch.unread_count || 0) > 0"
                  :label="String(ch.unread_count)"
                  size="xs"
                  color="primary"
                />
              </div>
            </button>

            <!-- Browse channels link -->
            <button
              class="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-muted hover:text-default hover:bg-elevated/50 transition-colors"
              @click="emit('browse-channels')"
            >
              <UIcon name="i-lucide-compass" class="w-4 h-4" />
              <span>Browse channels</span>
            </button>
          </div>
        </div>

        <!-- DMs Section -->
        <div v-if="filtered.dms.length > 0">
          <button
            class="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted uppercase tracking-wide hover:text-default mt-2"
            @click="expandedSections.dms = !expandedSections.dms"
          >
            <UIcon
              :name="expandedSections.dms ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="w-3 h-3"
            />
            Direct Messages
            <UBadge
              v-if="filtered.dms.reduce((s, c) => s + (c.unread_count || 0), 0) > 0"
              :label="String(filtered.dms.reduce((s, c) => s + (c.unread_count || 0), 0))"
              size="xs"
              color="primary"
              variant="subtle"
            />
          </button>

          <div v-show="expandedSections.dms">
            <button
              v-for="ch in filtered.dms"
              :key="ch.id"
              :class="[
                'w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-elevated/80 transition-colors',
                activeChannelId === ch.id ? 'bg-elevated' : ''
              ]"
              @click="emit('select', ch)"
            >
              <div class="relative">
                <UAvatar
                  :src="ch.avatar_url"
                  :alt="ch.name"
                  size="xs"
                />
                <span
                  v-if="userStatuses && getDmUserId(ch)"
                  :class="[
                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-elevated',
                    statusColor(userStatuses.get(getDmUserId(ch)!))
                  ]"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm truncate" :class="[
                    (ch.unread_count || 0) > 0 ? 'font-semibold' : '',
                    ch.muted_until ? 'text-muted' : ''
                  ]">
                    {{ ch.name }}
                  </span>
                  <UIcon v-if="ch.muted_until" name="i-lucide-volume-x" class="w-3 h-3 text-muted/50 shrink-0" />
                </div>
                <p v-if="ch.last_message" class="text-xs text-muted truncate">
                  {{ ch.last_message.content }}
                </p>
              </div>
              <div class="shrink-0 flex flex-col items-end gap-0.5">
                <span v-if="ch.last_message" class="text-[10px] text-muted">
                  {{ relativeTime(ch.last_message.created_at) }}
                </span>
                <UBadge
                  v-if="(ch.unread_count || 0) > 0"
                  :label="String(ch.unread_count)"
                  size="xs"
                  color="primary"
                />
              </div>
            </button>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="filtered.channels.length === 0 && filtered.dms.length === 0" class="p-4 text-center text-sm text-muted">
          {{ searchFilter ? 'No matching channels' : 'No channels yet' }}
        </div>
      </template>
    </div>
  </div>
</template>
