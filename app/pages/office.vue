<script setup lang="ts">
import type { OfficeRow, OfficeZoneRow, OfficeStatus } from '~~/app/types/office'
import type { InboundMessage } from '~~/workers/office-room/src/types'

definePageMeta({ layout: 'agency' })

const { data: listData } = await useFetch<{
  offices: (OfficeRow & { my_role: string })[]
}>('/api/office')

const selectedId = ref<string | null>(listData.value?.offices[0]?.id ?? null)

const { data: detail } = await useFetch<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  myRole: string
}>(() => (selectedId.value ? `/api/office/${selectedId.value}` : null), {
  watch: [selectedId]
})

const toast = useToast()

// Phase 1c.1 — knock state composable (instantiated before connection so
// onMessage handler can forward knock:* messages to it).
// `knocks.sendKnock`/etc dispatch via the connection's `send` fn — wired by
// passing connection.send into useOfficeKnocks below. We use a temp lazy
// reference because of the chicken-and-egg with connection.
let _connection: ReturnType<typeof useOfficeConnection> | null = null
function sendViaConnection(msg: InboundMessage) {
  _connection?.send(msg)
}
const knocks = useOfficeKnocks({ send: sendViaConnection })

const connection = useOfficeConnection({
  officeId: selectedId,
  onMessage(msg) {
    // Forward Phase 1c.1 knock messages to the knock composable. All other
    // message types are handled internally by useOfficeConnection.
    if (msg.type === 'knock:incoming') {
      knocks.onIncoming({
        knockId: msg.knockId,
        fromHandle: msg.fromHandle,
        fromName: msg.fromName,
        zoneId: msg.zoneId,
        ttlMs: msg.ttlMs,
      })
    } else if (msg.type === 'knock:result') {
      const result = knocks.onResult({ knockId: msg.knockId, status: msg.status, media: msg.media })
      if (result.status === 'accepted' && result.media && result.targetZoneId) {
        // Server has already moved the knocker server-side and broadcast a
        // `participant:moved` — but `participant:moved` only updates the
        // peer map, not the local `currentZoneId`/`currentMediaCredentials`.
        // Set them now so the room panel opens and useOfficeRealtime (mounted
        // inside OfficeRoomPanel) reactively (re)connects with the new creds.
        connection.currentZoneId.value = result.targetZoneId
        connection.currentMediaCredentials.value = result.media
      } else if (result.status === 'accepted') {
        // Server accepted but client lost the pendingKnock (race with cancel/timeout).
        // Surface a warning so the limbo is observable.
        console.warn('[office] knock:result accepted but targetZoneId missing — pendingKnock was already cleared')
      } else if (result.status === 'denied') {
        toast.add({ title: 'Knock declined', description: 'They declined the knock.', color: 'error' })
      } else if (result.status === 'timeout') {
        toast.add({ title: 'No response', description: 'No response — try Slack instead.', color: 'warning' })
      } else if (result.status === 'busy') {
        toast.add({ title: 'Room busy', description: 'Someone else is already knocking. Try again in a sec.', color: 'error' })
      } else if (result.status === 'no-occupant') {
        toast.add({ title: 'Room empty', description: 'No one is in that room.', color: 'error' })
      } else if (result.status === 'not-knockable') {
        toast.add({ title: 'Not knockable', description: 'That room cannot be knocked.', color: 'error' })
      } else if (result.status === 'self-knock') {
        toast.add({ title: 'Already there', description: "You're already in that room.", color: 'info' })
      }
    } else if (msg.type === 'knock:cancelled') {
      // Server signals the knocker abandoned the knock; silently close the
      // incoming modal if it's still showing.
      knocks.onCancelled({ knockId: msg.knockId })
    }
  },
})
_connection = connection

const myStatus = ref<OfficeStatus>('available')
watch(myStatus, s => connection.setStatus(s))

function enterZone(zoneId: string) {
  // Lobby + open rooms: direct zone:enter (no knock).
  // Knockable rooms (focus / private with occupants): the floor plan emits
  // `knock` instead of `enterZone` (Task 10), which opens the confirm modal.
  connection.enterZone(zoneId)
}

// Phase 1c.1 — confirm-modal state. Opened by OfficeFloorPlan's `knock`
// event (added in Task 10) which carries { zoneId, zoneName, occupantNames }.
const confirmOpen = ref(false)
const confirmZone = ref<{ zoneId: string; zoneName: string; occupantNames: string[] } | null>(null)
function onKnockableClick(args: { zoneId: string; zoneName: string; occupantNames: string[] }) {
  confirmZone.value = args
  confirmOpen.value = true
}
function onConfirmKnock() {
  if (!confirmZone.value) return
  const target = confirmZone.value
  knocks.sendKnock(target.zoneId)
  toast.add({
    title: `Knocking on ${target.occupantNames.join(', ') || target.zoneName}…`,
    description: 'Waiting for response (30s)',
    color: 'info',
  })
}

