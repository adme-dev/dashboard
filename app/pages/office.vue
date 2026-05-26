<script setup lang="ts">
import { resolveComponent } from 'vue'
import type { Component } from 'vue'
import type {
  OfficeMemberRow,
  ActorHandle,
  OfficePresenceEventKind,
  OfficePresenceEventTarget,
  OfficeRow,
  OfficeStatus,
  OfficeZoneRow
} from '~~/app/types/office'

definePageMeta({ layout: 'agency' })

const { data: listData, pending: officesPending, refresh: refreshOffices } = await useFetch<{
  offices: (OfficeRow & { my_role: string })[]
}>('/api/office')

const selectedId = ref<string | null>(listData.value?.offices[0]?.id ?? null)

watch(
  () => listData.value?.offices[0]?.id,
  (officeId) => {
    if (!selectedId.value && officeId) selectedId.value = officeId
  },
  { immediate: true }
)

onMounted(async () => {
  if (!selectedId.value) await refreshOffices()
})

const { data: detail, refresh: refreshOfficeDetail } = await useFetch<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  members: (OfficeMemberRow & { name: string | null, avatar_url: string | null })[]
  myRole: string
}>(() => (selectedId.value ? `/api/office/${selectedId.value}` : null), {
  watch: [selectedId]
})

const connection = useOfficeConnection({ officeId: selectedId })
const { user } = useAuth()

const myStatus = ref<OfficeStatus>('available')
watch(myStatus, s => connection.setStatus(s))

const toast = useToast()

function enterZone(zoneId: string) {
  const zone = detail.value?.zones.find(z => z.id === zoneId)
  // "Knock" affordance — non-lobby zones show a transient toast before
  // the actual zone:enter completes. Media handshake lands in Phase 1b;
  // this just sells the metaphor.
  if (zone && zone.zone_type !== 'lobby') {
    toast.add({
      title: `Knocking on ${zone.name}…`,
      description: 'You\'ll join the room in a moment.',
      icon: 'i-lucide-hand',
      color: 'neutral',
      duration: 2000
    })
  }
  connection.enterZone(zoneId)
}

function leaveZone() {
  connection.leaveZone()
}

function sendPresenceEvent(kind: OfficePresenceEventKind, target: OfficePresenceEventTarget) {
  connection.sendPresenceEvent(kind, target)
}

function evictParticipant(handle: ActorHandle) {
  connection.evictParticipant(handle)
  auditRefreshKey.value += 1
}

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
const currentUserHandle = computed(() => user.value?.id ? `user:${user.value.id}` as const : null)
const currentParticipant = computed(() =>
  currentUserHandle.value ? connection.participants.value.get(currentUserHandle.value) ?? null : null
)
const liveZones = computed(() => mergeOfficeLiveZones({
  zones: detail.value?.zones ?? [],
  upsertedZones: connection.upsertedZones.value,
  deletedZoneIds: connection.deletedZoneIds.value,
  zoneNoteUpdates: connection.zoneNoteUpdates.value
}))
const currentZone = computed(() => {
  const zoneId = connection.currentZoneId.value || currentParticipant.value?.currentZoneId
  return zoneId ? liveZones.value.find(zone => zone.id === zoneId) ?? null : null
})

type OfficeModule = {
  id: string
  title: string
  description: string
  icon: string
  metric: string
  component: Component
  props: Record<string, unknown>
}

const officePanelComponents = {
  lobbies: resolveComponent('OfficeLobbyAdminPanel'),
  controls: resolveComponent('OfficeSettingsPanel'),
  badges: resolveComponent('OfficeGuestBadgesPanel'),
  audit: resolveComponent('OfficeAuditPanel'),
  artifacts: resolveComponent('OfficeMeetingArtifactsPanel'),
  recordings: resolveComponent('OfficeRecordingsPanel'),
  assistant: resolveComponent('OfficeAssistantPanel'),
  liveView: resolveComponent('OfficeLiveViewPanel')
} satisfies Record<string, Component>

