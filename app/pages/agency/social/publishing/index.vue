<script setup lang="ts">
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfDay, endOfDay,
  addDays, addWeeks, addMonths, isSameMonth, isSameDay, format, parseISO,
} from 'date-fns'
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import type { SocialPost } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const api = useSocialPublishing()

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

type View = 'month' | 'week' | 'day'
const view = ref<View>('month')
const viewItems: { label: string; value: View }[] = [
  { label: 'Month', value: 'month' },
  { label: 'Week', value: 'week' },
  { label: 'Day', value: 'day' },
]

const cursor = ref(new Date())
const posts = ref<SocialPost[]>([])
const loading = ref(false)
const approvalsCount = ref(0)

const STATUS_COLOR: Record<string, string> = {
  draft: 'neutral', approved: 'info', scheduled: 'primary', publishing: 'warning',
  published: 'success', partially_published: 'warning', failed: 'error', cancelled: 'neutral',
}

// Visible date range for the active view (also drives what we fetch).
const range = computed(() => {
  if (view.value === 'day') return { from: startOfDay(cursor.value), to: endOfDay(cursor.value) }
  if (view.value === 'week') {
    return { from: startOfWeek(cursor.value, { weekStartsOn: 0 }), to: endOfWeek(cursor.value, { weekStartsOn: 0 }) }
  }
  return { from: startOfWeek(startOfMonth(cursor.value), { weekStartsOn: 0 }), to: endOfWeek(endOfMonth(cursor.value), { weekStartsOn: 0 }) }
})

const monthDays = computed(() => {
  const days: Date[] = []
  for (let d = range.value.from; d <= range.value.to; d = addDays(d, 1)) days.push(d)
  return days
})
const weekDays = computed(() => {
  const start = startOfWeek(cursor.value, { weekStartsOn: 0 })
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
})

function postIso(p: SocialPost): string | null {
  return p.scheduled_at || p.published_at || p.created_at || null
}
function postsOn(day: Date): SocialPost[] {
  return posts.value
    .filter((p) => { const iso = postIso(p); return iso && isSameDay(parseISO(iso), day) })
    .sort((a, b) => (postIso(a) || '').localeCompare(postIso(b) || ''))
}
function postTime(p: SocialPost): string {
  const iso = postIso(p)
  return iso ? format(parseISO(iso), 'HH:mm') : ''
}

async function load() {
  if (!clientId.value) return
  loading.value = true
  try {
    posts.value = await api.getCalendar(clientId.value, range.value.from.toISOString(), range.value.to.toISOString())
    approvalsCount.value = (await api.getApprovalsBadge(clientId.value)).count
  } finally {
    loading.value = false
  }
}
watch([clientId, cursor, view], load, { immediate: true })

function navigate(dir: -1 | 1) {
  if (view.value === 'day') cursor.value = addDays(cursor.value, dir)
  else if (view.value === 'week') cursor.value = addWeeks(cursor.value, dir)
  else cursor.value = addMonths(cursor.value, dir)
}

