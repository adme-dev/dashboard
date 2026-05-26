<script setup lang="ts">
import type { OfficeAuditEventRow } from '~~/app/types/office'

type AuditEventWithActor = OfficeAuditEventRow & {
  actor_name: string | null
  actor_avatar_url: string | null
}

const props = defineProps<{
  officeId: string
  defaultOpen?: boolean
  refreshKey?: number
}>()

const open = ref(props.defaultOpen ?? false)
const toneFilter = ref<'all' | 'success' | 'warning' | 'danger' | 'neutral'>('all')
const { data, pending, refresh, error } = useFetch<{ events: AuditEventWithActor[] }>(
  () => `/api/office/${props.officeId}/audit`,
  {
    watch: [() => props.officeId],
    default: () => ({ events: [] }),
    immediate: false
  }
)

const events = computed(() => data.value?.events ?? [])
const sensitiveEventCount = computed(() => events.value.filter(event => actionTone(event.action) !== 'neutral').length)
const filteredEvents = computed(() =>
  toneFilter.value === 'all'
    ? events.value
    : events.value.filter(event => actionTone(event.action) === toneFilter.value)
)
const auditFilters = computed(() => [
  { value: 'all' as const, label: 'All', count: events.value.length },
  { value: 'danger' as const, label: 'Sensitive', count: events.value.filter(event => actionTone(event.action) === 'danger').length },
  { value: 'warning' as const, label: 'Policy', count: events.value.filter(event => actionTone(event.action) === 'warning').length },
  { value: 'success' as const, label: 'Completed', count: events.value.filter(event => actionTone(event.action) === 'success').length },
  { value: 'neutral' as const, label: 'Other', count: events.value.filter(event => actionTone(event.action) === 'neutral').length }
])

watch(open, (isOpen) => {
  if (isOpen) void refresh()
}, { immediate: true })

watch(
  () => props.refreshKey,
  () => {
    if (open.value) void refresh()
  }
)

function actionLabel(action: string) {
  return action.replaceAll('_', ' ').replaceAll('.', ' · ')
}

function actionTone(action: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (action.includes('revoked') || action.includes('cancelled') || action.includes('expired') || action.includes('evicted') || action.includes('deleted')) return 'danger'
  if (action.includes('updated') || action.includes('reactivated') || action.includes('active')) return 'warning'
  if (action.includes('created') || action.includes('approved') || action.includes('sent') || action.includes('live') || action.includes('captured')) return 'success'
  return 'neutral'
}

function actionBadgeClass(action: string) {
  const tone = actionTone(action)
  if (tone === 'success') return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (tone === 'warning') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  if (tone === 'danger') return 'bg-red-400/10 text-red-100 ring-red-300/15'
  return 'bg-white/[0.06] text-white/45 ring-white/[0.06]'
}

function eventTimeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function metadataRecord(event: AuditEventWithActor) {
  return event.metadata && typeof event.metadata === 'object'
    ? event.metadata as Record<string, unknown>
    : {}
}

function formatMetadataValue(value: unknown) {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.map(item => formatMetadataValue(item)).filter(Boolean).join(', ')
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const allowedRoles = Array.isArray(record.allowed_roles)
      ? record.allowed_roles.map(item => formatMetadataValue(item)).filter(Boolean).join(', ')
      : ''
    const publicLobby = record.public_lobby === true ? 'public lobby' : ''
    const position = ['x', 'y', 'w', 'h'].every(key => typeof record[key] === 'number')
      ? `${record.x},${record.y} ${record.w}x${record.h}`
      : ''
    return [allowedRoles, publicLobby, position].filter(Boolean).join(' · ')
  }
  if (typeof value !== 'string') return ''
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }).format(date)
  }
  return value.replaceAll('_', ' ')
}