const activePanelId = ref<string | null>(null)
const artifactsRefreshKey = ref(0)
const auditRefreshKey = ref(0)
const selectedArtifactMeetingId = ref<string | null>(null)
const selectedArtifactId = ref<string | null>(null)
const selectedActionItemId = ref<string | null>(null)
const selectedArtifactFocusKey = ref(0)
const selectedMeetingSetupZoneId = ref<string | null>(null)
const selectedRecordingMeetingId = ref<string | null>(null)
const selectedAssistantJobId = ref<string | null>(null)
const selectedAssistantJobFocusKey = ref(0)
const adminModules = computed<OfficeModule[]>(() => {
  if (!detail.value || detail.value.myRole !== 'admin') return []
  return [
    {
      id: 'lobbies',
      title: 'Guest lobbies',
      description: 'External meeting links, intake routing, and availability.',
      icon: 'i-lucide-door-open',
      metric: 'Access',
      component: officePanelComponents.lobbies,
      props: { officeId: detail.value.office.id, zones: liveZones.value, defaultOpen: true }
    },
    {
      id: 'controls',
      title: 'Office controls',
      description: 'Guest access, retention, recordings, and assistant policies.',
      icon: 'i-lucide-shield-check',
      metric: 'Policy',
      component: officePanelComponents.controls,
      props: { officeId: detail.value.office.id, defaultOpen: true }
    },
    {
      id: 'badges',
      title: 'Guest badges',
      description: 'Temporary external room passes and badge status.',
      icon: 'i-lucide-badge-check',
      metric: 'Guests',
      component: officePanelComponents.badges,
      props: { officeId: detail.value.office.id, defaultOpen: true }
    },
    {
      id: 'audit',
      title: 'Audit trail',
      description: 'Policy and sensitive office changes.',
      icon: 'i-lucide-history',
      metric: 'Governance',
      component: officePanelComponents.audit,
      props: { officeId: detail.value.office.id, defaultOpen: true, refreshKey: auditRefreshKey.value }
    }
  ]
})
const intelligenceModules = computed<OfficeModule[]>(() => {
  if (!detail.value) return []
  return [
    {
      id: 'artifacts',
      title: 'Set up meeting',
      description: 'Create a room session with notes, recording, and retention policy.',
      icon: 'i-lucide-calendar-plus',
      metric: 'Meetings',
      component: officePanelComponents.artifacts,
      props: {
        officeId: detail.value.office.id,
        zones: liveZones.value,
        defaultOpen: true,
        refreshKey: artifactsRefreshKey.value,
        targetMeetingId: selectedArtifactMeetingId.value,
        targetArtifactId: selectedArtifactId.value,
        targetActionItemId: selectedActionItemId.value,
        targetFocusKey: selectedArtifactFocusKey.value,
        initialZoneId: selectedMeetingSetupZoneId.value,
        myRole: detail.value.myRole
      }
    },
    {
      id: 'recordings',
      title: 'Screen recordings',
      description: 'Async recordings and walkthrough links.',
      icon: 'i-lucide-monitor-up',
      metric: 'Recordings',
      component: officePanelComponents.recordings,
      props: {
        officeId: detail.value.office.id,
        defaultOpen: true,
        targetMeetingId: selectedRecordingMeetingId.value
      }
    },
    {
      id: 'assistant',
      title: 'Office assistant',
      description: 'Watches, jobs, AI notes, and follow-up automation.',
      icon: 'i-lucide-sparkles',
      metric: 'AI',
      component: officePanelComponents.assistant,
      props: {
        officeId: detail.value.office.id,
        zones: liveZones.value,
        members: detail.value.members,
        defaultOpen: true,
        targetJobId: selectedAssistantJobId.value,
        targetFocusKey: selectedAssistantJobFocusKey.value
      }
    },
    {
      id: 'live-view',
      title: 'Live view',
      description: 'Presence and room occupancy monitoring.',
      icon: 'i-lucide-radio-tower',
      metric: 'Presence',
      component: officePanelComponents.liveView,
      props: { officeId: detail.value.office.id, defaultOpen: true }
    }
  ]
})
const officeModules = computed(() => [...adminModules.value, ...intelligenceModules.value])
const activeOfficeModule = computed(() =>
  officeModules.value.find(module => module.id === activePanelId.value) ?? null
)
const moduleDrawerOpen = computed({
  get: () => Boolean(activeOfficeModule.value),
  set: (open) => {
    if (!open) activePanelId.value = null
  }
})

function openOfficeModule(moduleId: string) {
  if (moduleId === 'recordings') selectedRecordingMeetingId.value = null
  if (moduleId === 'artifacts') {
    selectedArtifactMeetingId.value = null
    selectedArtifactId.value = null
    selectedActionItemId.value = null
    selectedMeetingSetupZoneId.value = null
  }
  if (moduleId === 'assistant') selectedAssistantJobId.value = null
  activePanelId.value = moduleId
}

