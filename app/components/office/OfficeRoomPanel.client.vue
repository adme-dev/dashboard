<script setup lang="ts">
import type {
  ActorHandle,
  OfficeMediaSession,
  OfficeParticipant,
  OfficePresenceEventKind,
  OfficeRemoteTrackCapability,
  OfficeZoneRow
} from '~~/app/types/office'

type RoomPresenceEvent = {
  id: string
  kind: OfficePresenceEventKind
  label: string
  createdAt: number
}

const props = defineProps<{
  officeId: string
  zone: OfficeZoneRow
  occupants: OfficeParticipant[]
  presenceEvents?: RoomPresenceEvent[]
  isCurrentZone?: boolean
  currentUserHandle?: ActorHandle | null
  openingThread?: boolean
  knocking?: boolean
  canManageRoom?: boolean
  lockingRoom?: boolean
  joinFailureMessage?: string | null
  mediaSession?: OfficeMediaSession | null
  remoteTracks?: OfficeRemoteTrackCapability[]
  announcePublishedTracks?: (
    sessionId: string,
    tracks: Array<{ trackName: string, kind: 'audio' | 'video' }>
  ) => void
  mediaUnavailableMessage?: string | null
}>()

const emit = defineEmits<{
  close: []
  enter: [zoneId: string]
  leave: []
  copyLink: []
  openThread: []
  setupMeeting: [zoneId: string, meetingId?: string, artifactId?: string]
  knock: []
  cancelKnock: []
  toggleLock: []
  evict: [handle: ActorHandle]
  openPerson: [handle: ActorHandle]
  raiseHand: []
  wave: []
  notesChanged: [zone: OfficeZoneRow]
}>()

const { panelEl, handleEl, isDragging, panelStyle } = useOfficeFloatingPanel({
  storageKey: 'office-room-panel-position',
  width: 380
})
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const capacityLabel = computed(() => `${props.occupants.length}/${props.zone.capacity}`)
const isFull = computed(() => props.occupants.length >= props.zone.capacity)
const canKnock = computed(() => !props.isCurrentZone && props.occupants.length > 0)
const knockLabel = computed(() => props.knocking ? 'Cancel' : canKnock.value ? 'Knock' : 'No one')
const knockTitle = computed(() => {
  if (props.knocking) return 'Cancel this knock request.'
  if (canKnock.value) return 'Knock before joining this room.'
  return 'Knock is available when someone is in the room.'
})
const occupantOverflow = computed(() => Math.max(0, props.occupants.length - 10))
const activityNow = ref(Date.now())
const recentPresenceEvents = computed(() => props.presenceEvents?.slice(0, 3) ?? [])
const entryLabel = computed(() => props.isCurrentZone ? 'Leave' : isFull.value ? 'Full' : 'Enter')
const entryTitle = computed(() => {
  if (props.isCurrentZone) return 'Leave this room.'
  if (isFull.value) return 'This room is at capacity. You can still open the thread or copy the guest link.'
  return 'Enter this room.'
})
const roomStateLabel = computed(() => {
  if (props.isCurrentZone) return 'Active session'
  if (isFull.value) return 'At capacity'
  if (props.occupants.length) return 'Occupied'
  return 'Available'
})
const roomStateClass = computed(() => {
  if (props.isCurrentZone) return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/20'
  if (isFull.value) return 'bg-red-400/10 text-red-100 ring-red-300/15'
  if (props.occupants.length) return 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
  return 'bg-white/[0.04] text-white/50 ring-white/[0.06]'
})
const accessLabel = computed(() => props.zone.is_private ? 'Private' : 'Open')
const lockLabel = computed(() => {
  if (props.lockingRoom) return 'Saving'
  return props.zone.is_private ? 'Unlock' : 'Lock'
})
const lockTitle = computed(() =>
  props.zone.is_private
    ? 'Make this room open to eligible office members.'
    : 'Make this room private.'
)
const destinationLabel = computed(() => {
  if (props.zone.zone_type === 'lobby') return 'Guest reception'
  if (props.zone.zone_type === 'focus') return 'Focus room'
  if (props.zone.zone_type === 'theater') return 'Presentation space'
  if (props.zone.zone_type === 'client_lounge') return 'Client space'
  return 'Meeting room'
})
function presenceEventIcon(kind: OfficePresenceEventKind) {
  if (kind === 'knock') return 'i-lucide-hand'
  if (kind === 'raise_hand') return 'i-lucide-hand-metal'
  return 'i-lucide-hand-heart'
}

