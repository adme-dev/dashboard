<template>
  <div class="bg-white dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-700">
    <!-- Row 1: Breadcrumb + title + actions -->
    <div class="flex items-center justify-between px-4 pt-3 pb-2">
      <div class="min-w-0">
        <UBreadcrumb :items="[
          { label: 'Boards', icon: 'i-lucide-layout-grid', to: '/agency/boards' },
          { label: boardName, icon: 'i-lucide-columns-3' }
        ]" />
        <div class="flex items-center gap-3 mt-1">
          <h1 class="text-lg font-semibold truncate">{{ boardName }}</h1>
          <span class="text-xs text-gray-400 dark:text-neutral-500 whitespace-nowrap">
            {{ totalItems }} items
            <span v-if="lastUpdated">· {{ formatRelativeTime(lastUpdated) }}</span>
          </span>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- Connect GitHub Repo (AI agent context) -->
        <BoardRepoConnect :board-id="boardId" />

        <!-- Subscribe Button -->
        <UPopover>
          <UButton
            :icon="isSnoozed ? 'i-lucide-moon' : (isSubscribed ? 'i-lucide-bell-ring' : 'i-lucide-bell')"
            :variant="isSubscribed ? 'soft' : 'ghost'"
            :color="isSubscribed ? 'primary' : 'neutral'"
            size="sm"
          >
            {{ isSnoozed ? `Snoozed (${snoozeRemaining})` : (isSubscribed ? 'Watching' : 'Watch') }}
          </UButton>
          <template #content>
            <div class="p-3 w-72 space-y-1">
              <BoardWatchSubscriberStack :board-id="boardId" />

              <!-- Snooze section -->
              <div class="border-b border-default mb-1 pb-2">
                <div v-if="isSnoozed" class="px-2 py-1.5 flex items-center gap-2 text-sm">
                  <UIcon name="i-lucide-moon" class="w-4 h-4 text-warning" />
                  <span class="text-muted truncate">Snoozed for {{ snoozeRemaining }}</span>
                  <UButton label="Cancel" variant="ghost" size="xs" color="neutral" class="ml-auto" @click="cancelSnooze" />
                </div>
                <div v-else class="px-2 py-1">
                  <p class="text-xs font-medium text-muted uppercase tracking-wide mb-1">Snooze</p>
                  <div class="flex flex-wrap gap-1">
                    <UButton label="1h" variant="soft" size="xs" color="neutral" @click="snoozeFor(60)" />
                    <UButton label="8h" variant="soft" size="xs" color="neutral" @click="snoozeFor(60 * 8)" />
                    <UButton label="End of day" variant="soft" size="xs" color="neutral" @click="snoozeUntilEndOfDay()" />
                    <UButton label="Tomorrow" variant="soft" size="xs" color="neutral" @click="snoozeUntilTomorrow8am()" />
                    <UButton label="Next workday" variant="soft" size="xs" color="neutral" @click="snoozeUntilNextWorkday()" />
                  </div>
                </div>
              </div>

              <p class="text-sm font-medium px-2 pb-1">Board Notifications</p>
              <div
                v-for="opt in subscribeOptions"
                :key="opt.value"
                class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-elevated/50 cursor-pointer text-sm"
                @click="handleSubscribe(opt.value)"
              >
                <UIcon :name="opt.icon" class="w-4 h-4" />
                <span>{{ opt.label }}</span>
                <UIcon v-if="subscriptionLevel === opt.value" name="i-lucide-check" class="w-4 h-4 ml-auto text-primary" />
              </div>
              <div class="border-t border-default mt-1 pt-1">
                <div
                  class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-elevated/50 cursor-pointer text-sm"
                  @click="openSettings = true"
                >
                  <UIcon name="i-lucide-settings-2" class="w-4 h-4" />
                  <span>Custom…</span>
                  <UIcon v-if="subscriptionLevel === 'custom'" name="i-lucide-check" class="w-4 h-4 ml-auto text-primary" />
                </div>
              </div>
            </div>
          </template>
        </UPopover>

        <BoardWatchSettings
          v-model:open="openSettings"
          :board-id="boardId"
          @saved="onSettingsSaved"
        />

        <UButton color="primary" icon="i-lucide-plus" size="sm" @click="$emit('newItem')">
          New Item
        </UButton>
      </div>
    </div>

    <!-- Row 2: View switcher + search -->
    <div class="flex items-center justify-between px-4 pb-2">
      <!-- View Switcher -->
      <div class="flex items-center gap-0.5">
        <button
          v-for="v in views"
          :key="v.id"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors"
          :class="activeView === v.id
            ? 'bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-neutral-100'
            : 'text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800'"
          @click="$emit('update:activeView', v.id)"
        >
          <UIcon :name="v.icon" class="w-4 h-4" />
          <span class="hidden sm:inline">{{ v.label }}</span>
        </button>
      </div>
      <UInput
        :model-value="searchQuery"
        icon="i-lucide-search"
        placeholder="Search Items..."
        size="sm"
        class="w-52"
        @update:model-value="$emit('update:searchQuery', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { BoardViewType } from '~/composables/useBoardData'

