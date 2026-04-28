<template>
  <div class="p-6 max-w-6xl mx-auto">
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">Watching</h1>
      <p class="text-sm text-muted mt-1">
        Boards, items, and columns you're subscribed to. {{ totalCount }} active.
      </p>
    </header>

    <div class="flex items-center gap-3 mb-4">
      <div class="flex items-center gap-1">
        <UButton
          v-for="f in scopeFilters"
          :key="f.value"
          :label="f.label"
          :variant="scopeFilter === f.value ? 'soft' : 'ghost'"
          :color="scopeFilter === f.value ? 'primary' : 'neutral'"
          size="xs"
          @click="scopeFilter = f.value"
        />
      </div>
      <UInput
        v-model="searchQuery"
        icon="i-lucide-search"
        placeholder="Search by board name…"
        size="sm"
        class="ml-auto w-64"
      />
    </div>

    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="i in 5" :key="i" class="h-12 w-full" />
    </div>

    <div v-else-if="filtered.length === 0" class="text-center py-12 text-muted">
      <UIcon name="i-lucide-bell-off" class="w-10 h-10 mx-auto mb-3 opacity-50" />
      <p class="text-sm">{{ searchQuery || scopeFilter !== 'all' ? 'No matching subscriptions.' : 'You\'re not watching anything yet.' }}</p>
    </div>

    <div v-else class="space-y-6">
      <div v-for="group in groupedByBoard" :key="group.boardId" class="border border-default rounded-lg overflow-hidden">
        <div class="px-4 py-2.5 bg-elevated/30 border-b border-default flex items-center gap-2">
          <UIcon name="i-lucide-columns-3" class="w-4 h-4 text-muted" />
          <NuxtLink :to="`/agency/boards/${group.boardId}`" class="text-sm font-medium hover:underline">
            {{ group.boardName }}
          </NuxtLink>
          <span class="text-xs text-muted ml-auto">{{ group.subs.length }} subscription{{ group.subs.length === 1 ? '' : 's' }}</span>
        </div>
        <div class="divide-y divide-default">
          <div
            v-for="sub in group.subs"
            :key="sub.id"
            class="px-4 py-3 flex items-center gap-3 hover:bg-elevated/30"
          >
            <UIcon
              :name="scopeIcon(sub.scope)"
              class="w-4 h-4 text-muted flex-shrink-0"
            />
            <div class="min-w-0 flex-1">
              <p class="text-sm truncate">
                <span class="font-medium">{{ scopeLabel(sub) }}</span>
                <span v-if="sub.itemTitle || sub.columnName" class="text-muted">
                  · {{ sub.itemTitle || sub.columnName }}
                </span>
              </p>
              <p v-if="isSnoozed(sub)" class="text-xs text-warning mt-0.5">
                Snoozed for {{ snoozeRelative(sub.snoozeUntil) }}
              </p>
            </div>
            <UBadge
              :label="presetLabel(sub.preset)"
              :color="presetColor(sub.preset)"
              variant="subtle"
              size="xs"
              class="flex-shrink-0"
            />
            <UIcon
              v-if="sub.notifyEmail"
              name="i-lucide-mail"
              class="w-4 h-4 text-muted flex-shrink-0"
              title="Email notifications enabled"
            />
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              size="xs"
              color="neutral"
              :loading="unwatching === sub.id"
              title="Unwatch"
              @click="unwatch(sub.id)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'agency',
})

interface Subscription {
  id: string
  boardId: string
  boardName: string
  itemId: string | null
  itemTitle: string | null
  columnId: string | null
  columnName: string | null
  scope: 'board' | 'item' | 'column'
  preset: 'all' | 'mentions' | 'custom' | 'muted'
  events: string[]
  notifyInapp: boolean
  notifyEmail: boolean
  isMuted: boolean
  snoozeUntil: string | null
  createdAt: string
  updatedAt: string
}

const subscriptions = ref<Subscription[]>([])
const loading = ref(true)
const unwatching = ref<string | null>(null)
const scopeFilter = ref<'all' | 'board' | 'item' | 'column'>('all')
const searchQuery = ref('')
const toast = useToast()

const scopeFilters = [
  { value: 'all', label: 'All' },
  { value: 'board', label: 'Boards' },
  { value: 'item', label: 'Items' },
  { value: 'column', label: 'Columns' },
] as const

const totalCount = computed(() => subscriptions.value.length)

const filtered = computed(() => {
  let rows = subscriptions.value
  if (scopeFilter.value !== 'all') {
    rows = rows.filter(r => r.scope === scopeFilter.value)
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    rows = rows.filter(r => r.boardName.toLowerCase().includes(q))
  }
  return rows
})

const groupedByBoard = computed(() => {
  const groups: Record<string, { boardId: string; boardName: string; subs: Subscription[] }> = {}
  for (const sub of filtered.value) {
    if (!groups[sub.boardId]) {
      groups[sub.boardId] = { boardId: sub.boardId, boardName: sub.boardName, subs: [] }
    }
    groups[sub.boardId].subs.push(sub)
  }
  return Object.values(groups).sort((a, b) => a.boardName.localeCompare(b.boardName))
})

function scopeIcon(scope: string): string {
  if (scope === 'board') return 'i-lucide-columns-3'
  if (scope === 'item') return 'i-lucide-square-check'
  return 'i-lucide-columns'
}

function scopeLabel(sub: Subscription): string {
  if (sub.scope === 'board') return 'Entire board'
  if (sub.scope === 'item') return 'Item'
  return 'Column'
}

function presetLabel(p: string): string {
  return { all: 'All activity', mentions: 'Mentions only', custom: 'Custom', muted: 'Muted' }[p] || p
}

function presetColor(p: string): 'primary' | 'neutral' | 'warning' | 'info' {
  if (p === 'all') return 'primary'
  if (p === 'mentions') return 'info'
  if (p === 'muted') return 'neutral'
  return 'warning' // custom
}

function isSnoozed(sub: Subscription): boolean {
  if (!sub.snoozeUntil) return false
  return new Date(sub.snoozeUntil).getTime() > Date.now()
}

function snoozeRelative(iso: string | null): string {
  if (!iso) return ''
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return ''
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

async function load() {
  loading.value = true
  try {
    const data = await $fetch<{ subscriptions: Subscription[] }>('/api/notifications/subscriptions')
    subscriptions.value = data.subscriptions
  } catch (err: any) {
    toast.add({
      title: 'Could not load subscriptions',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}

async function unwatch(id: string) {
  unwatching.value = id
  try {
    await $fetch(`/api/notifications/subscriptions/${id}`, { method: 'DELETE' })
    subscriptions.value = subscriptions.value.filter(s => s.id !== id)
    toast.add({ title: 'Unwatched', color: 'success' })
  } catch (err: any) {
    toast.add({
      title: 'Could not unwatch',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  } finally {
    unwatching.value = null
  }
}

onMounted(load)
</script>
