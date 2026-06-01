<script setup lang="ts">
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths,
  isSameMonth, isSameDay, format, parseISO,
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

const cursor = ref(new Date())
const posts = ref<SocialPost[]>([])
const loading = ref(false)
const approvalsCount = ref(0)

const STATUS_COLOR: Record<string, string> = {
  draft: 'neutral', approved: 'info', scheduled: 'primary', publishing: 'warning',
  published: 'success', partially_published: 'warning', failed: 'error', cancelled: 'neutral',
}

const gridDays = computed(() => {
  const from = startOfWeek(startOfMonth(cursor.value), { weekStartsOn: 0 })
  const to = endOfWeek(endOfMonth(cursor.value), { weekStartsOn: 0 })
  const days: Date[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  return days
})

function postsOn(day: Date): SocialPost[] {
  return posts.value.filter((p) => {
    const iso = p.scheduled_at || p.published_at || p.created_at
    return iso && isSameDay(parseISO(iso), day)
  })
}

async function load() {
  if (!clientId.value) return
  loading.value = true
  try {
    const from = startOfWeek(startOfMonth(cursor.value), { weekStartsOn: 0 }).toISOString()
    const to = endOfWeek(endOfMonth(cursor.value), { weekStartsOn: 0 }).toISOString()
    posts.value = await api.getCalendar(clientId.value, from, to)
    approvalsCount.value = (await api.getApprovalsBadge(clientId.value)).count
  } finally {
    loading.value = false
  }
}

watch([clientId, cursor], load, { immediate: true })

function newPostOn(day: Date) {
  navigateTo({ path: '/agency/social/publishing/compose', query: { client: clientId.value, date: day.toISOString() } })
}
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
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

    <!-- Month nav -->
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-lg font-medium">{{ format(cursor, 'MMMM yyyy') }}</h2>
      <div class="flex items-center gap-1">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" @click="cursor = addMonths(cursor, -1)" />
        <UButton color="neutral" variant="ghost" size="sm" @click="cursor = new Date()">Today</UButton>
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" @click="cursor = addMonths(cursor, 1)" />
      </div>
    </div>

    <!-- Calendar grid -->
    <div class="rounded-lg border border-default overflow-hidden">
      <div class="grid grid-cols-7 bg-elevated text-xs font-medium text-muted">
        <div v-for="w in weekdays" :key="w" class="px-2 py-2 text-center">{{ w }}</div>
      </div>
      <div class="grid grid-cols-7">
        <div
          v-for="day in gridDays" :key="day.toISOString()"
          class="min-h-28 border-t border-l border-default p-1.5 group relative"
          :class="[
            isSameMonth(day, cursor) ? '' : 'bg-muted/30',
            isSameDay(day, new Date()) ? 'ring-1 ring-primary ring-inset' : '',
          ]"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs" :class="isSameMonth(day, cursor) ? 'text-default' : 'text-muted'">
              {{ format(day, 'd') }}
            </span>
            <UButton
              icon="i-lucide-plus" size="xs" variant="ghost" color="neutral"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click="newPostOn(day)"
            />
          </div>
          <div class="mt-1 space-y-1">
            <NuxtLink
              v-for="p in postsOn(day)" :key="p.id"
              :to="{ path: '/agency/social/publishing/compose', query: { edit: p.id } }"
              class="block"
            >
              <UBadge
                :color="(STATUS_COLOR[p.status] as any) || 'neutral'" variant="subtle"
                class="w-full justify-start truncate"
              >
                <span class="truncate">{{ p.content?.slice(0, 24) || '(no copy)' }}</span>
              </UBadge>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