function presenceEventClass(kind: OfficePresenceEventKind) {
  if (kind === 'knock') return 'border-amber-300/12 bg-amber-400/10 text-amber-100 ring-amber-300/10'
  if (kind === 'raise_hand') return 'border-sky-300/12 bg-sky-400/10 text-sky-100 ring-sky-300/10'
  return 'border-emerald-300/12 bg-emerald-400/10 text-emerald-100 ring-emerald-300/10'
}

function presenceEventAge(createdAt: number) {
  const seconds = Math.max(0, Math.round((activityNow.value - createdAt) / 1000))
  return seconds < 2 ? 'now' : `${seconds}s ago`
}

let activityClock: ReturnType<typeof setInterval> | null = null

watch(
  () => recentPresenceEvents.value.length,
  (count) => {
    if (count && !activityClock) {
      activityClock = setInterval(() => {
        activityNow.value = Date.now()
      }, 1000)
    }
    if (!count && activityClock) {
      clearInterval(activityClock)
      activityClock = null
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (activityClock) clearInterval(activityClock)
})
const toast = useToast()
const notesDraft = ref(props.zone.notes ?? '')
const acceptedNotes = ref(props.zone.notes ?? '')
const notesVersion = ref(props.zone.notes_version ?? 0)
const notesUpdatedAt = ref(props.zone.notes_updated_at)
const pendingRemoteNotes = ref<Pick<OfficeZoneRow, 'notes' | 'notes_version' | 'notes_updated_at' | 'notes_updated_by'> | null>(null)
const savingNotes = ref(false)
const notesDirty = computed(() => notesDraft.value !== acceptedNotes.value)
const notesUpdatedLabel = computed(() =>
  notesUpdatedAt.value
    ? new Date(notesUpdatedAt.value).toLocaleString()
    : 'No saved notes'
)

function acceptZoneNotes(zone: Pick<OfficeZoneRow, 'notes' | 'notes_version' | 'notes_updated_at' | 'notes_updated_by'>) {
  acceptedNotes.value = zone.notes ?? ''
  notesDraft.value = acceptedNotes.value
  notesVersion.value = zone.notes_version ?? 0
  notesUpdatedAt.value = zone.notes_updated_at
  pendingRemoteNotes.value = null
}

watch(
  () => [props.zone.id, props.zone.notes, props.zone.notes_version] as const,
  ([zoneId, notes, version], [previousZoneId]) => {
    const incoming = {
      notes: notes ?? '',
      notes_version: version ?? 0,
      notes_updated_at: props.zone.notes_updated_at,
      notes_updated_by: props.zone.notes_updated_by
    }
    if (zoneId !== previousZoneId) {
      acceptZoneNotes(incoming)
      return
    }
    if (incoming.notes_version === notesVersion.value && incoming.notes === acceptedNotes.value) return
    if (notesDirty.value && incoming.notes_version > notesVersion.value) {
      pendingRemoteNotes.value = incoming
      return
    }
    acceptZoneNotes(incoming)
  }
)

function useRemoteNotes() {
  if (!pendingRemoteNotes.value) return
  acceptZoneNotes(pendingRemoteNotes.value)
}

function remoteNotesFromError(err: unknown) {
  if (!err || typeof err !== 'object' || !('data' in err)) return null
  const data = (err as { data?: unknown }).data
  const payload = data && typeof data === 'object' && 'data' in data
    ? (data as { data?: unknown }).data
    : data
  if (!payload || typeof payload !== 'object') return null
  const notes = 'notes' in payload ? (payload as { notes?: unknown }).notes : undefined
  const version = 'notes_version' in payload ? (payload as { notes_version?: unknown }).notes_version : undefined
  if (typeof notes !== 'string' || typeof version !== 'number') return null
  return {
    notes,
    notes_version: version,
    notes_updated_at: 'notes_updated_at' in payload && typeof (payload as { notes_updated_at?: unknown }).notes_updated_at === 'string'
      ? (payload as { notes_updated_at: string }).notes_updated_at
      : null,
    notes_updated_by: 'notes_updated_by' in payload && typeof (payload as { notes_updated_by?: unknown }).notes_updated_by === 'string'
      ? (payload as { notes_updated_by: string }).notes_updated_by
      : null
  }
}

async function saveRoomNotes() {
  savingNotes.value = true
  try {
    const result = await apiFetch<{ zone: OfficeZoneRow }>(
      `/api/office/${props.officeId}/zones/${props.zone.id}/notes`,
      {
        method: 'PUT',
        body: {
          notes: notesDraft.value,
          version: notesVersion.value
        }
      }
    )
    acceptZoneNotes(result.zone)
    toast.add({
      title: 'Room notes saved',
      icon: 'i-lucide-notebook-pen',
      color: 'success',
      duration: 1400
    })
    emit('notesChanged', result.zone)
  } catch (err: unknown) {
    const remoteNotes = remoteNotesFromError(err)
    if (remoteNotes) pendingRemoteNotes.value = remoteNotes
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not save room notes',
      description: message || 'Refresh and try again.',
      icon: 'i-lucide-notebook-tabs',
      color: 'error'
    })
  } finally {
    savingNotes.value = false
  }
}
</script>