// Look up the zone name for the incoming-knock modal from the loaded zones
// list. Falls back to a generic label if the zoneId isn't in the list (e.g.
// the zone was deleted server-side mid-session — unlikely).
const incomingZoneName = computed(() => {
  const k = knocks.incomingKnock.value
  if (!k) return ''
  return detail.value?.zones.find(z => z.id === k.zoneId)?.name ?? 'Focus Room'
})

watch(
  () => connection.lastError.value,
  (err) => {
    if (err) {
      toast.add({ title: 'Office', description: err, color: 'error' })
      connection.lastError.value = null
    }
  }
)

const participantCount = computed(() => connection.participants.value.size)
const officeName = computed(() => detail.value?.office.name ?? '')
const showSwitcher = computed(() => (listData.value?.offices.length ?? 0) > 1)

// Phase 1b — room panel opens when a zone:joined message carries credentials.
const currentZone = computed(() => {
  const zoneId = connection.currentZoneId.value
  if (!zoneId) return null
  return detail.value?.zones.find(z => z.id === zoneId) ?? null
})

const roomPanelOpen = computed({
  get: () => Boolean(connection.currentMediaCredentials.value),
  set: (v) => {
    // Closing the panel from inside means leaving the zone.
    if (!v) connection.leaveZone()
  }
})

function handleRoomLeave() {
  connection.leaveZone()
}

watch(
  () => connection.joinFailure.value,
  (failure) => {
    if (!failure) return
    toast.add({
      title: 'Couldn\'t join room',
      description: failure.message || `Reason: ${failure.reason}`,
      color: 'error'
    })
    connection.joinFailure.value = null
  }
)
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-[#06070a] -mx-4 -my-4 p-6">
    <!-- ro.am-style minimal centered header. Subtle status indicator. -->
    <header class="relative flex items-center justify-between mb-5">
      <!-- Left: office context (quiet) -->
      <div class="flex items-center gap-3 text-sm">
        <div class="flex items-center gap-2 text-white/90">
          <div class="size-7 rounded-lg bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center">
            <UIcon name="i-lucide-building-2" class="size-3.5 text-emerald-400" />
          </div>
          <span class="font-semibold tracking-tight">Office</span>
        </div>
        <span class="text-white/30">·</span>
        <span class="text-white/60 text-[13px]">{{ officeName }}</span>
        <OfficeSwitcher
          v-if="showSwitcher && listData?.offices"
          v-model="selectedId"
          :offices="listData.offices"
        />
        <span
          v-if="detail"
          class="hidden md:inline-flex items-center gap-1.5 text-[11px] text-white/40 tracking-wide ml-3"
        >
          <UIcon name="i-lucide-users" class="size-3" />
          {{ participantCount }} online · {{ detail.zones.length }} rooms
        </span>
      </div>

      <!-- Right: live status + your-status picker -->
      <div class="flex items-center gap-2">
        <span
          v-if="connection.isConnected.value"
          class="hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-white/50"
        >
          <span class="size-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
          Live
        </span>
        <OfficeStatusPicker v-model="myStatus" />
      </div>
    </header>

    <div v-if="detail">
      <OfficeFloorPlan
        :office="detail.office"
        :zones="detail.zones"
        :participants="connection.participants.value"
        :zone-occupancy="connection.zoneOccupancy.value"
        @enter-zone="enterZone"
        @knock="onKnockableClick"
      />

      <OfficeRoomPanel
        v-model:open="roomPanelOpen"
        :zone="currentZone"
        :credentials="connection.currentMediaCredentials.value"
        @leave="handleRoomLeave"
      />

      <!-- Phase 1c.1 — knock confirm (knocker) + incoming (knockee) modals -->
      <OfficeKnockConfirmModal
        v-model:open="confirmOpen"
        :zone-name="confirmZone?.zoneName ?? ''"
        :occupant-names="confirmZone?.occupantNames ?? []"
        @confirm="onConfirmKnock"
      />

      <OfficeKnockIncomingModal
        v-if="knocks.incomingKnock.value"
        :open="!!knocks.incomingKnock.value"
        :from-name="knocks.incomingKnock.value.fromName"
        :zone-name="incomingZoneName"
        :ttl-ms="knocks.incomingKnock.value.ttlMs"
        :received-at="knocks.incomingKnock.value.receivedAt"
        @update:open="(v) => { if (!v) knocks.incomingKnock.value = null }"
        @accept="knocks.acceptKnock()"
        @deny="knocks.denyKnock()"
      />
    </div>

    <div
      v-else-if="!selectedId"
      class="rounded-2xl bg-[#16181d] ring-1 ring-white/[0.06] p-10 text-center"
    >
      <div class="size-12 mx-auto rounded-full bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center mb-3">
        <UIcon name="i-lucide-door-closed" class="size-5 text-white/40" />
      </div>
      <p class="text-sm text-white/60">
        You're not a member of any office. Ask an admin to add you.
      </p>
    </div>
  </div>
</template>