const props = defineProps<{
  boardName: string
  totalItems: number
  lastUpdated?: string
  activeView: BoardViewType
  searchQuery: string
  boardId: string
}>()

defineEmits<{
  'update:activeView': [view: BoardViewType]
  'update:searchQuery': [query: string]
  newItem: []
}>()

const views: { id: BoardViewType; label: string; icon: string }[] = [
  { id: 'table', label: 'Table', icon: 'i-lucide-table-2' },
  { id: 'kanban', label: 'Kanban', icon: 'i-lucide-kanban' },
  { id: 'timeline', label: 'Timeline', icon: 'i-lucide-gantt-chart' },
  { id: 'calendar', label: 'Calendar', icon: 'i-lucide-calendar' },
  { id: 'list', label: 'List', icon: 'i-lucide-list' },
  { id: 'gallery', label: 'Gallery', icon: 'i-lucide-layout-grid' },
]

// Subscription state
const isSubscribed = ref(false)
const subscriptionLevel = ref<string | null>(null)
const openSettings = ref(false)
const currentBoardSub = ref<any | null>(null)
const snoozeUntil = ref<string | null>(null)
const now = ref(Date.now())

const isSnoozed = computed(() => {
  if (!snoozeUntil.value) return false
  return new Date(snoozeUntil.value).getTime() > now.value
})

const snoozeRemaining = computed(() => {
  if (!snoozeUntil.value) return ''
  const diff = new Date(snoozeUntil.value).getTime() - now.value
  if (diff <= 0) return ''
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m left`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h left`
  return `${Math.floor(hours / 24)}d left`
})

// Tick `now` every minute so the remaining counter and isSnoozed flag update
// without a manual reload after the snooze expires.
let tickHandle: ReturnType<typeof setInterval> | null = null
onMounted(() => { tickHandle = setInterval(() => { now.value = Date.now() }, 60_000) })
onBeforeUnmount(() => { if (tickHandle) clearInterval(tickHandle) })

const subscribeOptions = [
  { value: 'all', label: 'All activity', icon: 'i-lucide-bell-ring' },
  { value: 'mentions', label: 'Mentions only', icon: 'i-lucide-at-sign' },
  { value: 'muted', label: 'Muted', icon: 'i-lucide-bell-off' },
]

function classifyLevel(boardSub: any): string {
  if (boardSub.isMuted) return 'muted'
  const events: string[] = boardSub.events || []
  if (events.length === 0) return 'all'
  if (events.length === 1 && events[0] === 'task_mentioned') return 'mentions'
  return 'custom'
}