const headingLabel = computed(() => {
  if (view.value === 'day') return format(cursor.value, 'EEEE, d MMM yyyy')
  if (view.value === 'week') {
    const s = startOfWeek(cursor.value, { weekStartsOn: 0 })
    const e = endOfWeek(cursor.value, { weekStartsOn: 0 })
    return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`
  }
  return format(cursor.value, 'MMMM yyyy')
})

function newPostOn(day: Date) {
  navigateTo({ path: '/agency/social/publishing/compose', query: { client: clientId.value, date: day.toISOString() } })
}
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
</script>

<template>
  <div class="p-6">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Social Calendar</h1>
        <p class="text-sm text-muted mt-0.5">Plan, schedule, and track every organic post in one place.</p>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="approvalsCount"
          to="/agency/social/publishing/approvals"
          color="warning" variant="subtle" icon="i-lucide-clipboard-check"
        >
          {{ approvalsCount }} awaiting approval
        </UButton>
        <USelectMenu
          v-model="clientId"
          :items="clientOptions" value-key="value" label-key="label"
          placeholder="Select client" icon="i-lucide-building-2" class="w-56"
        />
        <UButton :to="{ path: '/agency/social/publishing/compose', query: { client: clientId } }" color="primary" icon="i-lucide-plus">
          New post
        </UButton>
      </div>
    </div>

    <SocialPublishingSectionNav />

    <!-- View toggle + nav -->
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-medium">{{ headingLabel }}</h2>
        <span v-if="loading" class="text-xs text-muted">loading…</span>
      </div>
      <div class="flex items-center gap-3">
        <UButton
          v-for="v in viewItems" :key="v.value"
          :color="view === v.value ? 'primary' : 'neutral'"
          :variant="view === v.value ? 'subtle' : 'ghost'"
          size="sm"
          @click="view = v.value"
        >{{ v.label }}</UButton>
        <div class="flex items-center gap-1">
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" @click="navigate(-1)" />
          <UButton color="neutral" variant="ghost" size="sm" @click="cursor = new Date()">Today</UButton>
          <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" @click="navigate(1)" />
        </div>
      </div>
    </div>

    <!-- MONTH -->
    <div v-if="view === 'month'" class="rounded-lg border border-default overflow-hidden">
      <div class="grid grid-cols-7 bg-elevated text-xs font-medium text-muted">
        <div v-for="w in weekdayLabels" :key="w" class="px-2 py-2 text-center">{{ w }}</div>
      </div>
      <div class="grid grid-cols-7">
        <div
          v-for="day in monthDays" :key="day.toISOString()"
          class="min-h-28 border-t border-l border-default p-1.5 group relative"
          :class="[
            isSameMonth(day, cursor) ? '' : 'bg-muted/30',
            isSameDay(day, new Date()) ? 'ring-1 ring-primary ring-inset' : '',
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs" :class="isSameMonth(day, cursor) ? 'text-default' : 'text-muted'">{{ format(day, 'd') }}</span>
            <UButton icon="i-lucide-plus" size="xs" variant="ghost" color="neutral"
              class="opacity-0 group-hover:opacity-100 transition-opacity" @click="newPostOn(day)" />
          </div>
          <div class="mt-1 space-y-1">
            <NuxtLink v-for="p in postsOn(day)" :key="p.id" :to="{ path: '/agency/social/publishing/compose', query: { edit: p.id } }" class="block">
              <UBadge :color="(STATUS_COLOR[p.status] as any) || 'neutral'" variant="subtle" class="w-full justify-start truncate">
                <span class="truncate">{{ p.content?.slice(0, 24) || '(no copy)' }}</span>
              </UBadge>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- WEEK -->
    <div v-else-if="view === 'week'" class="grid grid-cols-7 gap-2">
      <div
        v-for="day in weekDays" :key="day.toISOString()"
        class="min-h-64 rounded-lg border border-default p-2 group"
        :class="isSameDay(day, new Date()) ? 'ring-1 ring-primary ring-inset' : ''"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="text-xs font-medium">
            <div class="text-muted">{{ format(day, 'EEE') }}</div>
            <div class="text-base leading-none">{{ format(day, 'd') }}</div>
          </div>
          <UButton icon="i-lucide-plus" size="xs" variant="ghost" color="neutral"
            class="opacity-0 group-hover:opacity-100 transition-opacity" @click="newPostOn(day)" />
        </div>
        <div class="space-y-1">
          <NuxtLink v-for="p in postsOn(day)" :key="p.id" :to="{ path: '/agency/social/publishing/compose', query: { edit: p.id } }" class="block">
            <div class="rounded-md border border-default p-1.5 hover:bg-elevated transition-colors">
              <div class="flex items-center gap-1">
                <span class="text-[10px] tabular-nums text-muted">{{ postTime(p) }}</span>
                <UBadge :color="(STATUS_COLOR[p.status] as any) || 'neutral'" variant="subtle" size="xs">{{ p.status }}</UBadge>
              </div>
              <p class="text-xs truncate mt-0.5">{{ p.content?.slice(0, 30) || '(no copy)' }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- DAY -->
    <div v-else class="rounded-lg border border-default divide-y divide-default">
      <div class="flex items-center justify-between p-3 bg-elevated">
        <span class="text-sm font-medium">{{ postsOn(cursor).length }} post(s)</span>
        <UButton icon="i-lucide-plus" size="xs" color="neutral" variant="subtle" @click="newPostOn(cursor)">Add to this day</UButton>
      </div>
      <NuxtLink
        v-for="p in postsOn(cursor)" :key="p.id"
        :to="{ path: '/agency/social/publishing/compose', query: { edit: p.id } }"
        class="flex items-start gap-3 p-3 hover:bg-elevated transition-colors"
      >
        <span class="text-sm tabular-nums text-muted w-12 shrink-0 pt-0.5">{{ postTime(p) || '—' }}</span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-1 mb-1">
            <UBadge :color="(STATUS_COLOR[p.status] as any) || 'neutral'" variant="subtle" size="xs">{{ p.status }}</UBadge>
            <UBadge v-for="pl in p.platforms" :key="pl" color="neutral" variant="subtle" size="xs">{{ pl }}</UBadge>
          </div>
          <p class="text-sm truncate">{{ p.content || '(no copy)' }}</p>
        </div>
      </NuxtLink>
      <div v-if="!postsOn(cursor).length" class="p-10 text-center text-muted text-sm">Nothing scheduled this day.</div>
    </div>
  </div>
</template>
