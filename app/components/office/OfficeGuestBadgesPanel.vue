<script setup lang="ts">
import type { OfficeGuestBadgeRow } from '~~/app/types/office'

type GuestBadgeWithZone = OfficeGuestBadgeRow & {
  zone_name: string | null
  zone_slug: string | null
}

const props = defineProps<{
  officeId: string
  defaultOpen?: boolean
}>()

const toast = useToast()
const open = ref(props.defaultOpen ?? false)
const updatingBadgeId = ref<string | null>(null)
const openingBadgeThreadId = ref<string | null>(null)
const statusFilter = ref<'all' | 'active' | 'expired' | 'revoked'>('all')
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>
const data = ref<{ badges: GuestBadgeWithZone[] }>({ badges: [] })
const pending = ref(false)
const error = ref<unknown>(null)

async function refresh() {
  pending.value = true
  error.value = null
  try {
    data.value = await apiFetch<{ badges: GuestBadgeWithZone[] }>(`/api/office/${props.officeId}/guest-badges`)
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
}

const badges = computed(() => data.value?.badges ?? [])
const activeCount = computed(() => badges.value.filter(badge => badge.status === 'active').length)
const expiredCount = computed(() => badges.value.filter(badge => badge.status === 'expired').length)
const revokedCount = computed(() => badges.value.filter(badge => badge.status === 'revoked').length)
const expiringSoonCount = computed(() => {
  const soon = Date.now() + 60 * 60 * 1000
  return badges.value.filter((badge) => {
    if (badge.status !== 'active') return false
    const expiresAt = new Date(badge.expires_at).getTime()
    return Number.isFinite(expiresAt) && expiresAt <= soon
  }).length
})
const filteredBadges = computed(() =>
  statusFilter.value === 'all'
    ? badges.value
    : badges.value.filter(badge => badge.status === statusFilter.value)
)
const badgeFilters = computed(() => [
  { value: 'all' as const, label: 'All', count: badges.value.length },
  { value: 'active' as const, label: 'Active', count: activeCount.value },
  { value: 'expired' as const, label: 'Expired', count: expiredCount.value },
  { value: 'revoked' as const, label: 'Revoked', count: revokedCount.value }
])

function badgeStatusClass(badge: GuestBadgeWithZone) {
  if (badge.status === 'active') return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (badge.status === 'expired') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  return 'bg-red-400/10 text-red-100 ring-red-300/15'
}

function badgeExpiryLabel(badge: GuestBadgeWithZone) {
  const expiresAt = new Date(badge.expires_at)
  if (Number.isNaN(expiresAt.getTime())) return 'Expiry unavailable'
  const formatted = expiresAt.toLocaleString()
  if (badge.status === 'active') return `Expires ${formatted}`
  if (badge.status === 'expired') return `Expired ${formatted}`
  return `Revoked${badge.revoked_at ? ` ${new Date(badge.revoked_at).toLocaleString()}` : ''}`
}

function badgeRoomLabel(badge: GuestBadgeWithZone) {
  return badge.zone_name || 'No approved room'
}

function badgeRiskLabel(badge: GuestBadgeWithZone) {
  if (badge.status === 'revoked') return 'Access blocked'
  if (badge.status === 'expired') return 'Access expired'
  const expiresAt = new Date(badge.expires_at).getTime()
  if (!Number.isFinite(expiresAt)) return 'Expiry unavailable'
  const minutes = Math.ceil((expiresAt - Date.now()) / 60_000)
  if (minutes <= 0) return 'Expiring now'
  if (minutes <= 60) return `Expires in ${minutes} min`
  return 'Access active'
}

function canReactivateBadge(badge: GuestBadgeWithZone) {
  return badge.status === 'expired' && Boolean(badge.allowed_zone_id)
}

async function updateBadge(badge: GuestBadgeWithZone, action: 'revoke' | 'reactivate') {
  updatingBadgeId.value = badge.id
  try {
    await apiFetch(`/api/office/${props.officeId}/guest-badges/${badge.id}`, {
      method: 'PATCH',
      body: { action }
    })
    toast.add({
      title: action === 'revoke' ? 'Guest badge revoked' : 'Guest badge reactivated',
      icon: action === 'revoke' ? 'i-lucide-ban' : 'i-lucide-badge-check',
      color: 'success',
      duration: 1600
    })
    await refresh()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not update guest badge',
      description: message || 'Try again in a moment.',
      color: 'error'
    })
  } finally {
    updatingBadgeId.value = null
  }
}