// Check subscription status on mount
onMounted(async () => {
  try {
    const { subscriptions } = await $fetch<{ subscriptions: any[] }>(`/api/agency/boards/${props.boardId}/subscriptions`)
    const boardSub = subscriptions.find((s: any) => !s.itemId && !s.columnId)
    if (boardSub) {
      isSubscribed.value = true
      subscriptionLevel.value = classifyLevel(boardSub)
      currentBoardSub.value = boardSub
      snoozeUntil.value = boardSub.snoozeUntil || null
    }
  } catch {
    // Silently fail — subscription check is non-critical
  }
})

async function snoozeFor(minutes: number) {
  await applySnooze(new Date(Date.now() + minutes * 60_000))
}

async function snoozeUntilTomorrow8am() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(8, 0, 0, 0)
  await applySnooze(d)
}

async function snoozeUntilEndOfDay() {
  // 6 PM in user's local timezone
  const d = new Date()
  d.setHours(18, 0, 0, 0)
  // If already past 6pm, jump to 11:59pm
  if (d.getTime() <= Date.now()) {
    d.setHours(23, 59, 0, 0)
  }
  await applySnooze(d)
}

async function snoozeUntilNextWorkday() {
  // Next Monday 8am if it's Friday/Saturday/Sunday; otherwise tomorrow 8am.
  const d = new Date()
  const day = d.getDay() // 0=Sun..6=Sat
  let addDays: number
  if (day === 5) addDays = 3      // Friday → Monday
  else if (day === 6) addDays = 2 // Saturday → Monday
  else if (day === 0) addDays = 1 // Sunday → Monday
  else addDays = 1                // weekday → tomorrow
  d.setDate(d.getDate() + addDays)
  d.setHours(8, 0, 0, 0)
  await applySnooze(d)
}

async function cancelSnooze() {
  await applySnooze(null)
}

async function applySnooze(until: Date | null) {
  // Preserve current subscription state; if not subscribed, snoozing creates a default
  // "all activity" subscription and immediately mutes it for the snooze window.
  const sub = currentBoardSub.value
  const body: any = {
    events: sub?.events ?? [],
    notifyInapp: sub?.notifyInapp ?? true,
    notifyEmail: sub?.notifyEmail ?? false,
    isMuted: sub?.isMuted ?? false,
    snoozeUntil: until ? until.toISOString() : null,
  }
  try {
    const updated = await $fetch<any>(`/api/agency/boards/${props.boardId}/subscribe`, { method: 'POST', body })
    snoozeUntil.value = updated?.snoozeUntil || null
    currentBoardSub.value = { ...sub, ...updated }
    if (!isSubscribed.value) {
      isSubscribed.value = true
      subscriptionLevel.value = classifyLevel(updated)
    }
  } catch (err: any) {
    toast.add({
      title: until ? 'Could not snooze' : 'Could not cancel snooze',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  }
}

function onSettingsSaved(payload: { subscribed: boolean; level: string | null }) {
  isSubscribed.value = payload.subscribed
  subscriptionLevel.value = payload.level
}

const toast = useToast()

async function handleSubscribe(level: string) {
  try {
    if (level === subscriptionLevel.value) {
      // Unsubscribe
      await $fetch(`/api/agency/boards/${props.boardId}/unsubscribe`, { method: 'DELETE' })
      isSubscribed.value = false
      subscriptionLevel.value = null
    } else {
      const events = level === 'mentions' ? ['task_mentioned'] : []
      const isMuted = level === 'muted'
      await $fetch(`/api/agency/boards/${props.boardId}/subscribe`, {
        method: 'POST',
        body: { events, notifyInapp: true, notifyEmail: false, isMuted },
      })
      isSubscribed.value = true
      subscriptionLevel.value = level
    }
  } catch (err: any) {
    console.error('Subscribe failed:', err)
    toast.add({
      title: 'Could not update notifications',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  }
}

function formatRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
</script>
