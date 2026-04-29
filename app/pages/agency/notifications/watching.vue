<template>
  <div class="p-6 max-w-6xl mx-auto">
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">Watching</h1>
      <p class="text-sm text-muted mt-1">
        Boards, items, and columns you're subscribed to. {{ totalCount }} active.
      </p>
    </header>

    <!-- Keyword subscriptions -->
    <section class="mb-8 border border-default rounded-lg p-4">
      <h2 class="text-base font-semibold mb-1">Keywords</h2>
      <p class="text-xs text-muted mb-3">
        Get notified when notification text matches any of these (case-insensitive). Useful for following topics across boards.
      </p>
      <div class="flex flex-wrap gap-2 mb-3">
        <UBadge
          v-for="k in keywords"
          :key="k.id"
          :label="k.keyword"
          color="primary"
          variant="soft"
          size="md"
          class="pr-1 cursor-default"
        >
          <template #trailing>
            <button class="ml-2 hover:text-error" @click="removeKeyword(k.id)" title="Remove">
              <UIcon name="i-lucide-x" class="w-3 h-3" />
            </button>
          </template>
        </UBadge>
        <span v-if="keywords.length === 0" class="text-xs text-muted">No keywords yet.</span>
      </div>
      <form class="flex gap-2" @submit.prevent="addKeyword">
        <UInput
          v-model="newKeyword"
          placeholder="e.g. invoicing"
          size="sm"
          class="flex-1"
          maxlength="80"
        />
        <UButton
          label="Add"
          color="primary"
          size="sm"
          :loading="addingKeyword"
          :disabled="!newKeyword.trim()"
          @click="addKeyword"
        />
      </form>
    </section>

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
      <p v-if="total > subscriptions.length" class="text-xs text-muted">
        Showing {{ subscriptions.length }} of {{ total }} subscriptions.
      </p>
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

      <div v-if="hasMore" class="text-center pt-2">
        <UButton
          label="Load more"
          variant="ghost"
          color="neutral"
          size="sm"
          :loading="loadingMore"
          @click="loadMore"
        />
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

// Keyword subscriptions
interface Keyword { id: string; keyword: string; createdAt: string }
const keywords = ref<Keyword[]>([])
const newKeyword = ref('')
const addingKeyword = ref(false)

async function loadKeywords() {
  try {
    const data = await $fetch<{ keywords: Keyword[] }>('/api/notifications/keywords')
    keywords.value = data.keywords
  } catch {
    keywords.value = []
  }
}

async function addKeyword() {
  const k = newKeyword.value.trim()
  if (!k) return
  addingKeyword.value = true
  try {
    const data = await $fetch<{ id: string; keyword: string; createdAt: string; alreadyExisted?: boolean }>(
      '/api/notifications/keywords',
      { method: 'POST', body: { keyword: k } }
    )
    if (!data.alreadyExisted) {
      keywords.value = [{ id: data.id, keyword: data.keyword, createdAt: data.createdAt }, ...keywords.value]
    }
    newKeyword.value = ''
  } catch (err: any) {
    toast.add({
      title: 'Could not add keyword',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  } finally {
    addingKeyword.value = false
  }
}

async function removeKeyword(id: string) {
  try {
    await $fetch(`/api/notifications/keywords/${id}`, { method: 'DELETE' })
    keywords.value = keywords.value.filter(k => k.id !== id)
  } catch (err: any) {
    toast.add({
      title: 'Could not remove keyword',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  }
}

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

const PAGE_SIZE = 100
const offset = ref(0)
const total = ref(0)
const hasMore = ref(false)
const loadingMore = ref(false)

async function load() {
  loading.value = true
  offset.value = 0
  try {
    const data = await $fetch<{ subscriptions: Subscription[]; total: number; hasMore: boolean }>(
      `/api/notifications/subscriptions?limit=${PAGE_SIZE}&offset=0`
    )
    subscriptions.value = data.subscriptions
    total.value = data.total
    hasMore.value = data.hasMore
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

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  try {
    const newOffset = subscriptions.value.length
    const data = await $fetch<{ subscriptions: Subscription[]; total: number; hasMore: boolean }>(
      `/api/notifications/subscriptions?limit=${PAGE_SIZE}&offset=${newOffset}`
    )
    subscriptions.value = [...subscriptions.value, ...data.subscriptions]
    total.value = data.total
    hasMore.value = data.hasMore
    offset.value = newOffset
  } catch (err: any) {
    toast.add({
      title: 'Could not load more',
      description: err?.statusMessage || 'Please try again.',
      color: 'error',
    })
  } finally {
    loadingMore.value = false
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

onMounted(() => {
  load()
  loadKeywords()
})
</script>