async function openBadgeThread(badge: GuestBadgeWithZone) {
  openingBadgeThreadId.value = badge.id
  try {
    const channel = await apiFetch<{ id: string }>(`/api/office/${props.officeId}/guest-badges/${badge.id}/thread`, {
      method: 'POST'
    })
    await navigateTo(`/agency/chat?channel=${encodeURIComponent(channel.id)}`)
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not open guest thread',
      description: message || 'Try again in a moment.',
      color: 'error'
    })
  } finally {
    openingBadgeThreadId.value = null
  }
}

watch(open, (isOpen) => {
  if (isOpen) void refresh()
}, { immediate: true })

watch(() => props.officeId, () => {
  if (open.value) void refresh()
})
</script>

<template>
  <section class="mb-3 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0f1218]/85 text-white shadow-[0_18px_55px_-44px_rgba(0,0,0,0.95)] backdrop-blur-xl">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      @click="open = !open"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span class="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
          <UIcon name="i-lucide-badge-check" class="size-3.5 text-emerald-300" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold">Guest badges</span>
          <span class="block truncate text-xs text-white/40">
            {{ activeCount }} active · {{ expiredCount }} expired · {{ revokedCount }} revoked
          </span>
        </span>
      </span>
      <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 text-white/45" />
    </button>

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
              Could not load guest badges
            </div>
            <div class="mt-1 text-xs text-red-50/55">
              Guest access data is temporarily unavailable.
            </div>
          </div>
          <button
            type="button"
            class="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
            @click="() => refresh()"
          >
            Retry
          </button>
        </div>
      </div>
      <div
        v-else-if="!badges.length"
        class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
      >
        No guest badges issued yet.
      </div>
      <div v-else class="space-y-3">
        <div class="grid gap-2 sm:grid-cols-4">
          <button
            v-for="filter in badgeFilters"
            :key="filter.value"
            type="button"
            class="rounded-lg px-3 py-2 text-left ring-1 transition"
            :class="statusFilter === filter.value
              ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/20'
              : 'bg-white/[0.035] text-white/55 ring-white/[0.05] hover:bg-white/[0.055]'"
            @click="statusFilter = filter.value"
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
          v-if="expiringSoonCount"
          class="flex items-center gap-2 rounded-lg bg-amber-300/[0.055] px-3 py-2 text-xs text-amber-50/75 ring-1 ring-amber-200/12"
        >
          <UIcon name="i-lucide-clock-alert" class="size-4 shrink-0 text-amber-100" />
          {{ expiringSoonCount }} active badge{{ expiringSoonCount === 1 ? '' : 's' }} expire within the next hour.
        </div>

        <div
          v-if="!filteredBadges.length"
          class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
        >
          No {{ statusFilter }} guest badges.
        </div>

        <div v-else class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="badge in filteredBadges"
            :key="badge.id"
            class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]"
          >
            <div class="flex items-center justify-between gap-3">
              <span class="truncate text-sm font-medium">{{ badge.guest_name }}</span>
              <span
                class="rounded-md px-1.5 py-0.5 text-[11px] font-medium capitalize ring-1"
                :class="badgeStatusClass(badge)"
              >
                {{ badge.status }}
              </span>
            </div>
            <div class="mt-0.5 truncate text-xs text-white/40">
              {{ badge.guest_email }} · {{ badgeRoomLabel(badge) }}
            </div>
            <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-white/35">
              <span>{{ badgeExpiryLabel(badge) }}</span>
              <span class="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-medium text-white/42 ring-1 ring-white/[0.05]">
                {{ badgeRiskLabel(badge) }}
              </span>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <button
                type="button"
                class="rounded-md bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-wait disabled:opacity-60"
                :disabled="openingBadgeThreadId === badge.id"
                @click="openBadgeThread(badge)"
              >
                {{ openingBadgeThreadId === badge.id ? 'Opening' : 'Thread' }}
              </button>
              <button
                v-if="badge.status === 'active'"
                type="button"
                class="ml-auto rounded-md bg-red-400/10 px-2 py-1 text-[11px] font-medium text-red-100 ring-1 ring-red-300/15 transition hover:bg-red-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingBadgeId === badge.id"
                @click="updateBadge(badge, 'revoke')"
              >
                Revoke
              </button>
              <button
                v-else-if="canReactivateBadge(badge)"
                type="button"
                class="ml-auto rounded-md bg-emerald-400/10 px-2 py-1 text-[11px] font-medium text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="updatingBadgeId === badge.id"
                @click="updateBadge(badge, 'reactivate')"
              >
                Reactivate
              </button>
              <span
                v-else
                class="ml-auto rounded-md bg-white/[0.035] px-2 py-1 text-[11px] font-medium text-white/35 ring-1 ring-white/[0.05]"
              >
                {{ badge.status === 'revoked' ? 'Revoked' : 'No room' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
