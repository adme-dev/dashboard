<script setup lang="ts">
import type {
  OfficeRow,
  OfficeZoneRow,
  OfficeMember,
  OfficeParticipant,
  ActorHandle
} from '~~/app/types/office'

const props = defineProps<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  members: OfficeMember[]
  participants: Map<ActorHandle, OfficeParticipant>
  zoneOccupancy: Record<string, ActorHandle[]>
  currentUserZoneId?: string | null
}>()

const emit = defineEmits<{
  enterZone: [zoneId: string]
  knock: [args: { zoneId: string; zoneName: string; occupantNames: string[] }]
  knockPerson: [participant: OfficeParticipant]
}>()

const toast = useToast()
const { user } = useAuth()

const layout = computed(() => ({
  width: props.office.layout?.width ?? 1200,
  height: props.office.layout?.height ?? 800
}))

const deskZones = computed(() => props.zones.filter(z => z.zone_type === 'desk'))
const adhocZones = computed(() => props.zones.filter(z => z.zone_type === 'adhoc'))
const roomZones = computed(() => props.zones.filter(
  z => z.zone_type !== 'desk' && z.zone_type !== 'adhoc'
))

function occupantsOf(zoneId: string): OfficeParticipant[] {
  const handles = props.zoneOccupancy[zoneId] || []
  return handles
    .map(h => props.participants.get(h))
    .filter((p): p is OfficeParticipant => Boolean(p))
}

function userIdFromHandle(handle: ActorHandle): string | null {
  if (handle.startsWith('user:')) return handle.slice(5)
  return null
}

function avatarForDesk(deskZoneId: string) {
  const member = props.members.find(m => m.deskZoneId === deskZoneId)
  if (!member) return null
  for (const p of props.participants.values()) {
    if (userIdFromHandle(p.handle) === member.userId) {
      return { participant: p, isOffline: false }
    }
  }
  return {
    participant: {
      handle: `user:${member.userId}` as ActorHandle,
      name: member.name,
      avatarUrl: member.avatarUrl,
      role: 'member' as const,
      status: 'away' as const,
      currentZoneId: null,
      joinedAt: 0,
      isGuest: false,
    } as OfficeParticipant,
    isOffline: true,
  }
}

function isSelfHandle(handle: ActorHandle): boolean {
  if (!user.value) return false
  return handle === `user:${user.value.id}`
}

const unassignedParticipants = computed(() => {
  const inZone = new Set<ActorHandle>()
  for (const list of Object.values(props.zoneOccupancy)) {
    for (const h of list) inZone.add(h)
  }
  const haveDeskUserIds = new Set(
    props.members.filter(m => m.deskZoneId).map(m => m.userId)
  )
  return Array.from(props.participants.values())
    .filter(p => !inZone.has(p.handle))
    .filter(p => {
      const uid = userIdFromHandle(p.handle)
      return uid === null || !haveDeskUserIds.has(uid)
    })
})

const totalParticipants = computed(() => props.participants.size)

function onAdhocClick(adhoc: OfficeZoneRow) {
  if (props.currentUserZoneId === adhoc.id) return
  const occupants = occupantsOf(adhoc.id)
  emit('knock', {
    zoneId: adhoc.id,
    zoneName: 'Discussion',
    occupantNames: occupants.map(o => o.name),
  })
}
</script>

