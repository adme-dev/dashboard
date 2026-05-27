<script setup lang="ts">
import type {
  OfficeRow,
  OfficeZoneRow,
  OfficeMemberRow,
  OfficeMediaSession,
  OfficePresenceEvent,
  OfficePresenceEventKind,
  OfficePresenceEventTarget,
  OfficeParticipant,
  OfficeMemberRole,
  ZoneAcl,
  ZoneType,
  ActorHandle
} from '~~/app/types/office'
import { safeMediaUrl } from '~~/app/utils/safe-url'

type OfficeJoinFailure = {
  zoneId: string
  reason: 'denied' | 'full'
  message: string
}

type OfficeMediaUnavailable = {
  zoneId: string
  reason: string
  message: string
}

type OfficeMemberWithProfile = OfficeMemberRow & {
  name: string | null
  avatar_url: string | null
}

type SpotlightTarget = {
  id: string
  type: 'person' | 'room'
  label: string
  meta: string
  zone: OfficeZoneRow
  member?: OfficeMemberWithProfile
  participant?: OfficeParticipant
}

const props = defineProps<{
  office: OfficeRow
  zones: OfficeZoneRow[]
  members: OfficeMemberWithProfile[]
  participants: Map<ActorHandle, OfficeParticipant>
  zoneOccupancy: Record<string, ActorHandle[]>
  transientEvents: OfficePresenceEvent[]
  myRole: OfficeMemberRole
  currentZoneId?: string | null
  joinFailure?: OfficeJoinFailure | null
  mediaSession?: OfficeMediaSession | null
  mediaUnavailable?: OfficeMediaUnavailable | null
}>()

const emit = defineEmits<{
  enterZone: [zoneId: string]
  leaveZone: []
  presenceEvent: [kind: OfficePresenceEventKind, target: OfficePresenceEventTarget]
  evictParticipant: [handle: ActorHandle]
  zonesChanged: []
  zoneNotesChanged: [zone: OfficeZoneRow]
  setupMeeting: [zoneId: string, meetingId?: string, artifactId?: string]
}>()
const toast = useToast()
const { user } = useAuth()
const { openDM } = useChat()
const route = useRoute()

const floorRef = ref<HTMLElement | null>(null)
const query = ref('')
const searchFocused = ref(false)
const selectedTargetId = ref<string | null>(null)
const highlightedZoneId = ref<string | null>(null)
const adminMode = ref(false)
const adminSelectedZoneId = ref<string | null>(null)
const savingZone = ref(false)
const lockingRoomId = ref<string | null>(null)
const creatingZone = ref(false)
const deleteConfirmZoneId = ref<string | null>(null)
const openingMessageForId = ref<string | null>(null)
const openingThreadForId = ref<string | null>(null)
const pendingKnockTargetId = ref<string | null>(null)
const dismissedIncomingKnockIds = ref<Set<string>>(new Set())
const dismissedKnockResponseIds = ref<Set<string>>(new Set())
const knockResponseNotice = ref<{
  id: string
  sender: string
  targetLabel: string
  zoneId: string | null
} | null>(null)
let pendingKnockTimer: ReturnType<typeof setTimeout> | null = null
const {
  panelEl: personPanelEl,
  handleEl: personPanelHandleEl,
  isDragging: isPersonPanelDragging,
  panelStyle: personPanelStyle
} = useOfficeFloatingPanel({
  storageKey: 'office-person-panel-position',
  width: 360
})

const layout = computed(() => ({
  width: props.office.layout?.width ?? 1200,
  height: props.office.layout?.height ?? 800
}))

const participantByUserId = computed(() => {
  const byId = new Map<string, OfficeParticipant>()
  for (const participant of props.participants.values()) {
    if (participant.handle.startsWith('user:')) {
      byId.set(participant.handle.slice(5), participant)
    }
  }
  return byId
})

const deskZones = computed(() =>
  props.zones
    .filter(zone => zone.zone_type === 'desk')
    .slice()
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x || a.slug.localeCompare(b.slug))
)

const roomZones = computed(() =>
  props.zones.filter(zone => zone.zone_type !== 'desk')
)

const deskMembers = computed(() =>
  props.members
    .filter((member): member is OfficeMemberWithProfile & { user_id: string, name: string } =>
      Boolean(member.user_id && member.name)
    )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
)

function normalizedDeskToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const deskAssignments = computed(() => {
  const byZoneId = new Map<string, OfficeMemberWithProfile>()
  const usedMemberIds = new Set<string>()

  function assign(zone: OfficeZoneRow, member: OfficeMemberWithProfile | undefined) {
    if (!member?.user_id || usedMemberIds.has(member.user_id) || byZoneId.has(zone.id)) return
    byZoneId.set(zone.id, member)
    usedMemberIds.add(member.user_id)
  }

  for (const zone of deskZones.value) {
    const slug = zone.slug.startsWith('desk-') ? zone.slug.slice(5) : zone.slug
    assign(zone, deskMembers.value.find(member => member.user_id === slug))
  }

  for (const zone of deskZones.value) {
    const zoneTokens = [
      normalizedDeskToken(zone.slug.replace(/^desk-/, '')),
      normalizedDeskToken(zone.name.replace(/'s desk$/i, ''))
    ].filter(Boolean)
    assign(
      zone,
      deskMembers.value.find(member =>
        !usedMemberIds.has(member.user_id)
        && zoneTokens.some(token => token && normalizedDeskToken(member.name).includes(token))
      )
    )
  }

  const membersByInitial = new Map<string, OfficeMemberWithProfile[]>()
  for (const member of deskMembers.value) {
    if (!member.user_id || usedMemberIds.has(member.user_id)) continue
    const initial = member.name.trim()[0]?.toLowerCase()
    if (!initial) continue
    const list = membersByInitial.get(initial) ?? []
    list.push(member)
    membersByInitial.set(initial, list)
  }

  for (const zone of deskZones.value) {
    if (byZoneId.has(zone.id)) continue
    const initial = (zone.slug.replace(/^desk-/, '')[0] || zone.name[0] || '').toLowerCase()
    const match = membersByInitial.get(initial)?.shift()
    assign(zone, match)
  }

  const remaining = deskMembers.value.filter(member => member.user_id && !usedMemberIds.has(member.user_id))
  for (const zone of deskZones.value) {
    if (byZoneId.has(zone.id)) continue
    assign(zone, remaining.shift())
  }

  return byZoneId
})

const deskByUserId = computed(() => {
  const byUserId = new Map<string, OfficeZoneRow>()
  for (const zone of deskZones.value) {
    const owner = deskAssignments.value.get(zone.id)
    if (owner?.user_id) byUserId.set(owner.user_id, zone)
  }
  return byUserId
})

function deskOwner(zone: OfficeZoneRow): OfficeMemberWithProfile | null {
  if (zone.zone_type !== 'desk') return null
  return deskAssignments.value.get(zone.id) ?? null
}

function deskOwnerParticipant(zone: OfficeZoneRow): OfficeParticipant | null {
  const owner = deskOwner(zone)
  return owner?.user_id ? participantByUserId.value.get(owner.user_id) ?? null : null
}

function deskOwnerLocation(zone: OfficeZoneRow) {
  const participant = deskOwnerParticipant(zone)
  if (!participant?.currentZoneId) return null
  return props.zones.find(item => item.id === participant.currentZoneId)?.name ?? null
}

function deskZoneForUserId(userId: string | null): OfficeZoneRow | null {
  if (!userId) return null
  return deskByUserId.value.get(userId) ?? null
}

function occupantsOf(zoneId: string): OfficeParticipant[] {
  const handles = props.zoneOccupancy[zoneId] || []
  return handles
    .map(h => props.participants.get(h))
    .filter((p): p is OfficeParticipant => Boolean(p))
}

function presenceEventsForZone(zone: OfficeZoneRow) {
  return props.transientEvents
    .filter((event) => {
      if (event.target.zoneId === zone.id) return true
      if (event.target.type !== 'actor') return false
      return props.participants.get(event.target.handle)?.currentZoneId === zone.id
    })
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(event => ({
      id: event.id,
      kind: event.kind,
      createdAt: event.createdAt,
      label: event.kind === 'knock'
        ? `${participantName(event.from)} knocking`
        : event.kind === 'raise_hand'
          ? `${participantName(event.from)} raised hand`
          : `${participantName(event.from)} waved`
    }))
}

const lobbyOccupants = computed<OfficeParticipant[]>(() => {
  const inZone = new Set<ActorHandle>()
  for (const list of Object.values(props.zoneOccupancy)) {
    for (const h of list) inZone.add(h)
  }
  return Array.from(props.participants.values()).filter(p => !inZone.has(p.handle))
})

const totalParticipants = computed(() => props.participants.size)

const searchTargets = computed<SpotlightTarget[]>(() => {
  const roomTargets = props.zones
    .filter(zone => zone.zone_type !== 'desk')
    .map(zone => ({
      id: `room:${zone.id}`,
      type: 'room' as const,
      label: zone.name,
      meta: `${zone.zone_type.replace('_', ' ')} · ${occupantsOf(zone.id).length}/${zone.capacity}`,
      zone
    }))

  const personTargets = props.members
    .filter(member => member.user_id && member.name)
    .map((member) => {
      const participant = participantByUserId.value.get(member.user_id!)
      const zone = participant?.currentZoneId
        ? props.zones.find(z => z.id === participant.currentZoneId) ?? deskZoneForUserId(member.user_id)
        : deskZoneForUserId(member.user_id)
      if (!zone) return null
      return {
        id: `person:${member.id}`,
        type: 'person' as const,
        label: member.name!,
        meta: participant?.currentZoneId
          ? `In ${zone.name}`
          : participant ? 'Around the office' : 'Private office',
        zone,
        member,
        participant
      }
    })
    .filter((target): target is SpotlightTarget => Boolean(target))

  return [...personTargets, ...roomTargets].sort((a, b) => a.label.localeCompare(b.label))
})

const filteredTargets = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return searchTargets.value.slice(0, 8)
  return searchTargets.value
    .filter(target =>
      target.label.toLowerCase().includes(needle)
      || target.meta.toLowerCase().includes(needle)
      || target.zone.name.toLowerCase().includes(needle)
    )
    .slice(0, 8)
})
const showSearchResults = computed(() =>
  searchFocused.value && filteredTargets.value.length > 0
)

const selectedTarget = computed(() =>
  searchTargets.value.find(target => target.id === selectedTargetId.value) ?? null
)

const selectedZone = computed(() => selectedTarget.value?.zone ?? null)
const selectedEditableZone = computed(() =>
  adminSelectedZoneId.value
    ? props.zones.find(zone => zone.id === adminSelectedZoneId.value) ?? selectedZone.value
    : selectedZone.value
)
const adminSlugPreview = computed(() => slugify(adminDraft.slug || adminDraft.name))
const adminDraftValid = computed(() =>
  Boolean(
    selectedEditableZone.value
    && adminDraft.name.trim()
    && adminSlugPreview.value
    && adminDraft.capacity >= 1
  )
)
const selectedOccupants = computed(() =>
  selectedZone.value ? occupantsOf(selectedZone.value.id) : []
)
const selectedJoinFailureMessage = computed(() =>
  selectedZone.value && props.joinFailure?.zoneId === selectedZone.value.id
    ? props.joinFailure.message
    : null
)
const selectedMediaSession = computed(() =>
  selectedZone.value?.id === props.currentZoneId ? props.mediaSession ?? null : null
)
const selectedMediaUnavailableMessage = computed(() =>
  selectedZone.value && props.mediaUnavailable?.zoneId === selectedZone.value.id
    ? props.mediaUnavailable.message
    : null
)
const isOfficeAdmin = computed(() => props.myRole === 'admin')
const adminDraft = reactive({
  name: '',
  slug: '',
  zone_type: 'meeting' as ZoneType,
  capacity: 1,
  is_private: false,
  allowed_roles: [] as OfficeMemberRole[],
  public_lobby: false
})
const currentUserHandle = computed<ActorHandle | null>(() =>
  user.value?.id ? `user:${user.value.id}` as ActorHandle : null
)
const incomingKnocks = computed(() =>
  props.transientEvents.filter(event =>
    event.kind === 'knock'
    && event.from !== currentUserHandle.value
    && !dismissedIncomingKnockIds.value.has(event.id)
    && (
      event.target.zoneId === props.currentZoneId
      || event.target.handle === currentUserHandle.value
    )
  )
)
const incomingKnock = computed(() => incomingKnocks.value[0] ?? null)
const incomingKnockSender = computed(() =>
  incomingKnock.value ? participantName(incomingKnock.value.from) : 'Someone'
)
const incomingKnockResponses = computed(() =>
  props.transientEvents.filter(event =>
    event.kind === 'wave'
    && Boolean(pendingKnockTargetId.value)
    && event.from !== currentUserHandle.value
    && !dismissedKnockResponseIds.value.has(event.id)
    && event.target.type === 'actor'
    && event.target.handle === currentUserHandle.value
  )
)
const incomingKnockResponse = computed(() => incomingKnockResponses.value[0] ?? null)
const isSelectedCurrentZone = computed(() =>
  Boolean(
    selectedZone.value
    && (
      selectedZone.value.id === props.currentZoneId
      || (
        currentUserHandle.value
        && selectedOccupants.value.some(occupant => occupant.handle === currentUserHandle.value)
      )
    )
  )
)
const selectedPersonStatus = computed(() => {
  if (selectedTarget.value?.type !== 'person') return 'Private office'
  if (!selectedTarget.value.participant) return 'Away from office'
  return selectedTarget.value.participant.status === 'dnd'
    ? 'Do not disturb'
    : selectedTarget.value.participant.status.charAt(0).toUpperCase() + selectedTarget.value.participant.status.slice(1)
})
const selectedPersonIsSelf = computed(() =>
  selectedTarget.value?.type === 'person'
  && Boolean(user.value?.id)
  && selectedTarget.value.member?.user_id === user.value?.id
)
const selectedPersonOnline = computed(() =>
  selectedTarget.value?.type === 'person' && Boolean(selectedTarget.value.participant)
)
const canSendPresenceToSelectedPerson = computed(() =>
  selectedTarget.value?.type === 'person'
  && selectedPersonOnline.value
  && !selectedPersonIsSelf.value
)
const canMessageSelectedPerson = computed(() =>
  selectedTarget.value?.type === 'person'
  && Boolean(selectedTarget.value.member?.user_id)
  && !selectedPersonIsSelf.value
)
const canEnterSelectedPersonOffice = computed(() =>
  selectedTarget.value?.type === 'person'
  && selectedPersonIsSelf.value
  && Boolean(selectedZone.value)
)
const selectedPersonPrimaryActionLabel = computed(() => {
  if (selectedPersonIsSelf.value) return isSelectedCurrentZone.value ? 'Leave' : 'Enter'
  return 'Knock'
})
const selectedPersonPrimaryActionIcon = computed(() => {
  if (selectedPersonIsSelf.value) return isSelectedCurrentZone.value ? 'i-lucide-log-out' : 'i-lucide-door-open'
  return 'i-lucide-hand'
})
const canUseSelectedPersonPrimaryAction = computed(() =>
  selectedPersonIsSelf.value ? canEnterSelectedPersonOffice.value : canSendPresenceToSelectedPerson.value
)
function setupMeetingForRoom(zoneId: string, meetingId?: string, artifactId?: string) {
  emit('setupMeeting', zoneId, meetingId, artifactId)
  selectedTargetId.value = null
}
const selectedPersonPrimaryActionTitle = computed(() => {
  if (selectedPersonIsSelf.value) {
    return isSelectedCurrentZone.value ? 'Leave your private office.' : 'Enter your private office.'
  }
  return canSendPresenceToSelectedPerson.value
    ? 'Knock before entering their private office.'
    : 'Knock is available when this person is online.'
})
const selectedPersonLocationLabel = computed(() => {
  if (selectedTarget.value?.type !== 'person') return ''
  if (selectedTarget.value.participant?.currentZoneId && selectedTarget.value.zone.name) return selectedTarget.value.zone.name
  return selectedTarget.value.zone.zone_type === 'desk' ? 'Private office' : selectedTarget.value.zone.name
})
const selectedPersonPresenceClass = computed(() => {
  if (selectedPersonIsSelf.value) return 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
  if (!selectedPersonOnline.value) return 'bg-white/[0.05] text-white/45 ring-white/[0.06]'
  if (selectedTarget.value?.participant?.status === 'dnd') return 'bg-red-400/10 text-red-100 ring-red-300/15'
  if (selectedTarget.value?.participant?.status === 'busy') return 'bg-amber-300/10 text-amber-100 ring-amber-200/15'
  return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
})