<template>
  <aside
    ref="panelEl"
    class="fixed inset-x-3 bottom-3 z-50 max-h-[min(620px,calc(100dvh-2rem))] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#11141a]/95 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:w-[min(380px,calc(100%-2rem))] sm:max-h-[calc(100dvh-6rem)] lg:right-6 lg:top-24"
    :class="isDragging ? 'select-none ring-1 ring-emerald-300/25' : ''"
    :style="panelStyle"
  >
    <header
      ref="handleEl"
      class="flex cursor-move items-start gap-3 border-b border-white/[0.06] px-3 py-3 active:cursor-grabbing"
      title="Drag panel"
    >
      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
        <UIcon name="i-lucide-door-open" class="size-4 text-white/65" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h2 class="truncate text-sm font-semibold text-white">
            {{ zone.name }}
          </h2>
          <span
            class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1"
            :class="roomStateClass"
          >
            {{ roomStateLabel }}
          </span>
        </div>
        <p class="mt-1 truncate text-xs capitalize text-white/40">
          {{ zone.zone_type.replace('_', ' ') }} · {{ capacityLabel }}
        </p>
      </div>
      <UIcon name="i-lucide-grip-horizontal" class="mt-1 hidden size-4 shrink-0 text-white/25 sm:block" />
      <button
        type="button"
        class="rounded-md p-1 text-white/35 transition hover:bg-white/[0.06] hover:text-white/80"
        aria-label="Close room panel"
        @pointerdown.stop
        @click="emit('close')"
      >
        <UIcon name="i-lucide-x" class="size-4" />
      </button>
    </header>

    <div
      class="grid grid-cols-2 gap-2 p-3"
      :class="canManageRoom ? 'sm:grid-cols-7' : 'sm:grid-cols-6'"
    >
      <button
        type="button"
        class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition sm:h-16"
        :title="entryTitle"
        :class="isCurrentZone
          ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-400/20 hover:bg-emerald-400/15'
          : isFull
            ? 'cursor-not-allowed bg-white/[0.03] text-white/30 ring-white/[0.05]'
            : 'bg-white/[0.04] text-white/75 ring-white/[0.06] hover:bg-white/[0.08]'"
        :disabled="!isCurrentZone && isFull"
        @click="isCurrentZone ? emit('leave') : emit('enter', zone.id)"
      >
        <UIcon :name="isCurrentZone ? 'i-lucide-log-out' : 'i-lucide-door-open'" class="size-4" />
        {{ entryLabel }}
      </button>

      <button
        type="button"
        class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg bg-white/[0.04] text-xs font-medium text-white/75 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] sm:h-16"
        @click="emit('copyLink')"
      >
        <UIcon name="i-lucide-link" class="size-4" />
        Link
      </button>

      <button
        type="button"
        class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg bg-white/[0.04] text-xs font-medium text-white/75 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] sm:h-16"
        title="Send a lightweight wave to this room."
        @click="emit('wave')"
      >
        <UIcon name="i-lucide-hand-heart" class="size-4" />
        Wave
      </button>

      <button
        type="button"
        class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg bg-white/[0.04] text-xs font-medium text-white/75 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] sm:h-16"
        title="Raise your hand in this room."
        @click="emit('raiseHand')"
      >
        <UIcon name="i-lucide-hand-metal" class="size-4" />
        Raise
      </button>

      <button
        v-if="canManageRoom"
        type="button"
        class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition sm:h-16"
        :class="zone.is_private
          ? 'bg-amber-400/10 text-amber-100 ring-amber-300/15 hover:bg-amber-400/15'
          : 'bg-white/[0.04] text-white/75 ring-white/[0.06] hover:bg-white/[0.08]'"
        :disabled="lockingRoom"
        :title="lockTitle"
        @click="emit('toggleLock')"
      >
        <UIcon
          :name="lockingRoom ? 'i-lucide-loader-circle' : zone.is_private ? 'i-lucide-lock-open' : 'i-lucide-lock'"
          class="size-4"
          :class="lockingRoom ? 'animate-spin' : ''"
        />
        {{ lockLabel }}
      </button>

      <button
        type="button"
        class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg bg-white/[0.04] text-xs font-medium text-white/75 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] sm:h-16"
        :class="openingThread ? 'cursor-wait opacity-70' : ''"
        :disabled="openingThread"
        @click="emit('openThread')"
      >
        <UIcon
          :name="openingThread ? 'i-lucide-loader-circle' : 'i-lucide-messages-square'"
          class="size-4"
          :class="openingThread ? 'animate-spin' : ''"
        />
        Thread
      </button>

      <button
        type="button"
        class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition sm:h-16"
        :class="knocking
          ? 'bg-amber-400/10 text-amber-100 ring-amber-300/15 hover:bg-amber-400/15'
          : canKnock
            ? 'bg-white/[0.04] text-white/75 ring-white/[0.06] hover:bg-white/[0.08]'
            : 'cursor-not-allowed bg-white/[0.025] text-white/30 ring-white/[0.04]'"
        :disabled="!canKnock && !knocking"
        :title="knockTitle"
        @click="knocking ? emit('cancelKnock') : emit('knock')"
      >
        <UIcon
          :name="knocking ? 'i-lucide-hourglass' : 'i-lucide-hand'"
          class="size-4"
          :class="knocking ? 'animate-pulse' : ''"
        />
        {{ knockLabel }}
      </button>
    </div>

    <section
      v-if="recentPresenceEvents.length"
      class="border-t border-white/[0.06] px-3 py-3"
    >
      <div class="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
        Room activity
      </div>
      <div class="flex flex-wrap gap-2">
        <div
          v-for="event in recentPresenceEvents"
          :key="event.id"
          class="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ring-1"
          :class="presenceEventClass(event.kind)"
        >
          <UIcon
            :name="presenceEventIcon(event.kind)"
            class="size-3.5 shrink-0"
          />
          <span class="truncate">{{ event.label }}</span>
          <span class="shrink-0 text-[10px] opacity-60">{{ presenceEventAge(event.createdAt) }}</span>
        </div>
      </div>
    </section>

    <p
      v-if="knocking"
      class="mx-3 mb-3 rounded-lg border border-amber-300/10 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
    >
      Knock sent. Waiting for someone in this room to respond.
    </p>

    <p
      v-if="joinFailureMessage"
      class="mx-3 mb-3 rounded-lg border border-red-300/10 bg-red-400/10 px-3 py-2 text-xs text-red-100"
    >
      {{ joinFailureMessage }}
    </p>

    <OfficeMediaDock
      :office-id="officeId"
      :zone-id="zone.id"
      :occupant-count="occupants.length"
      :media-session="mediaSession"
      :remote-tracks="remoteTracks"
      :announce-published-tracks="announcePublishedTracks"
      :media-unavailable-message="mediaUnavailableMessage"
      :can-use-live-notes="isCurrentZone"
      live-notes-disabled-message="Enter this room before starting live AI notes."
      @live-notes-changed="emit('notesChanged', zone)"
      @open-office-artifacts="(meetingId, artifactId) => emit('setupMeeting', zone.id, meetingId, artifactId)"
    />

    <section class="border-t border-white/[0.06] px-3 py-3">
      <div class="mb-2 flex items-center justify-between gap-3">
        <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          In room
        </div>
        <span class="text-[11px] tabular-nums text-white/35">{{ capacityLabel }}</span>
      </div>
      <div
        v-if="occupants.length"
        class="space-y-2"
      >
        <div
          v-for="occupant in occupants.slice(0, 10)"
          :key="occupant.handle"
          class="flex min-w-0 items-center gap-2 rounded-lg bg-white/[0.025] px-2 py-2 ring-1 ring-white/[0.05] transition hover:bg-white/[0.05] hover:ring-white/[0.09]"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            :aria-label="`Open ${occupant.name}`"
            @click="emit('openPerson', occupant.handle)"
          >
            <OfficeAvatar
              :participant="occupant"
              :size="30"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs font-semibold text-white/75">
                {{ occupant.name }}
              </div>
              <div class="mt-0.5 truncate text-[11px] capitalize text-white/35">
                {{ occupant.status.replace('_', ' ') }}
              </div>
            </div>
          </button>
          <button
            v-if="canManageRoom && occupant.handle !== currentUserHandle"
            type="button"
            class="flex size-7 shrink-0 items-center justify-center rounded-md text-white/35 ring-1 ring-white/[0.06] transition hover:bg-red-400/10 hover:text-red-100 hover:ring-red-300/15"
            :aria-label="`Remove ${occupant.name} from room`"
            title="Remove from room"
            @click="emit('evict', occupant.handle)"
          >
            <UIcon name="i-lucide-user-minus" class="size-3.5" />
          </button>
        </div>
        <span
          v-if="occupantOverflow"
          class="inline-flex size-[30px] items-center justify-center rounded-full bg-white/[0.08] text-[10px] font-semibold text-white/60 ring-1 ring-white/[0.1]"
        >
          +{{ occupantOverflow }}
        </span>
      </div>
      <p
        v-else
        class="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-xs text-white/40"
      >
        Nobody is in this room yet.
      </p>
    </section>

    <section class="border-t border-white/[0.06] px-3 py-3">
      <div class="mb-2 flex items-start justify-between gap-3">
        <div>
          <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            Room notes
          </div>
          <p class="mt-0.5 text-[11px] text-white/35">
            {{ notesUpdatedLabel }}
          </p>
        </div>
        <span class="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-white/35 ring-1 ring-white/[0.05]">
          v{{ notesVersion }}
        </span>
      </div>
      <textarea
        v-model="notesDraft"
        rows="4"
        maxlength="20000"
        placeholder="Shared notes, decisions, links, and follow-ups for this room."
        class="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-white/20"
      />
      <div
        v-if="pendingRemoteNotes"
        class="mt-2 rounded-lg border border-amber-300/12 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold">
              Newer room notes are available
            </div>
            <p class="mt-0.5 text-amber-100/70">
              Your unsaved draft is preserved. Load the newer version when ready.
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-md bg-amber-300/10 px-2 py-1 text-[11px] font-semibold ring-1 ring-amber-200/15 transition hover:bg-amber-300/15"
            @click="useRemoteNotes"
          >
            Load
          </button>
        </div>
      </div>
      <div class="mt-2 flex items-center justify-between gap-2">
        <span class="text-[10px] text-white/30">
          {{ notesDraft.length.toLocaleString() }}/20,000
        </span>
        <div class="flex gap-2">
          <button
            type="button"
            class="h-8 rounded-md bg-white/[0.04] px-2.5 text-xs font-semibold text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
            :disabled="savingNotes || !notesDirty"
            @click="notesDraft = acceptedNotes"
          >
            Reset
          </button>
          <button
            type="button"
            class="h-8 rounded-md bg-sky-400/12 px-3 text-xs font-semibold text-sky-100 ring-1 ring-sky-300/20 transition hover:bg-sky-400/18 disabled:cursor-wait disabled:opacity-50"
            :disabled="savingNotes || !notesDirty"
            @click="saveRoomNotes"
          >
            <UIcon
              :name="savingNotes ? 'i-lucide-loader-circle' : 'i-lucide-save'"
              class="mr-1 inline size-3.5"
              :class="savingNotes ? 'animate-spin' : ''"
            />
            Save
          </button>
        </div>
      </div>
    </section>

    <OfficeRoomThread
      :office-id="officeId"
      :zone-id="zone.id"
    />

    <section class="border-t border-white/[0.06] px-3 py-3">
      <button
        type="button"
        class="mb-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-400/12 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20 transition hover:bg-emerald-400/18"
        @click="emit('setupMeeting', zone.id)"
      >
        <UIcon name="i-lucide-calendar-plus" class="size-4" />
        Set up meeting in this room
      </button>

      <div class="grid grid-cols-3 gap-2">
        <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
          <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
            Access
          </div>
          <div class="mt-1 text-xs font-medium text-white/65">
            {{ accessLabel }}
          </div>
        </div>
        <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
          <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
            Capacity
          </div>
          <div class="mt-1 text-xs font-medium text-white/65">
            {{ capacityLabel }}
          </div>
        </div>
        <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
          <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
            Type
          </div>
          <div class="mt-1 truncate text-xs font-medium text-white/65">
            {{ destinationLabel }}
          </div>
        </div>
      </div>
    </section>
  </aside>
</template>