<template>
  <!-- ro.am-style cinematic dark floor: pitch black with subtle purple-blue
       overhead glow. No warm tones; the entire surface feels like a studio -->
  <div
    class="relative overflow-auto rounded-2xl ring-1 ring-white/[0.06]
           bg-[#0a0b0e]
           shadow-[inset_0_2px_30px_rgba(0,0,0,0.6),0_20px_60px_-30px_rgba(0,0,0,0.8)]"
  >
    <!-- Floor surface -->
    <div
      class="relative"
      :style="{ width: layout.width + 'px', height: layout.height + 'px' }"
    >
      <!-- Overhead spotlight: soft purple-blue radial from top-center -->
      <div
        class="absolute inset-x-0 top-0 h-[60%] pointer-events-none
               bg-[radial-gradient(ellipse_at_top,_rgba(120,90,255,0.18)_0%,_rgba(80,120,255,0.06)_30%,_transparent_70%)]"
      />
      <!-- Faint grid texture for depth -->
      <div
        class="absolute inset-0 pointer-events-none opacity-[0.08]"
        style="background-image: radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px); background-size: 28px 28px"
      />

      <!-- Room-type zones only -->
      <OfficeZone
        v-for="zone in roomZones"
        :key="zone.id"
        :zone="zone"
        :occupants="occupantsOf(zone.id)"
        :current-user-zone-id="currentUserZoneId"
        @enter="emit('enterZone', $event)"
        @knock="(payload) => emit('knock', payload)"
        @toast="(t) => toast.add(t)"
      />

      <!-- Desk zones -->
      <div
        v-for="desk in deskZones"
        :key="desk.id"
        class="absolute"
        :style="{
          left: desk.position.x + 'px',
          top: desk.position.y + 'px',
          width: desk.position.w + 'px',
          height: desk.position.h + 'px',
        }"
      >
        <OfficeAvatar
          v-if="avatarForDesk(desk.id)"
          :participant="avatarForDesk(desk.id)!.participant"
          :is-offline="avatarForDesk(desk.id)!.isOffline"
          :is-self="isSelfHandle(avatarForDesk(desk.id)!.participant.handle)"
          :size="38"
          show-label
          @click="emit('knockPerson', $event)"
        />
      </div>

      <!-- Ad-hoc / discussion bubbles -->
      <div
        v-for="adhoc in adhocZones"
        :key="adhoc.id"
        class="absolute rounded-full backdrop-blur-md bg-white/[0.08] ring-1 ring-emerald-400/30
               shadow-[0_0_20px_rgba(52,211,153,0.25)] flex items-center justify-center gap-1
               cursor-pointer hover:bg-white/[0.12] transition"
        :style="{
          left: adhoc.position.x + 'px',
          top: adhoc.position.y + 'px',
          width: adhoc.position.w + 'px',
          height: adhoc.position.h + 'px',
        }"
        @click="onAdhocClick(adhoc)"
      >
        <OfficeAvatar
          v-for="p in occupantsOf(adhoc.id).slice(0, 4)"
          :key="p.handle"
          :participant="p"
          :size="28"
        />
        <span
          v-if="occupantsOf(adhoc.id).length > 4"
          class="text-[10px] text-white/60 px-1"
        >
          +{{ occupantsOf(adhoc.id).length - 4 }}
        </span>
      </div>
    </div>

    <!-- Unassigned rail -->
    <div
      v-if="unassignedParticipants.length"
      class="absolute top-4 left-1/2 -translate-x-1/2 max-w-[420px] backdrop-blur-xl
             bg-white/[0.04] ring-1 ring-white/[0.08] rounded-xl px-3 py-2 shadow-2xl"
    >
      <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40 mb-1.5">
        Unassigned · {{ unassignedParticipants.length }}
      </div>
      <div class="flex flex-wrap gap-2">
        <OfficeAvatar
          v-for="p in unassignedParticipants.slice(0, 5)"
          :key="p.handle"
          :participant="p"
          :size="30"
          show-label
          @click="emit('knockPerson', $event)"
        />
        <div
          v-if="unassignedParticipants.length > 5"
          class="text-xs text-white/40 self-center pl-1"
        >
          +{{ unassignedParticipants.length - 5 }}
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="totalParticipants === 0"
      class="absolute inset-0 flex items-center justify-center pointer-events-none"
    >
      <div class="text-center">
        <div class="size-12 mx-auto rounded-full bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center mb-3">
          <UIcon name="i-lucide-moon-star" class="size-5 text-white/30" />
        </div>
        <p class="text-xs text-white/40 tracking-wide">
          No one's here yet — be the first.
        </p>
      </div>
    </div>
  </div>
</template>