watch(
  selectedEditableZone,
  (zone) => {
    if (!zone) return
    adminDraft.name = zone.name
    adminDraft.slug = zone.slug
    adminDraft.zone_type = zone.zone_type
    adminDraft.capacity = zone.capacity
    adminDraft.is_private = zone.is_private
    adminDraft.allowed_roles = normalizeAllowedRoles(zone.acl)
    adminDraft.public_lobby = Boolean(zone.acl?.public_lobby)
    deleteConfirmZoneId.value = null
  },
  { immediate: true }
)

watch(adminMode, (enabled) => {
  if (!enabled) adminSelectedZoneId.value = null
})

watch(incomingKnockResponse, (event) => {
  if (!event || !pendingKnockTargetId.value) return
  const pendingTarget = searchTargets.value.find(target => target.id === pendingKnockTargetId.value)
  clearPendingKnock()
  dismissedKnockResponseIds.value = new Set([...dismissedKnockResponseIds.value, event.id])
  knockResponseNotice.value = {
    id: event.id,
    sender: participantName(event.from),
    targetLabel: pendingTarget?.label ?? 'your knock',
    zoneId: event.target.zoneId
  }
  actionToast('Response received', `${participantName(event.from)} responded to your knock.`, 'i-lucide-hand-heart')
})

function roomLink(zone: OfficeZoneRow) {
  if (typeof window === 'undefined') return `/lobby/${props.office.id}?room=${zone.slug}`
  return `${window.location.origin}/lobby/${props.office.id}?room=${zone.slug}`
}

function focusZone(zone: OfficeZoneRow) {
  highlightedZoneId.value = zone.id
  floorRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function handleSearchFocusOut(event: FocusEvent) {
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && event.currentTarget instanceof HTMLElement && event.currentTarget.contains(nextTarget)) {
    return
  }
  searchFocused.value = false
}

function selectTarget(target: SpotlightTarget) {
  selectedTargetId.value = target.id
  adminSelectedZoneId.value = target.zone.id
  query.value = ''
  searchFocused.value = false
  focusZone(target.zone)
}

function selectAdminZone(zone: OfficeZoneRow) {
  adminSelectedZoneId.value = zone.id
  const target = searchTargets.value.find(item => item.type === 'room' && item.zone.id === zone.id)
  selectedTargetId.value = target?.id ?? null
  focusZone(zone)
}

function handleZoneClick(zoneId: string) {
  const zone = props.zones.find(item => item.id === zoneId)
  const target = searchTargets.value.find(item => item.zone.id === zoneId)
  if (adminMode.value && zone) {
    selectAdminZone(zone)
    return
  }
  if (target) {
    selectTarget(target)
    return
  }
  emit('enterZone', zoneId)
}

function selectRoomBySlug(slug: string | null) {
  if (!slug) return
  const target = searchTargets.value.find(item => item.type === 'room' && item.zone.slug === slug)
  if (target) {
    selectedTargetId.value = target.id
    nextTick(() => focusZone(target.zone))
  }
}

