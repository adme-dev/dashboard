<script setup lang="ts">
import type { OfficePresenceSummary } from '~~/app/types/office'
import { safeMediaUrl } from '~~/app/utils/safe-url'

const props = defineProps<{
  officeId: string
  defaultOpen?: boolean
}>()

const open = ref(props.defaultOpen ?? false)
const refreshing = ref(false)
const presenceFilter = ref<'online' | 'all' | 'guests'>('online')

const apiFetch = $fetch as <T = unknown>(request: string) => Promise<T>
const data = ref<OfficePresenceSummary>({ locations: [], onlineCount: 0, zoneOccupancy: {} })
const pending = ref(false)
const error = ref<unknown>(null)

async function refresh() {
  pending.value = true
  error.value = null
  try {
    data.value = await apiFetch<OfficePresenceSummary>(`/api/office/${props.officeId}/presence`)
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
}

await refresh()
watch(() => props.officeId, () => { refresh() })

const locations = computed(() => data.value?.locations ?? [])
const onlineLocations = computed(() => locations.value.filter(location => location.is_online))
const occupiedRooms = computed(() => Object.keys(data.value?.zoneOccupancy ?? {}).length)
const guestCount = computed(() => onlineLocations.value.filter(location => location.actor_type === 'client').length)
const filteredLocations = computed(() => {
  if (presenceFilter.value === 'guests') return locations.value.filter(location => location.actor_type === 'client')
  if (presenceFilter.value === 'all') return locations.value
  return onlineLocations.value
})
const presenceFilters = computed(() => [
  { value: 'online' as const, label: 'Online', count: onlineLocations.value.length },
  { value: 'guests' as const, label: 'Guests', count: guestCount.value },
  { value: 'all' as const, label: 'Recent', count: locations.value.length }
])
const roomGroups = computed(() => {
  const groups = new Map<string, {
    zoneId: string
    zoneName: string
    zoneType: string
    occupants: OfficePresenceSummary['locations']
  }>()
  for (const location of onlineLocations.value) {
    if (!location.zone_id) continue
    const group = groups.get(location.zone_id) ?? {
      zoneId: location.zone_id,
      zoneName: location.zone_name || 'Unknown room',
      zoneType: location.zone_type?.replaceAll('_', ' ') || 'room',
      occupants: []
    }
    group.occupants.push(location)
    groups.set(location.zone_id, group)
  }
  return Array.from(groups.values()).sort((a, b) => b.occupants.length - a.occupants.length || a.zoneName.localeCompare(b.zoneName))
})

async function refreshPresence() {
  refreshing.value = true
  try {
    await refresh()
  } finally {
    refreshing.value = false
  }
}

function locationName(location: OfficePresenceSummary['locations'][number]) {
  return location.display_name || (location.actor_type === 'client' ? 'Guest' : 'Teammate')
}

function locationMeta(location: OfficePresenceSummary['locations'][number]) {
  if (location.is_online && location.zone_name) return location.zone_name
  if (location.is_online) return 'Online'
  return 'Last seen recently'
}

function seenAtLabel(location: OfficePresenceSummary['locations'][number]) {
  const date = new Date(location.last_seen_at)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}
</script>

<template>
  <section class="mb-3 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0f1218]/85 text-white shadow-[0_18px_55px_-44px_rgba(0,0,0,0.95)] backdrop-blur-xl">
    <div class="flex items-center justify-between gap-3 px-3 py-2.5">
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-2 text-left"
        @click="open = !open"
      >
        <span class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
          <UIcon name="i-lucide-broadcast" class="size-3.5 text-emerald-300" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold">Live view</span>
          <span class="block truncate text-xs text-white/40">
            {{ data?.onlineCount ?? 0 }} online · {{ occupiedRooms }} occupied rooms
          </span>
        </span>
      </button>
      <span class="flex items-center gap-2">
        <button
          v-if="open"
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-white/45 transition hover:bg-white/[0.06] hover:text-white/70 disabled:cursor-wait disabled:opacity-50"
          :disabled="refreshing"
          @click="refreshPresence"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-3.5" :class="{ 'animate-spin': refreshing }" />
        </button>
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-white/45 transition hover:bg-white/[0.06] hover:text-white/70"
          @click="open = !open"
        >
          <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
        </button>
      </span>
    </div>

    <div v-if="open" class="border-t border-white/[0.06] p-3">
      <div
        v-if="pending"
        class="flex items-center justify-center rounded-lg bg-white/[0.035] px-3 py-8 ring-1 ring-white/[0.05]"
      >
        <XfLoader size="sm" />
      </div>
      <div
        v-else-if="error"
        class="rounded-lg bg-red-400/[0.07] px-3 py-3 text-sm text-red-50/80 ring-1 ring-red-300/15"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium text-red-50">
              Could not load live view
            </div>
            <div class="mt-1 text-xs text-red-50/55">
              Presence sync may be unavailable. Retry to refresh the room state.
            </div>
          </div>
          <button
            type="button"
            class="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
            @click="refreshPresence"
          >
            Retry
          </button>
        </div>
      </div>
      <div
        v-else-if="!locations.length"
        class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
      >
        No synced presence yet.
      </div>
      <div v-else class="space-y-3">
        <div class="grid gap-2 sm:grid-cols-4">
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Online
            </div>
            <div class="mt-1 text-sm font-semibold text-emerald-100">
              {{ onlineLocations.length }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Rooms
            </div>
            <div class="mt-1 text-sm font-semibold text-white/75">
              {{ occupiedRooms }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Guests
            </div>
            <div class="mt-1 text-sm font-semibold text-sky-100">
              {{ guestCount }}
            </div>
          </div>
          <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
              Synced
            </div>
            <div class="mt-1 text-sm font-semibold text-white/75">
              {{ locations.length }}
            </div>
          </div>
        </div>

        <div
          v-if="roomGroups.length"
          class="grid gap-2 md:grid-cols-2"
        >
          <div
            v-for="room in roomGroups"
            :key="room.zoneId"
            class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="truncate text-xs font-semibold text-white/75">{{ room.zoneName }}</span>
              <span class="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-100 ring-1 ring-emerald-300/15">
                {{ room.occupants.length }} online
              </span>
            </div>
            <div class="mt-0.5 text-[11px] capitalize text-white/35">
              {{ room.zoneType }}
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <UAvatar
                v-for="occupant in room.occupants.slice(0, 8)"
                :key="occupant.handle"
                :src="safeMediaUrl(occupant.avatar_url)"
                :alt="locationName(occupant)"
                size="3xs"
              />
              <span
                v-if="room.occupants.length > 8"
                class="inline-flex size-6 items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-semibold text-white/55 ring-1 ring-white/[0.08]"
              >
                +{{ room.occupants.length - 8 }}
              </span>
            </div>
          </div>
        </div>

        <div class="grid gap-2 sm:grid-cols-3">
          <button
            v-for="filter in presenceFilters"
            :key="filter.value"
            type="button"
            class="rounded-lg px-3 py-2 text-left ring-1 transition"
            :class="presenceFilter === filter.value
              ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/20'
              : 'bg-white/[0.035] text-white/55 ring-white/[0.05] hover:bg-white/[0.055]'"
            @click="presenceFilter = filter.value"
          >
            <div class="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60">
              {{ filter.label }}
            </div>
            <div class="mt-1 text-lg font-semibold tabular-nums">
              {{ filter.count }}
            </div>
          </button>
        </div>

        <div
          v-if="!filteredLocations.length"
          class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
        >
          No {{ presenceFilter }} presence records.
        </div>

        <div v-else class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="location in filteredLocations"
            :key="location.handle"
            class="flex min-w-0 items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2 ring-1 ring-white/[0.05]"
          >
            <UAvatar
              :src="safeMediaUrl(location.avatar_url)"
              :alt="locationName(location)"
              size="xs"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium text-white/80">{{ locationName(location) }}</span>
              <span class="block truncate text-[11px] text-white/40">{{ locationMeta(location) }}</span>
            </span>
            <span class="shrink-0 text-[10px] text-white/30">{{ seenAtLabel(location) }}</span>
            <span
              class="size-2 shrink-0 rounded-full"
              :class="location.is_online ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-white/20'"
            />
          </div>
        </div>
      </div>

      <div
        v-if="open && onlineLocations.length"
        class="mt-2 text-[11px] text-white/35"
      >
        Server-synced presence updates on room moves, leaves, and disconnects.
      </div>
    </div>
  </section>
</template>