function openMeetingSetup(meetingId?: string, artifactId?: string, actionItemId?: string, zoneId?: string) {
  selectedArtifactMeetingId.value = meetingId ?? null
  selectedArtifactId.value = artifactId ?? null
  selectedActionItemId.value = actionItemId ?? null
  selectedMeetingSetupZoneId.value = zoneId ?? null
  if (artifactId || actionItemId) selectedArtifactFocusKey.value += 1
  if (!meetingId) artifactsRefreshKey.value += 1
  activePanelId.value = 'artifacts'
}

function openMeetingSetupForZone(zoneId: string) {
  openMeetingSetup(undefined, undefined, undefined, zoneId)
}

function handleOfficeArtifactsChanged() {
  artifactsRefreshKey.value += 1
}

function handleZonesChanged() {
  auditRefreshKey.value += 1
  void refreshOfficeDetail()
}

function handleZoneNotesChanged(zone: OfficeZoneRow) {
  connection.sendZoneNotesUpdated(zone)
  void refreshOfficeDetail()
}

function openOfficeAssistant(jobId?: string) {
  selectedAssistantJobId.value = jobId ?? null
  if (jobId) selectedAssistantJobFocusKey.value += 1
  activePanelId.value = 'assistant'
}

function openOfficeRecordings(meetingId?: string) {
  selectedRecordingMeetingId.value = meetingId ?? null
  activePanelId.value = 'recordings'
}
</script>