function actionToast(title: string, description: string, icon: string) {
  toast.add({ title, description, icon, color: 'neutral', duration: 2200 })
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function nextAvailableRoomDraft() {
  const existingSlugs = new Set(props.zones.map(zone => zone.slug))
  const existingNames = new Set(props.zones.map(zone => zone.name.toLowerCase()))
  for (let index = 1; index < 1000; index++) {
    const name = `Room ${index}`
    const slug = slugify(name)
    if (!existingSlugs.has(slug) && !existingNames.has(name.toLowerCase())) {
      return { name, slug }
    }
  }
  return {
    name: `Room ${Date.now()}`,
    slug: `room-${Date.now()}`
  }
}

function normalizeAllowedRoles(acl: ZoneAcl | null | undefined): OfficeMemberRole[] {
  return (acl?.allowed_roles ?? [])
    .filter((role): role is OfficeMemberRole => role === 'admin' || role === 'member' || role === 'guest')
}

function toggleAdminRoleAccess(role: OfficeMemberRole) {
  adminDraft.allowed_roles = adminDraft.allowed_roles.includes(role)
    ? adminDraft.allowed_roles.filter(item => item !== role)
    : [...adminDraft.allowed_roles, role]
}

function adminAclDraft(): ZoneAcl {
  return {
    ...(adminDraft.allowed_roles.length ? { allowed_roles: adminDraft.allowed_roles } : {}),
    ...(adminDraft.public_lobby ? { public_lobby: true } : {})
  }
}

function clampPosition(zone: OfficeZoneRow, patch: Partial<OfficeZoneRow['position']>) {
  const next = { ...zone.position, ...patch }
  next.w = Math.max(48, Math.round(next.w))
  next.h = Math.max(48, Math.round(next.h))
  next.x = Math.max(0, Math.min(layout.value.width - next.w, Math.round(next.x)))
  next.y = Math.max(0, Math.min(layout.value.height - next.h, Math.round(next.y)))
  return next
}

async function updateZone(zone: OfficeZoneRow, body: Record<string, unknown>, label = 'Zone updated') {
  savingZone.value = true
  try {
    await $fetch(`/api/office/${props.office.id}/zones/${zone.id}`, {
      method: 'PATCH',
      body
    })
    toast.add({ title: label, icon: 'i-lucide-check', color: 'success', duration: 1400 })
    emit('zonesChanged')
  } catch (err: unknown) {
    toast.add({
      title: 'Could not update zone',
      description: errorMessage(err) || 'Try again in a moment.',
      icon: 'i-lucide-map',
      color: 'error'
    })
  } finally {
    savingZone.value = false
  }
}

async function saveSelectedZone() {
  const zone = selectedEditableZone.value
  if (!zone) return
  if (!adminDraftValid.value) {
    toast.add({
      title: 'Check room details',
      description: 'Room name, slug, and capacity are required before saving.',
      icon: 'i-lucide-circle-alert',
      color: 'warning'
    })
    return
  }
  await updateZone(zone, {
    name: adminDraft.name.trim(),
    slug: adminSlugPreview.value,
    zone_type: adminDraft.zone_type,
    capacity: adminDraft.capacity,
    is_private: adminDraft.is_private,
    acl: adminAclDraft()
  })
}

async function nudgeSelectedZone(dx: number, dy: number, dw = 0, dh = 0) {
  const zone = selectedEditableZone.value
  if (!zone) return
  await updateZone(zone, {
    position: clampPosition(zone, {
      x: zone.position.x + dx,
      y: zone.position.y + dy,
      w: zone.position.w + dw,
      h: zone.position.h + dh
    })
  }, 'Layout updated')
}

async function createZone() {
  creatingZone.value = true
  try {
    const draft = nextAvailableRoomDraft()
    await $fetch(`/api/office/${props.office.id}/zones`, {
      method: 'POST',
      body: {
        slug: draft.slug,
        name: draft.name,
        zone_type: 'meeting',
        position: { x: 80, y: 80, w: 240, h: 160 },
        capacity: 8,
        is_private: false,
        acl: {}
      }
    })
    toast.add({ title: 'Room created', icon: 'i-lucide-plus', color: 'success', duration: 1400 })
    emit('zonesChanged')
  } catch (err: unknown) {
    toast.add({
      title: 'Could not create room',
      description: errorMessage(err) || 'Try again in a moment.',
      icon: 'i-lucide-plus',
      color: 'error'
    })
  } finally {
    creatingZone.value = false
  }
}

async function deleteSelectedZone() {
  const zone = selectedEditableZone.value
  if (!zone) return
  savingZone.value = true
  try {
    await $fetch(`/api/office/${props.office.id}/zones/${zone.id}`, { method: 'DELETE' })
    toast.add({ title: 'Zone deleted', icon: 'i-lucide-trash-2', color: 'success', duration: 1400 })
    selectedTargetId.value = null
    adminSelectedZoneId.value = null
    deleteConfirmZoneId.value = null
    emit('zonesChanged')
  } catch (err: unknown) {
    toast.add({
      title: 'Could not delete zone',
      description: errorMessage(err) || 'Try again in a moment.',
      icon: 'i-lucide-trash-2',
      color: 'error'
    })
  } finally {
    savingZone.value = false
  }
}

function requestDeleteSelectedZone() {
  const zone = selectedEditableZone.value
  if (!zone) return
  if (deleteConfirmZoneId.value !== zone.id) {
    deleteConfirmZoneId.value = zone.id
    toast.add({
      title: 'Confirm room delete',
      description: `Click Confirm delete to remove ${zone.name}.`,
      icon: 'i-lucide-triangle-alert',
      color: 'warning',
      duration: 3000
    })
    return
  }
  void deleteSelectedZone()
}

function errorMessage(err: unknown) {
  if (err && typeof err === 'object') {
    const data = 'data' in err ? (err as { data?: { statusMessage?: string } }).data : undefined
    const statusMessage = 'statusMessage' in err ? (err as { statusMessage?: string }).statusMessage : undefined
    const message = 'message' in err ? (err as { message?: string }).message : undefined
    return data?.statusMessage || statusMessage || message
  }
  return undefined
}

function participantName(handle: ActorHandle) {
  const participant = props.participants.get(handle)
  if (participant?.name) return participant.name
  const userId = handle.startsWith('user:') ? handle.slice(5) : null
  return props.members.find(member => member.user_id === userId)?.name ?? 'Someone'
}

function targetAvatarSrc(target: SpotlightTarget) {
  return safeMediaUrl(target.member?.avatar_url) ?? safeMediaUrl(target.participant?.avatarUrl)
}

function openPersonByHandle(handle: ActorHandle) {
  const target = searchTargets.value.find(item =>
    item.type === 'person'
    && item.participant?.handle === handle
  )

  if (target) {
    selectTarget(target)
    return
  }

  actionToast(
    'Guest profile',
    'External guests are shown through guest badges and lobby requests.',
    'i-lucide-user-round-search'
  )
}

function knockTarget(target: SpotlightTarget) {
  clearPendingKnock()
  knockResponseNotice.value = null
  pendingKnockTargetId.value = target.id
  emit('presenceEvent', 'knock', presenceEventTargetFor(target))
  pendingKnockTimer = window.setTimeout(() => {
    if (pendingKnockTargetId.value === target.id) pendingKnockTargetId.value = null
    pendingKnockTimer = null
  }, 15000)
  actionToast(
    target.type === 'person' ? `Knocking on ${target.label}` : `Knocking on ${target.zone.name}`,
    'Waiting for a response.',
    'i-lucide-hand'
  )
}

function clearPendingKnock() {
  if (pendingKnockTimer) window.clearTimeout(pendingKnockTimer)
  pendingKnockTimer = null
  pendingKnockTargetId.value = null
}

function cancelPendingKnock() {
  clearPendingKnock()
  actionToast('Knock cancelled', 'No room state was changed.', 'i-lucide-x')
}

function dismissIncomingKnock(id: string) {
  dismissedIncomingKnockIds.value = new Set([...dismissedIncomingKnockIds.value, id])
}

function acceptIncomingKnock(event: OfficePresenceEvent) {
  emit('presenceEvent', 'wave', {
    type: 'actor',
    handle: event.from,
    zoneId: props.currentZoneId ?? event.target.zoneId
  })
  dismissIncomingKnock(event.id)
  actionToast('Response sent', `${participantName(event.from)} will see your response.`, 'i-lucide-hand-heart')
}

function dismissKnockResponse() {
  if (knockResponseNotice.value) {
    dismissedKnockResponseIds.value = new Set([...dismissedKnockResponseIds.value, knockResponseNotice.value.id])
  }
  knockResponseNotice.value = null
}

function enterKnockResponseZone() {
  const zoneId = knockResponseNotice.value?.zoneId
  if (!zoneId) return
  emit('enterZone', zoneId)
  dismissKnockResponse()
}

function waveTarget(target: SpotlightTarget) {
  emit('presenceEvent', 'wave', presenceEventTargetFor(target))
  actionToast(`Waved to ${target.label}`, 'They will see it on the office map for a few seconds.', 'i-lucide-hand-heart')
}

function knockSelectedRoom() {
  const target = selectedTarget.value
  if (target?.type !== 'room') return
  knockTarget(target)
}

function waveSelectedRoom() {
  const target = selectedTarget.value
  if (target?.type !== 'room') return
  waveTarget(target)
}

function raiseHandSelectedRoom() {
  const target = selectedTarget.value
  if (target?.type !== 'room') return
  emit('presenceEvent', 'raise_hand', presenceEventTargetFor(target))
  actionToast('Hand raised', `${target.zone.name} will show this for a few seconds.`, 'i-lucide-hand-metal')
}

function evictSelectedRoomOccupant(handle: ActorHandle) {
  if (!isOfficeAdmin.value || handle === currentUserHandle.value) return
  emit('evictParticipant', handle)
  actionToast('Removed from room', 'Their room session was ended.', 'i-lucide-user-minus')
}

async function toggleSelectedRoomLock() {
  const target = selectedTarget.value
  if (target?.type !== 'room' || !isOfficeAdmin.value) return

  const zone = target.zone
  lockingRoomId.value = zone.id
  try {
    await updateZone(
      zone,
      { is_private: !zone.is_private },
      zone.is_private ? 'Room unlocked' : 'Room locked'
    )
  } finally {
    lockingRoomId.value = null
  }
}

function handleSelectedPersonPrimaryAction() {
  const target = selectedTarget.value
  if (target?.type !== 'person') return
  if (selectedPersonIsSelf.value) {
    if (isSelectedCurrentZone.value) emit('leaveZone')
    else if (selectedZone.value) emit('enterZone', selectedZone.value.id)
    return
  }
  knockTarget(target)
}

function presenceEventTargetFor(target: SpotlightTarget): OfficePresenceEventTarget {
  if (target.type === 'person' && target.member?.user_id) {
    return {
      type: 'actor',
      handle: `user:${target.member.user_id}`,
      zoneId: target.zone.id
    }
  }
  return { type: 'zone', zoneId: target.zone.id }
}

onBeforeUnmount(() => {
  if (pendingKnockTimer) window.clearTimeout(pendingKnockTimer)
})

async function copyRoomLink(target: SpotlightTarget) {
  const link = roomLink(target.zone)
  try {
    if (!navigator.clipboard) throw new Error('Clipboard unavailable')
    await navigator.clipboard.writeText(link)
    toast.add({
      title: 'Guest link copied',
      description: `${target.zone.name} lobby link`,
      icon: 'i-lucide-link',
      color: 'success',
      duration: 1800
    })
  } catch {
    toast.add({
      title: 'Room link',
      description: link,
      icon: 'i-lucide-link',
      color: 'neutral',
      duration: 5000
    })
  }
}

async function openRoomThread(target: SpotlightTarget) {
  if (target.zone.zone_type === 'desk') {
    actionToast('Use direct message', 'Desk conversations open as direct messages.', 'i-lucide-message-circle')
    return
  }

  openingThreadForId.value = target.id
  try {
    const channel = await $fetch<{ id: string }>(
      `/api/office/${props.office.id}/zones/${target.zone.id}/thread`,
      { method: 'POST' }
    )
    toast.add({
      title: `Opening ${target.zone.name}`,
      description: 'Room thread ready in Chat.',
      icon: 'i-lucide-messages-square',
      color: 'success',
      duration: 1800
    })
    await navigateTo({
      path: '/agency/chat',
      query: {
        channel: channel.id,
        source: 'office-room',
        room: target.zone.slug
      }
    })
  } catch (err: unknown) {
    toast.add({
      title: 'Could not open room thread',
      description: errorMessage(err) || 'Try again in a moment.',
      icon: 'i-lucide-message-circle-warning',
      color: 'error'
    })
  } finally {
    openingThreadForId.value = null
  }
}

function copySelectedRoomLink() {
  const target = selectedTarget.value
  if (target?.type !== 'room') return
  void copyRoomLink(target)
}

function openSelectedRoomThread() {
  const target = selectedTarget.value
  if (target?.type !== 'room') return
  void openRoomThread(target)
}

async function messageTarget(target: SpotlightTarget) {
  const targetUserId = target.member?.user_id

  if (target.type !== 'person' || !targetUserId) {
    actionToast('Choose a person', 'Room threads land with the room panel phase. For now, message a teammate directly.', 'i-lucide-message-circle')
    return
  }

  if (targetUserId === user.value?.id) {
    actionToast('This is you', 'Direct messages are for reaching another teammate from the office.', 'i-lucide-user')
    return
  }

  openingMessageForId.value = target.id
  try {
    const channel = await openDM(targetUserId)
    toast.add({
      title: `Opening ${target.label}`,
      description: 'Direct message ready in Chat.',
      icon: 'i-lucide-message-circle',
      color: 'success',
      duration: 1800
    })
    await navigateTo({
      path: '/agency/chat',
      query: {
        channel: channel.id,
        source: 'office'
      }
    })
  } catch (err: unknown) {
    toast.add({
      title: 'Could not open message',
      description: errorMessage(err) || 'Try again in a moment.',
      icon: 'i-lucide-message-circle-warning',
      color: 'error'
    })
  } finally {
    openingMessageForId.value = null
  }
}

async function openProfile(target: SpotlightTarget) {
  if (target.type !== 'person') return
  await navigateTo({
    path: '/agency/team',
    query: target.member?.user_id ? { member: target.member.user_id, source: 'office' } : { source: 'office' }
  })
}

watch(
  () => [route.query.room, searchTargets.value.length] as const,
  ([room]) => {
    selectRoomBySlug(typeof room === 'string' ? room : null)
  },
  { immediate: true }
)
</script>

<template>
  <!-- ro.am-style cinematic dark floor: pitch black with subtle purple-blue
       overhead glow. No warm tones; the entire surface feels like a studio -->
  <div
    ref="floorRef"
    class="relative isolate overflow-hidden rounded-xl border border-white/[0.08] ring-1 ring-black/60
           bg-[#080a0f]
           shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_24px_70px_-45px_rgba(0,0,0,0.95)]"
  >
    <div
      class="sticky left-0 top-0 z-30 w-[min(520px,calc(100%-1rem))] overflow-visible p-2 sm:left-3 sm:top-3 sm:w-[min(520px,calc(100%-2rem))] sm:p-3"
      @focusout="handleSearchFocusOut"
    >
      <div class="flex gap-2 rounded-xl border border-white/[0.08] bg-[#10141b]/95 p-1.5 shadow-[0_18px_45px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl">
        <div class="relative min-w-0 flex-1">
          <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/35" />
          <input
            v-model="query"
            type="search"
            placeholder="Find people, rooms, desks"
            class="h-10 w-full rounded-lg border border-white/[0.08] bg-black/20 pl-9 pr-3 text-sm text-white placeholder:text-white/35 outline-none transition focus:border-white/25 focus:bg-[#151922]"
            @focus="searchFocused = true"
            @keydown.esc="searchFocused = false; query = ''"
          >
        </div>
        <button
          v-if="isOfficeAdmin"
          type="button"
          class="flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition"
          :class="adminMode
            ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
            : 'border-white/[0.08] bg-[#11141a]/95 text-white/60 hover:bg-white/[0.06] hover:text-white'"
          @click="adminMode = !adminMode"
        >
          <UIcon name="i-lucide-pencil-ruler" class="size-3.5" />
          Edit
        </button>
      </div>

      <div
        v-if="showSearchResults"
        class="absolute left-2 right-2 top-[calc(100%-0.5rem)] z-50 max-h-[min(360px,calc(100dvh-11rem))] overflow-y-auto rounded-lg border border-white/[0.08] bg-[#11141a]/95 shadow-2xl backdrop-blur-xl sm:left-3 sm:right-3 sm:top-[calc(100%-0.75rem)]"
      >
        <button
          v-for="target in filteredTargets"
          :key="target.id"
          type="button"
          class="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-white/[0.06]"
          :class="selectedTargetId === target.id ? 'bg-white/[0.08]' : ''"
          @mousedown.prevent="selectTarget(target)"
        >
          <UAvatar
            v-if="target.type === 'person'"
            :src="targetAvatarSrc(target)"
            :alt="target.label"
            size="xs"
            :ui="{ root: 'ring-1 ring-white/15' }"
          />
          <span
            v-else
            class="flex size-6 items-center justify-center rounded-md bg-white/[0.06] ring-1 ring-white/[0.08]"
          >
            <UIcon name="i-lucide-door-open" class="size-3.5 text-white/55" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-xs font-medium text-white/90">{{ target.label }}</span>
            <span class="block truncate text-[11px] text-white/40">{{ target.meta }}</span>
          </span>
          <span
            v-if="target.participant"
            class="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
          />
        </button>
      </div>
    </div>

    <!-- Floor surface -->
    <section class="relative px-3 pb-4 pt-3 sm:px-4 sm:pt-4">
      <div
        class="pointer-events-none absolute inset-x-0 top-0 h-[45%]
               bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.10)_0%,_rgba(80,120,255,0.05)_34%,_transparent_72%)]"
      />
      <div
        class="pointer-events-none absolute inset-0 opacity-[0.08]"
        style="background-image: radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px); background-size: 28px 28px"
      />

      <div class="relative grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3 lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <OfficeZone
          v-for="zone in roomZones"
          :key="zone.id"
          :zone="zone"
          layout="grid"
          :desk-owner="deskOwner(zone)"
          :desk-owner-participant="deskOwnerParticipant(zone)"
          :desk-owner-location="deskOwnerLocation(zone)"
          :occupants="occupantsOf(zone.id)"
          :presence-events="presenceEventsForZone(zone)"
          :is-highlighted="highlightedZoneId === zone.id"
          :is-selected="selectedZone?.id === zone.id || adminSelectedZoneId === zone.id"
          @enter="handleZoneClick"
        />
      </div>
    </section>

    <section
      v-if="deskZones.length"
      class="relative z-10 border-t border-white/[0.06] bg-black/10 px-3 py-4 sm:px-4"
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 class="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
            Private offices
          </h3>
          <p class="mt-1 text-xs text-white/35">
            {{ deskZones.length }} assigned desks
          </p>
        </div>
      </div>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,150px),1fr))] gap-3">
        <OfficeZone
          v-for="zone in deskZones"
          :key="zone.id"
          :zone="zone"
          layout="grid"
          :desk-owner="deskOwner(zone)"
          :occupants="occupantsOf(zone.id)"
          :presence-events="presenceEventsForZone(zone)"
          :is-highlighted="highlightedZoneId === zone.id"
          :is-selected="selectedZone?.id === zone.id || adminSelectedZoneId === zone.id"
          @enter="handleZoneClick"
        />
      </div>
    </section>

    <aside
      v-if="adminMode"
      class="absolute bottom-3 left-3 z-40 w-[min(390px,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-emerald-300/15 bg-[#11141a]/95 shadow-2xl backdrop-blur-xl sm:bottom-4 sm:left-4"
    >
      <header class="flex items-center justify-between gap-3 border-b border-white/[0.06] px-3 py-3">
        <div class="min-w-0">
          <div class="text-sm font-semibold text-white">
            Map editor
          </div>
          <div class="truncate text-xs text-white/40">
            {{ selectedEditableZone ? selectedEditableZone.name : 'Select a room or private office' }}
          </div>
        </div>
        <button
          type="button"
          class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
          :disabled="creatingZone"
          @click="createZone"
        >
          <UIcon
            :name="creatingZone ? 'i-lucide-loader-circle' : 'i-lucide-plus'"
            class="mr-1 inline size-3.5"
            :class="creatingZone ? 'animate-spin' : ''"
          />
          Room
        </button>
      </header>

      <div
        v-if="selectedEditableZone"
        class="space-y-3 p-3"
      >
        <div class="grid grid-cols-2 gap-2">
          <label class="space-y-1">
            <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">Name</span>
            <input
              v-model="adminDraft.name"
              class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
            >
          </label>
          <label class="space-y-1">
            <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">Slug</span>
            <input
              v-model="adminDraft.slug"
              class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
            >
            <span class="block truncate text-[10px] text-white/30">
              Saves as {{ adminSlugPreview || 'room-slug' }}
            </span>
          </label>
          <label class="space-y-1">
            <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">Type</span>
            <select
              v-model="adminDraft.zone_type"
              class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
            >
              <option value="meeting">Meeting</option>
              <option value="focus">Focus</option>
              <option value="lobby">Lobby</option>
              <option value="client_lounge">Client lounge</option>
              <option value="theater">Theater</option>
              <option value="desk">Private office</option>
            </select>
          </label>
          <label class="space-y-1">
            <span class="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">Capacity</span>
            <input
              v-model.number="adminDraft.capacity"
              type="number"
              min="1"
              class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
            >
          </label>
        </div>

        <label class="flex items-center gap-2 rounded-md bg-white/[0.035] px-2.5 py-2 text-xs text-white/65 ring-1 ring-white/[0.05]">
          <input
            v-model="adminDraft.is_private"
            type="checkbox"
            class="size-3.5 accent-emerald-400"
          >
          Private room
        </label>

        <section class="rounded-lg bg-white/[0.025] p-2.5 ring-1 ring-white/[0.06]">
          <div class="mb-2 flex items-center justify-between gap-3">
            <div>
              <div class="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
                Room access
              </div>
              <p class="mt-0.5 text-[11px] text-white/35">
                Applied when the room is private.
              </p>
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-[10px] font-medium ring-1"
              :class="adminDraft.is_private ? 'bg-amber-400/10 text-amber-100 ring-amber-300/15' : 'bg-white/[0.04] text-white/35 ring-white/[0.06]'"
            >
              {{ adminDraft.is_private ? 'Restricted' : 'Open' }}
            </span>
          </div>

          <div class="grid grid-cols-3 gap-1.5">
            <button
              v-for="role in ['admin', 'member', 'guest']"
              :key="role"
              type="button"
              class="h-8 rounded-md text-[11px] font-semibold capitalize ring-1 transition"
              :class="adminDraft.allowed_roles.includes(role as OfficeMemberRole)
                ? 'bg-emerald-400/12 text-emerald-100 ring-emerald-300/20'
                : 'bg-white/[0.035] text-white/45 ring-white/[0.06] hover:bg-white/[0.06]'"
              @click="toggleAdminRoleAccess(role as OfficeMemberRole)"
            >
              {{ role }}
            </button>
          </div>

          <label class="mt-2 flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-2.5 py-2 text-xs text-white/60 ring-1 ring-white/[0.05]">
            <span class="min-w-0">
              <span class="block font-medium text-white/70">Public lobby entry</span>
              <span class="block truncate text-[11px] text-white/35">Allow approved lobby guests into this zone.</span>
            </span>
            <input
              v-model="adminDraft.public_lobby"
              type="checkbox"
              class="size-3.5 shrink-0 accent-emerald-400"
            >
          </label>
        </section>

        <div class="grid grid-cols-3 gap-2">
          <button type="button" class="rounded-md bg-white/[0.04] py-2 text-xs text-white/65 ring-1 ring-white/[0.06] hover:bg-white/[0.08]" @click="nudgeSelectedZone(0, -20)">
            <UIcon name="i-lucide-arrow-up" class="mx-auto size-4" />
          </button>
          <button type="button" class="rounded-md bg-white/[0.04] py-2 text-xs text-white/65 ring-1 ring-white/[0.06] hover:bg-white/[0.08]" @click="nudgeSelectedZone(0, 0, 20, 20)">
            Larger
          </button>
          <button type="button" class="rounded-md bg-white/[0.04] py-2 text-xs text-white/65 ring-1 ring-white/[0.06] hover:bg-white/[0.08]" @click="nudgeSelectedZone(0, 0, -20, -20)">
            Smaller
          </button>
          <button type="button" class="rounded-md bg-white/[0.04] py-2 text-xs text-white/65 ring-1 ring-white/[0.06] hover:bg-white/[0.08]" @click="nudgeSelectedZone(-20, 0)">
            <UIcon name="i-lucide-arrow-left" class="mx-auto size-4" />
          </button>
          <button type="button" class="rounded-md bg-white/[0.04] py-2 text-xs text-white/65 ring-1 ring-white/[0.06] hover:bg-white/[0.08]" @click="nudgeSelectedZone(0, 20)">
            <UIcon name="i-lucide-arrow-down" class="mx-auto size-4" />
          </button>
          <button type="button" class="rounded-md bg-white/[0.04] py-2 text-xs text-white/65 ring-1 ring-white/[0.06] hover:bg-white/[0.08]" @click="nudgeSelectedZone(20, 0)">
            <UIcon name="i-lucide-arrow-right" class="mx-auto size-4" />
          </button>
        </div>

        <div class="flex gap-2">
          <button
            type="button"
            class="h-9 flex-1 rounded-md bg-emerald-400/15 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60"
            :disabled="savingZone || !adminDraftValid"
            @click="saveSelectedZone"
          >
            Save
          </button>
          <button
            type="button"
            class="h-9 rounded-md bg-red-400/10 px-3 text-xs font-semibold text-red-100 ring-1 ring-red-300/15 transition hover:bg-red-400/15 disabled:cursor-wait disabled:opacity-60"
            :disabled="savingZone"
            :class="selectedEditableZone && deleteConfirmZoneId === selectedEditableZone.id ? 'bg-red-400/20 ring-red-200/25' : ''"
            @click="requestDeleteSelectedZone"
          >
            {{ selectedEditableZone && deleteConfirmZoneId === selectedEditableZone.id ? 'Confirm delete' : 'Delete' }}
          </button>
        </div>
        <p
          v-if="selectedEditableZone && deleteConfirmZoneId === selectedEditableZone.id"
          class="rounded-md border border-red-300/10 bg-red-400/10 px-2.5 py-2 text-xs text-red-100/80"
        >
          This removes the room from the live map. Room thread history is preserved.
        </p>
      </div>

      <div
        v-else
        class="p-4 text-xs text-white/40"
      >
        Click a zone on the map, or use search to select one.
      </div>
    </aside>

    <div
      v-if="incomingKnock"
      class="fixed inset-x-3 bottom-3 z-[60] rounded-xl border border-amber-300/15 bg-[#17140f]/95 p-3 shadow-2xl ring-1 ring-amber-300/10 backdrop-blur-xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[360px]"
    >
      <div class="flex items-start gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-100 ring-1 ring-amber-300/15">
          <UIcon name="i-lucide-hand" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-white">
            {{ incomingKnockSender }} is knocking
          </div>
          <p class="mt-1 text-xs text-white/45">
            They are asking to join or get your attention in this room.
          </p>
        </div>
        <button
          type="button"
          class="rounded-md p-1 text-white/35 transition hover:bg-white/[0.06] hover:text-white/80"
          aria-label="Dismiss knock"
          @click="dismissIncomingKnock(incomingKnock.id)"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="h-9 rounded-lg bg-emerald-400/12 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20 transition hover:bg-emerald-400/18"
          @click="acceptIncomingKnock(incomingKnock)"
        >
          Respond
        </button>
        <button
          type="button"
          class="h-9 rounded-lg bg-white/[0.04] text-xs font-semibold text-white/65 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
          @click="dismissIncomingKnock(incomingKnock.id)"
        >
          Dismiss
        </button>
      </div>
    </div>

    <div
      v-else-if="knockResponseNotice"
      class="fixed inset-x-3 bottom-3 z-[60] rounded-xl border border-emerald-300/15 bg-[#0d1713]/95 p-3 shadow-2xl ring-1 ring-emerald-300/10 backdrop-blur-xl sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[360px]"
    >
      <div class="flex items-start gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-100 ring-1 ring-emerald-300/15">
          <UIcon name="i-lucide-hand-heart" class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold text-white">
            {{ knockResponseNotice.sender }} responded
          </div>
          <p class="mt-1 text-xs text-white/45">
            Your knock for {{ knockResponseNotice.targetLabel }} was acknowledged.
          </p>
        </div>
        <button
          type="button"
          class="rounded-md p-1 text-white/35 transition hover:bg-white/[0.06] hover:text-white/80"
          aria-label="Dismiss response"
          @click="dismissKnockResponse"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="h-9 rounded-lg bg-emerald-400/12 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="!knockResponseNotice.zoneId"
          @click="enterKnockResponseZone"
        >
          Enter room
        </button>
        <button
          type="button"
          class="h-9 rounded-lg bg-white/[0.04] text-xs font-semibold text-white/65 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
          @click="dismissKnockResponse"
        >
          Later
        </button>
      </div>
    </div>

    <OfficeRoomPanel
      v-if="!adminMode && selectedTarget?.type === 'room' && selectedZone"
      :office-id="office.id"
      :zone="selectedZone"
      :occupants="selectedOccupants"
      :presence-events="presenceEventsForZone(selectedZone)"
      :is-current-zone="isSelectedCurrentZone"
      :current-user-handle="currentUserHandle"
      :opening-thread="openingThreadForId === selectedTarget.id"
      :knocking="pendingKnockTargetId === selectedTarget.id"
      :can-manage-room="isOfficeAdmin"
      :locking-room="lockingRoomId === selectedZone.id"
      :join-failure-message="selectedJoinFailureMessage"
      :media-session="selectedMediaSession"
      :media-unavailable-message="selectedMediaUnavailableMessage"
      @close="selectedTargetId = null"
      @enter="emit('enterZone', $event)"
      @leave="emit('leaveZone')"
      @copy-link="copySelectedRoomLink"
      @open-thread="openSelectedRoomThread"
      @setup-meeting="setupMeetingForRoom"
      @knock="knockSelectedRoom"
      @cancel-knock="cancelPendingKnock"
      @toggle-lock="toggleSelectedRoomLock"
      @evict="evictSelectedRoomOccupant"
      @open-person="openPersonByHandle"
      @raise-hand="raiseHandSelectedRoom"
      @wave="waveSelectedRoom"
      @notes-changed="emit('zoneNotesChanged', $event)"
    />

    <div
      v-if="!adminMode && selectedTarget?.type === 'person'"
      ref="personPanelEl"
      class="fixed inset-x-3 bottom-3 z-50 max-h-[min(620px,calc(100dvh-2rem))] overflow-y-auto rounded-xl border border-white/[0.08] bg-[#11141a]/95 shadow-2xl backdrop-blur-xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:w-[min(360px,calc(100%-2rem))] sm:max-h-[calc(100dvh-6rem)] lg:right-6 lg:top-24"
      :class="isPersonPanelDragging ? 'select-none ring-1 ring-emerald-300/25' : ''"
      :style="personPanelStyle"
    >
      <div
        ref="personPanelHandleEl"
        class="flex cursor-move items-start gap-3 border-b border-white/[0.06] px-3 py-3 active:cursor-grabbing"
        title="Drag panel"
      >
        <UAvatar
          v-if="selectedTarget.type === 'person'"
          :src="targetAvatarSrc(selectedTarget)"
          :alt="selectedTarget.label"
          size="sm"
          :ui="{ root: 'ring-1 ring-white/15' }"
        />
        <span
          v-else
          class="flex size-8 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]"
        >
          <UIcon name="i-lucide-door-open" class="size-4 text-white/60" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-2">
            <div class="truncate text-sm font-semibold text-white">
              {{ selectedTarget.label }}
            </div>
            <span
              class="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1"
              :class="selectedPersonPresenceClass"
            >
              {{ selectedPersonIsSelf ? 'You' : selectedPersonStatus }}
            </span>
          </div>
          <div class="mt-0.5 truncate text-xs text-white/45">
            {{ selectedTarget.meta }}
          </div>
        </div>
        <UIcon name="i-lucide-grip-horizontal" class="mt-1 hidden size-4 shrink-0 text-white/25 sm:block" />
        <button
          type="button"
          class="rounded-md p-1 text-white/35 transition hover:bg-white/[0.06] hover:text-white/80"
          aria-label="Close selected item"
          @pointerdown.stop
          @click="selectedTargetId = null"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>

      <div class="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
        <button
          type="button"
          class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition sm:h-16"
          :class="canUseSelectedPersonPrimaryAction
            ? selectedPersonIsSelf
              ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15 hover:bg-emerald-400/15'
              : 'bg-white/[0.04] text-white/75 ring-white/[0.06] hover:bg-white/[0.08]'
            : 'cursor-not-allowed bg-white/[0.025] text-white/30 ring-white/[0.04]'"
          :disabled="!canUseSelectedPersonPrimaryAction"
          :title="selectedPersonPrimaryActionTitle"
          @click="handleSelectedPersonPrimaryAction"
        >
          <UIcon :name="selectedPersonPrimaryActionIcon" class="size-4" />
          {{ selectedPersonPrimaryActionLabel }}
        </button>
        <button
          type="button"
          class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition sm:h-16"
          :class="canSendPresenceToSelectedPerson
            ? 'bg-white/[0.04] text-white/75 ring-white/[0.06] hover:bg-white/[0.08]'
            : 'cursor-not-allowed bg-white/[0.025] text-white/30 ring-white/[0.04]'"
          :disabled="!canSendPresenceToSelectedPerson"
          :title="canSendPresenceToSelectedPerson ? 'Send a lightweight wave.' : 'Wave is available when this person is online.'"
          @click="waveTarget(selectedTarget)"
        >
          <UIcon name="i-lucide-hand-heart" class="size-4" />
          Wave
        </button>
        <button
          type="button"
          class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium ring-1 transition sm:h-16"
          :class="canMessageSelectedPerson
            ? 'bg-white/[0.04] text-white/75 ring-white/[0.06] hover:bg-white/[0.08]'
            : 'cursor-not-allowed bg-white/[0.025] text-white/30 ring-white/[0.04]'"
          :disabled="openingMessageForId === selectedTarget.id || !canMessageSelectedPerson"
          :title="canMessageSelectedPerson ? 'Open a direct message.' : 'Direct messages are for other teammates.'"
          @click="messageTarget(selectedTarget)"
        >
          <UIcon
            :name="openingMessageForId === selectedTarget.id ? 'i-lucide-loader-circle' : 'i-lucide-message-circle'"
            class="size-4"
            :class="openingMessageForId === selectedTarget.id ? 'animate-spin' : ''"
          />
          Message
        </button>
        <button
          type="button"
          class="flex h-14 flex-col items-center justify-center gap-1 rounded-lg bg-white/[0.04] text-xs font-medium text-white/75 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] sm:h-16"
          @click="openProfile(selectedTarget)"
        >
          <UIcon name="i-lucide-id-card" class="size-4" />
          Profile
        </button>
      </div>

      <div
        v-if="selectedZone"
        class="border-t border-white/[0.06] px-3 py-2 text-[11px] text-white/45"
      >
        <div class="flex items-center justify-between gap-3 text-white/55">
          <span class="truncate">{{ selectedPersonLocationLabel }}</span>
          <span class="shrink-0">{{ selectedPersonStatus }}</span>
        </div>
        <div class="mt-2 grid grid-cols-3 gap-2">
          <div class="rounded-md bg-white/[0.035] px-2 py-1.5 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/25">
              Shelf
            </div>
            <div class="mt-0.5 truncate text-[11px] font-medium text-white/55">
              Links
            </div>
          </div>
          <div class="rounded-md bg-white/[0.035] px-2 py-1.5 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/25">
              Signal
            </div>
            <div class="mt-0.5 truncate text-[11px] font-medium text-white/55">
              {{ selectedTarget.participant ? 'Online' : 'Offline' }}
            </div>
          </div>
          <div class="rounded-md bg-white/[0.035] px-2 py-1.5 ring-1 ring-white/[0.05]">
            <div class="text-[10px] uppercase tracking-[0.12em] text-white/25">
              Room
            </div>
            <div class="mt-0.5 truncate text-[11px] font-medium text-white/55">
              {{ selectedZone.name }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <section
      v-if="lobbyOccupants.length"
      class="relative z-10 border-t border-white/[0.06] px-3 py-3 sm:px-4"
    >
      <div class="w-full max-w-sm rounded-lg bg-[#15181e]/80 px-3 py-2.5 shadow-[0_18px_55px_-44px_rgba(0,0,0,0.95)] ring-1 ring-white/[0.08] backdrop-blur-xl">
        <div class="mb-2 flex items-center justify-between gap-3">
          <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            Around · {{ lobbyOccupants.length }}
          </div>
          <div class="text-[10px] text-white/30">
            Online now
          </div>
        </div>
        <div class="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          <button
            v-for="p in lobbyOccupants.slice(0, 12)"
            :key="p.handle"
            type="button"
            class="-m-1 shrink-0 rounded-lg p-1 text-left transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            :aria-label="`Open ${p.name}`"
            @click="openPersonByHandle(p.handle)"
          >
            <OfficeAvatar
              :participant="p"
              :size="34"
              show-label
            />
          </button>
          <div
            v-if="lobbyOccupants.length > 12"
            class="flex shrink-0 items-center text-xs text-white/40"
          >
            +{{ lobbyOccupants.length - 12 }}
          </div>
        </div>
      </div>
    </section>

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