function metadataChips(event: AuditEventWithActor) {
  const metadata = metadataRecord(event)
  const keys = [
    'title',
    'meeting_type',
    'intake_prompt',
    'status',
    'scheduled_start_at',
    'duration_minutes',
    'guest_count',
    'guestEmail',
    'retention_days',
    'expiresAt',
    'allowedZoneId',
    'guest_access_expired',
    'guest_badges_expired',
    'source',
    'lobby_request_id',
    'guest_email',
    'guest_name',
    'intake_count',
    'has_guest_note',
    'create_placeholders',
    'zone_id',
    'changed',
    'name',
    'slug',
    'zone_type',
    'capacity',
    'is_private',
    'acl',
    'position',
    'evicted_name',
    'evicted_handle'
  ]
  return keys
    .map((key) => {
      const value = metadata[key]
      const formatted = formatMetadataValue(value)
      if (!formatted) return null
      return {
        key,
        label: key.replaceAll('_', ' '),
        value: metadataChipValue(key, formatted)
      }
    })
    .filter((chip): chip is { key: string, label: string, value: string } => Boolean(chip))
    .slice(0, 4)
}

function metadataChipValue(key: string, formatted: string) {
  if (key === 'duration_minutes') return `${formatted} min`
  if (key === 'retention_days') return `${formatted} days`
  if (key === 'guest_access_expired') return `${formatted} passes`
  if (key === 'guest_badges_expired') return `${formatted} badges`
  if (key === 'intake_count') return `${formatted} answers`
  if (key === 'changed') return formatted.replaceAll(',', ' ·')
  if (key === 'is_private') return formatted === 'Yes' ? 'Private' : 'Open'
  return formatted
}
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
          <UIcon name="i-lucide-history" class="size-3.5 text-cyan-300" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold">Audit trail</span>
          <span class="block truncate text-xs text-white/40">
            {{ events.length }} events · {{ sensitiveEventCount }} sensitive
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
              Could not load audit trail
            </div>
            <div class="mt-1 text-xs text-red-50/55">
              Check your office admin access or retry the request.
            </div>
          </div>
          <button
            type="button"
            class="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
            @click="refresh"
          >
            Retry
          </button>
        </div>
      </div>
      <div
        v-else-if="!events.length"
        class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
      >
        No audit events yet.
      </div>
      <div v-else class="space-y-3">
        <div class="grid gap-2 sm:grid-cols-5">
          <button
            v-for="filter in auditFilters"
            :key="filter.value"
            type="button"
            class="rounded-lg px-3 py-2 text-left ring-1 transition"
            :class="toneFilter === filter.value
              ? 'bg-cyan-400/10 text-cyan-100 ring-cyan-300/20'
              : 'bg-white/[0.035] text-white/55 ring-white/[0.05] hover:bg-white/[0.055]'"
            @click="toneFilter = filter.value"
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
          v-if="!filteredEvents.length"
          class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
        >
          No {{ toneFilter }} audit events.
        </div>

        <div v-else class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="event in filteredEvents"
            :key="event.id"
            class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]"
          >
            <div class="flex items-center justify-between gap-3">
              <span
                class="truncate rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ring-1"
                :class="actionBadgeClass(event.action)"
              >
                {{ actionLabel(event.action) }}
              </span>
              <span class="shrink-0 text-[11px] text-white/35">{{ eventTimeLabel(event.created_at) }}</span>
            </div>
            <div class="mt-1 flex items-center gap-2 text-[11px] text-white/40">
              <UAvatar
                :src="event.actor_avatar_url || undefined"
                :alt="event.actor_name || 'System'"
                size="3xs"
              />
              <span class="truncate">{{ event.actor_name || 'System' }}</span>
              <span>·</span>
              <span class="truncate">{{ event.target_type }}</span>
            </div>
            <div
              v-if="metadataChips(event).length"
              class="mt-2 flex flex-wrap gap-1.5"
            >
              <span
                v-for="chip in metadataChips(event)"
                :key="chip.key"
                class="max-w-full rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/45 ring-1 ring-white/[0.05]"
              >
                <span class="capitalize text-white/30">{{ chip.label }}:</span>
                <span class="ml-1 text-white/65">{{ chip.value }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