<template>
  <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#06070a] -mx-4 -my-4 p-3 pb-12 md:p-6 md:pb-14">
    <!-- ro.am-style minimal centered header. Subtle status indicator. -->
    <header class="relative mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-5">
      <!-- Left: office context (quiet) -->
      <div class="flex min-w-0 flex-1 items-center gap-2 text-sm md:gap-3">
        <div class="flex shrink-0 items-center gap-2 text-white/90">
          <div class="size-7 rounded-lg bg-white/[0.06] ring-1 ring-white/10 flex items-center justify-center">
            <UIcon name="i-lucide-building-2" class="size-3.5 text-emerald-400" />
          </div>
          <span class="font-semibold tracking-tight">Office</span>
        </div>
        <span class="shrink-0 text-white/30">·</span>
        <span class="min-w-0 truncate text-[13px] text-white/60">{{ officeName }}</span>
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
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <button
          v-if="detail"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300/15 bg-emerald-400/10 px-2.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/15"
          @click="openMeetingSetup()"
        >
          <UIcon name="i-lucide-calendar-plus" class="size-3.5" />
          <span class="hidden sm:inline">Set up meeting</span>
        </button>
        <button
          v-if="currentZone"
          type="button"
          class="hidden items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white md:inline-flex"
          @click="leaveZone"
        >
          <UIcon name="i-lucide-map-pin" class="size-3.5 text-emerald-300" />
          <span class="max-w-36 truncate">{{ currentZone.name }}</span>
          <UIcon name="i-lucide-log-out" class="size-3.5 text-white/35" />
        </button>
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

    <div
      v-if="detail"
      class="space-y-4"
    >
      <OfficeLobbyQueue
        :office-id="detail.office.id"
        :my-role="detail.myRole"
        @open-office-artifacts="openMeetingSetup"
      />

      <OfficeFloorPlan
        :office="detail.office"
        :zones="liveZones"
        :members="detail.members"
        :participants="connection.participants.value"
        :zone-occupancy="connection.zoneOccupancy.value"
        :transient-events="connection.transientEvents.value"
        :my-role="detail.myRole"
        :current-zone-id="connection.currentZoneId.value"
        :join-failure="connection.joinFailure.value"
        :media-session="connection.mediaSession.value"
        :media-unavailable="connection.mediaUnavailable.value"
        @enter-zone="enterZone"
        @leave-zone="leaveZone"
        @presence-event="sendPresenceEvent"
        @evict-participant="evictParticipant"
        @zones-changed="handleZonesChanged"
        @zone-notes-changed="handleZoneNotesChanged"
        @setup-meeting="openMeetingSetupForZone"
      />

      <section
        v-if="detail.myRole === 'admin'"
        class="min-w-0 space-y-3"
      >
        <div class="flex min-w-0 flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <h2 class="text-sm font-semibold text-white">
              Admin operations
            </h2>
            <p class="mt-0.5 text-xs text-white/40">
              Policies, guest access, retention, and audit controls
            </p>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-white/45">
            <span class="rounded-full bg-white/[0.04] px-2.5 py-1 ring-1 ring-white/[0.06]">
              {{ detail.members.length }} members
            </span>
            <span class="rounded-full bg-white/[0.04] px-2.5 py-1 ring-1 ring-white/[0.06]">
              {{ detail.zones.length }} rooms
            </span>
          </div>
        </div>

        <div class="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-4">
          <button
            v-for="module in adminModules"
            :key="module.id"
            type="button"
            class="group min-h-28 min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0f1218]/85 p-3 text-left shadow-[0_18px_55px_-44px_rgba(0,0,0,0.95)] transition hover:border-white/[0.16] hover:bg-[#141820]"
            @click="openOfficeModule(module.id)"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="flex size-8 items-center justify-center rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08]">
                <UIcon :name="module.icon" class="size-4 text-emerald-300" />
              </span>
              <span class="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/45 ring-1 ring-white/[0.06]">
                {{ module.metric }}
              </span>
            </div>
            <div class="mt-3">
              <div class="flex items-center justify-between gap-2">
                <h3 class="truncate text-sm font-semibold text-white">
                  {{ module.title }}
                </h3>
                <UIcon name="i-lucide-panel-right-open" class="size-3.5 shrink-0 text-white/30 transition group-hover:text-white/60" />
              </div>
              <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/42">
                {{ module.description }}
              </p>
            </div>
          </button>
        </div>
      </section>

      <section class="min-w-0 space-y-3">
        <div class="flex min-w-0 flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] pb-3">
          <div>
            <h2 class="text-sm font-semibold text-white">
              Collaboration intelligence
            </h2>
            <p class="mt-0.5 text-xs text-white/40">
              Meeting artifacts, recordings, assistant jobs, and live room visibility
            </p>
          </div>
        </div>

        <div class="grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-4">
          <button
            v-for="module in intelligenceModules"
            :key="module.id"
            type="button"
            class="group min-h-28 min-w-0 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0f1218]/85 p-3 text-left shadow-[0_18px_55px_-44px_rgba(0,0,0,0.95)] transition hover:border-white/[0.16] hover:bg-[#141820]"
            @click="openOfficeModule(module.id)"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="flex size-8 items-center justify-center rounded-lg bg-white/[0.05] ring-1 ring-white/[0.08]">
                <UIcon :name="module.icon" class="size-4 text-sky-300" />
              </span>
              <span class="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/45 ring-1 ring-white/[0.06]">
                {{ module.metric }}
              </span>
            </div>
            <div class="mt-3">
              <div class="flex items-center justify-between gap-2">
                <h3 class="truncate text-sm font-semibold text-white">
                  {{ module.title }}
                </h3>
                <UIcon name="i-lucide-panel-right-open" class="size-3.5 shrink-0 text-white/30 transition group-hover:text-white/60" />
              </div>
              <p class="mt-1 line-clamp-2 text-xs leading-5 text-white/42">
                {{ module.description }}
              </p>
            </div>
          </button>
        </div>
      </section>
    </div>

    <div
      v-else-if="!selectedId && !officesPending"
      class="rounded-2xl bg-[#16181d] ring-1 ring-white/[0.06] p-10 text-center"
    >
      <div class="size-12 mx-auto rounded-full bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center mb-3">
        <UIcon name="i-lucide-door-closed" class="size-5 text-white/40" />
      </div>
      <p class="text-sm text-white/60">
        You're not a member of any office. Ask an admin to add you.
      </p>
    </div>

    <USlideover
      v-model:open="moduleDrawerOpen"
      :title="activeOfficeModule?.title"
      :description="activeOfficeModule?.description"
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <div class="office-module-drawer -mx-2 -my-1 text-white">
          <component
            :is="activeOfficeModule.component"
            v-if="activeOfficeModule"
            v-bind="activeOfficeModule.props"
            @office-artifacts-changed="handleOfficeArtifactsChanged"
            @open-office-artifacts="openMeetingSetup"
            @open-office-assistant="openOfficeAssistant"
            @open-office-recordings="openOfficeRecordings"
            @enter-office-zone="enterZone"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
