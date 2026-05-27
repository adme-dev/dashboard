<script setup lang="ts">
import type { OfficeLobbyAvailabilityWindow, OfficeLobbyBrandTexture, OfficeLobbyConfig, OfficeLobbyRow, OfficeLobbyShelfItem, OfficeSettingsRow, OfficeZoneRow } from '~~/app/types/office'

type LobbyWithDestination = OfficeLobbyRow & {
  destination_zone_name: string | null
}

type LobbyDraft = {
  destination_zone_id: string | null
  availability_mode: NonNullable<OfficeLobbyConfig['availability_mode']>
  event_duration_minutes: number
  minimum_notice_minutes: number
  daily_cap: number | null
  brand_logo_url: string
  brand_background: string
  brand_texture: OfficeLobbyBrandTexture
  brand_verified: boolean
  shelf_items: OfficeLobbyShelfItem[]
  intake_fields: NonNullable<OfficeLobbyConfig['intake_fields']>
  availability_windows: OfficeLobbyAvailabilityWindow[]
}

type LobbyAnalytics = {
  lobby_id: string
  total_requests: number
  pending_requests: number
  accepted_requests: number
  declined_requests: number
  expired_requests: number
  scheduled_requests: number
  guest_badges: number
  requests_today: number
  daily_cap: number | null
  acceptance_rate: number
  last_request_at: string | null
}

const props = defineProps<{
  officeId: string
  zones: OfficeZoneRow[]
  defaultOpen?: boolean
}>()

const toast = useToast()
const open = ref(props.defaultOpen ?? false)
const saving = ref(false)
const form = reactive({
  handle: '',
  name: '',
  description: '',
  destination_zone_id: null as string | null,
  availability_mode: 'office_presence' as NonNullable<OfficeLobbyConfig['availability_mode']>,
  event_duration_minutes: 30,
  minimum_notice_minutes: 0,
  daily_cap: null as number | null,
  brand_logo_url: '',
  brand_background: '',
  brand_texture: 'dots' as OfficeLobbyBrandTexture,
  brand_verified: false,
  shelf_items: [],
  intake_fields: [],
  availability_windows: []
})
const lobbyDrafts = reactive<Record<string, LobbyDraft>>({})
const expandedEmbedLobbyIds = reactive<Record<string, boolean>>({})

const { data, refresh, pending, error } = useFetch<{ lobbies: LobbyWithDestination[] }>(
  () => `/api/office/${props.officeId}/lobbies`,
  {
    watch: [() => props.officeId],
    default: () => ({ lobbies: [] })
  }
)

const {
  data: analyticsData,
  refresh: refreshAnalytics,
  pending: analyticsPending,
  error: analyticsError
} = useFetch<{ analytics: LobbyAnalytics[] }>(
  () => `/api/office/${props.officeId}/lobbies/analytics`,
  {
    watch: [() => props.officeId],
    default: () => ({ analytics: [] })
  }
)

const { data: settingsData } = useFetch<{ settings: OfficeSettingsRow | null }>(
  () => `/api/office/${props.officeId}/settings`,
  {
    watch: [() => props.officeId],
    default: () => ({ settings: null })
  }
)

const lobbies = computed(() => data.value?.lobbies ?? [])
const analyticsByLobbyId = computed(() =>
  new Map((analyticsData.value?.analytics ?? []).map(row => [row.lobby_id, row]))
)
const analyticsSummary = computed(() => {
  const rows = analyticsData.value?.analytics ?? []
  return rows.reduce(
    (summary, row) => ({
      totalRequests: summary.totalRequests + row.total_requests,
      pendingRequests: summary.pendingRequests + row.pending_requests,
      acceptedRequests: summary.acceptedRequests + row.accepted_requests,
      declinedRequests: summary.declinedRequests + row.declined_requests,
      expiredRequests: summary.expiredRequests + row.expired_requests,
      scheduledRequests: summary.scheduledRequests + row.scheduled_requests,
      guestBadges: summary.guestBadges + row.guest_badges,
      requestsToday: summary.requestsToday + row.requests_today,
      lastRequestAt: !summary.lastRequestAt || (row.last_request_at && row.last_request_at > summary.lastRequestAt)
        ? row.last_request_at
        : summary.lastRequestAt
    }),
    {
      totalRequests: 0,
      pendingRequests: 0,
      acceptedRequests: 0,
      declinedRequests: 0,
      expiredRequests: 0,
      scheduledRequests: 0,
      guestBadges: 0,
      requestsToday: 0,
      lastRequestAt: null as string | null
    }
  )
})
const summaryAcceptanceRate = computed(() =>
  analyticsSummary.value.totalRequests > 0
    ? Math.round((analyticsSummary.value.acceptedRequests / analyticsSummary.value.totalRequests) * 100)
    : 0
)
const settings = computed(() => settingsData.value?.settings ?? null)
const lobbiesAllowed = computed(() =>
  settings.value?.guest_access_enabled !== false && settings.value?.public_lobbies_enabled !== false
)
const publicZones = computed(() => props.zones.filter(zone => zone.zone_type !== 'desk'))
const normalizedHandle = computed(() =>
  form.handle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
)
const createConfigValid = computed(() =>
  form.event_duration_minutes >= 5
  && form.event_duration_minutes <= 240
  && form.minimum_notice_minutes >= 0
  && form.minimum_notice_minutes <= 1440
  && (form.daily_cap === null || (form.daily_cap >= 0 && form.daily_cap <= 200))
  && (!form.brand_background.trim() || isSafeBrandColor(form.brand_background))
)
const canCreateLobby = computed(() =>
  lobbiesAllowed.value
  && normalizedHandle.value.length >= 3
  && Boolean(form.name.trim())
  && createConfigValid.value
)
const availabilityOptions = [
  { value: 'office_presence', label: 'When team is present' },
  { value: 'manual', label: 'Manual approval only' },
  { value: 'scheduled', label: 'Scheduled windows' }
] as const
const textureOptions: Array<{ value: OfficeLobbyBrandTexture, label: string }> = [
  { value: 'dots', label: 'Dots' },
  { value: 'grid', label: 'Grid' },
  { value: 'mesh', label: 'Mesh' },
  { value: 'none', label: 'None' }
]
const intakeTypeOptions: Array<{ value: NonNullable<OfficeLobbyConfig['intake_fields']>[number]['type'], label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'select', label: 'Select' }
]
const weekdayOptions = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
]

function isSafeBrandColor(value: string) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())
}

function normalizeBrandTexture(value?: string | null): OfficeLobbyBrandTexture {
  if (value === 'grid' || value === 'mesh' || value === 'none') return value
  return 'dots'
}

function isLobbyDraftValid(draft: LobbyDraft) {
  return draft.event_duration_minutes >= 5
    && draft.event_duration_minutes <= 240
    && draft.minimum_notice_minutes >= 0
    && draft.minimum_notice_minutes <= 1440
    && (draft.daily_cap === null || (draft.daily_cap >= 0 && draft.daily_cap <= 200))
    && (!draft.brand_background.trim() || isSafeBrandColor(draft.brand_background))
}

function brandConfigFromDraft(draft: {
  brand_logo_url: string
  brand_background: string
  brand_texture: OfficeLobbyBrandTexture
  brand_verified: boolean
}): OfficeLobbyConfig['brand'] | undefined {
  const logo = draft.brand_logo_url.trim()
  const background = draft.brand_background.trim()
  const texture = draft.brand_texture === 'dots' ? '' : draft.brand_texture
  if (!logo && !background && !texture && !draft.brand_verified) return undefined

  return {
    logo_url: logo || undefined,
    background: background || undefined,
    texture: texture || undefined,
    verified: draft.brand_verified || undefined
  }
}

function normalizeShelfItems(items?: OfficeLobbyShelfItem[] | null) {
  return (items ?? [])
    .map(item => ({
      label: item.label?.trim() ?? '',
      value: item.value?.trim() ?? '',
      url: item.url?.trim() || undefined
    }))
    .filter(item => item.label && item.value)
    .slice(0, 6)
}

function normalizeIntakeFields(fields?: OfficeLobbyConfig['intake_fields'] | null) {
  return (fields ?? [])
    .map((field, index) => {
      const label = field.label?.trim() ?? ''
      const fallbackId = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
      return {
        id: (field.id?.trim() || fallbackId || `field_${index + 1}`).slice(0, 80),
        label,
        type: field.type,
        required: Boolean(field.required),
        options: field.type === 'select'
          ? (field.options ?? []).map(option => option.trim()).filter(Boolean).slice(0, 12)
          : undefined
      }
    })
    .filter(field => field.label && ['text', 'email', 'textarea', 'select'].includes(field.type))
    .slice(0, 8)
}

function normalizeAvailabilityWindows(windows?: OfficeLobbyAvailabilityWindow[] | null) {
  return (windows ?? [])
    .map(window => ({
      days: Array.from(new Set((window.days ?? []).filter(day => Number.isInteger(day) && day >= 0 && day <= 6))).slice(0, 7),
      start: /^([01]\d|2[0-3]):[0-5]\d$/.test(window.start) ? window.start : '09:00',
      end: /^([01]\d|2[0-3]):[0-5]\d$/.test(window.end) ? window.end : '17:00',
      timezone: window.timezone?.trim() || undefined
    }))
    .filter(window => window.days.length > 0)
    .slice(0, 14)
}

function emptyAvailabilityWindow(): OfficeLobbyAvailabilityWindow {
  return {
    days: [1, 2, 3, 4, 5],
    start: '09:00',
    end: '17:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  }
}

function draftAvailabilityWindows(draft: LobbyDraft) {
  const windows = [...draft.availability_windows]
  if (!windows.length) windows.push(emptyAvailabilityWindow())
  return windows.slice(0, 14)
}

function updateAvailabilityWindow(
  draft: LobbyDraft,
  index: number,
  key: keyof OfficeLobbyAvailabilityWindow,
  value: string | number[]
) {
  while (draft.availability_windows.length <= index) draft.availability_windows.push(emptyAvailabilityWindow())
  draft.availability_windows[index] = {
    ...draft.availability_windows[index],
    [key]: value
  }
}

function toggleAvailabilityWindowDay(draft: LobbyDraft, index: number, day: number) {
  while (draft.availability_windows.length <= index) draft.availability_windows.push(emptyAvailabilityWindow())
  const current = new Set(draft.availability_windows[index].days)
  if (current.has(day)) current.delete(day)
  else current.add(day)
  updateAvailabilityWindow(draft, index, 'days', Array.from(current).sort((a, b) => a - b))
}

function addAvailabilityWindow(draft: LobbyDraft) {
  if (draft.availability_windows.length >= 14) return
  draft.availability_windows.push(emptyAvailabilityWindow())
}

function removeAvailabilityWindow(draft: LobbyDraft, index: number) {
  draft.availability_windows.splice(index, 1)
}

function emptyIntakeField(): NonNullable<OfficeLobbyConfig['intake_fields']>[number] {
  return { id: '', label: '', type: 'text', required: false, options: [] }
}

function draftIntakeFields(draft: LobbyDraft) {
  const fields = [...draft.intake_fields]
  while (fields.length < 1) fields.push(emptyIntakeField())
  return fields.slice(0, 8)
}

function updateIntakeField(
  draft: LobbyDraft,
  index: number,
  key: keyof NonNullable<OfficeLobbyConfig['intake_fields']>[number],
  value: string | boolean | string[]
) {
  while (draft.intake_fields.length <= index) draft.intake_fields.push(emptyIntakeField())
  draft.intake_fields[index] = {
    ...draft.intake_fields[index],
    [key]: value
  }
}

function updateIntakeFieldOptions(draft: LobbyDraft, index: number, value: string) {
  updateIntakeField(
    draft,
    index,
    'options',
    value.split(',').map(option => option.trim()).filter(Boolean)
  )
}

function addIntakeField(draft: LobbyDraft) {
  if (draft.intake_fields.length >= 8) return
  draft.intake_fields.push(emptyIntakeField())
}

function removeIntakeField(draft: LobbyDraft, index: number) {
  draft.intake_fields.splice(index, 1)
}

function emptyShelfItem(): OfficeLobbyShelfItem {
  return { label: '', value: '', url: '' }
}

function draftShelfItems(draft: LobbyDraft) {
  const items = [...draft.shelf_items]
  while (items.length < 3) items.push(emptyShelfItem())
  return items.slice(0, 6)
}

function updateShelfItem(draft: LobbyDraft, index: number, key: keyof OfficeLobbyShelfItem, value: string) {
  while (draft.shelf_items.length <= index) draft.shelf_items.push(emptyShelfItem())
  draft.shelf_items[index] = {
    ...draft.shelf_items[index],
    [key]: value
  }
}

function addShelfItem(draft: LobbyDraft) {
  if (draft.shelf_items.length >= 6) return
  draft.shelf_items.push(emptyShelfItem())
}

function removeShelfItem(draft: LobbyDraft, index: number) {
  draft.shelf_items.splice(index, 1)
}

function inputValue(event: Event) {
  if (
    event.target instanceof HTMLInputElement
    || event.target instanceof HTMLSelectElement
    || event.target instanceof HTMLTextAreaElement
  ) {
    return event.target.value
  }
  return ''
}

function checkedValue(event: Event) {
  return event.target instanceof HTMLInputElement ? event.target.checked : false
}

function lobbyConfig(lobby: LobbyWithDestination): OfficeLobbyConfig {
  return lobby.config ?? {}
}

function syncLobbyDrafts(list: LobbyWithDestination[]) {
  for (const lobby of list) {
    if (lobbyDrafts[lobby.id]) continue
    const config = lobbyConfig(lobby)
    lobbyDrafts[lobby.id] = {
      destination_zone_id: lobby.destination_zone_id,
      availability_mode: config.availability_mode ?? 'office_presence',
      event_duration_minutes: config.event_duration_minutes ?? 30,
      minimum_notice_minutes: config.minimum_notice_minutes ?? 0,
      daily_cap: config.daily_cap ?? null,
      brand_logo_url: config.brand?.logo_url ?? '',
      brand_background: config.brand?.background ?? '',
      brand_texture: normalizeBrandTexture(config.brand?.texture),
      brand_verified: config.brand?.verified ?? false,
      shelf_items: config.shelf_items?.length ? normalizeShelfItems(config.shelf_items) : [emptyShelfItem(), emptyShelfItem(), emptyShelfItem()],
      intake_fields: config.intake_fields?.length ? normalizeIntakeFields(config.intake_fields) : [emptyIntakeField()],
      availability_windows: config.availability_windows?.length ? normalizeAvailabilityWindows(config.availability_windows) : []
    }
  }
}

function resetForm() {
  form.handle = ''
  form.name = ''
  form.description = ''
  form.destination_zone_id = publicZones.value[0]?.id ?? null
  form.availability_mode = 'office_presence'
  form.event_duration_minutes = 30
  form.minimum_notice_minutes = 0
  form.daily_cap = null
  form.brand_logo_url = ''
  form.brand_background = ''
  form.brand_texture = 'dots'
  form.brand_verified = false
  form.shelf_items = []
  form.intake_fields = []
  form.availability_windows = []
}

function lobbyUrl(lobby: Pick<OfficeLobbyRow, 'handle'>) {
  if (typeof window === 'undefined') return `/l/${lobby.handle}`
  return `${window.location.origin}/l/${lobby.handle}`
}

function escapeHtmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function lobbyEmbedBackground(lobby: LobbyWithDestination) {
  const color = lobby.config?.brand?.background?.trim()
  return color && isSafeBrandColor(color) ? color : '#10b981'
}

function lobbyEmbedTextColor(lobby: LobbyWithDestination) {
  const color = lobbyEmbedBackground(lobby).replace('#', '')
  const normalized = color.length === 3
    ? color.split('').map(part => `${part}${part}`).join('')
    : color.slice(0, 6)
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000
  return luminance > 145 ? '#06100d' : '#ffffff'
}

function lobbyEmbedPreviewStyle(lobby: LobbyWithDestination) {
  return {
    backgroundColor: lobbyEmbedBackground(lobby),
    color: lobbyEmbedTextColor(lobby)
  }
}

function lobbyEmbedSnippet(lobby: LobbyWithDestination) {
  const baseLink = lobbyUrl(lobby)
  const link = `${baseLink}${baseLink.includes('?') ? '&' : '?'}source=embed`
  const label = escapeHtmlAttribute(lobby.name || 'Open lobby')
  const background = escapeHtmlAttribute(lobbyEmbedBackground(lobby))
  const color = escapeHtmlAttribute(lobbyEmbedTextColor(lobby))
  return `<a href="${escapeHtmlAttribute(link)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;border-radius:10px;background:${background};color:${color};padding:10px 14px;font:600 14px/1.2 system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-decoration:none;">${label}</a>`
}

function analyticsCsvUrl() {
  return `/api/office/${props.officeId}/lobbies/analytics?format=csv`
}

function draftLobbyUrl() {
  const handle = normalizedHandle.value || 'handle'
  if (typeof window === 'undefined') return `/l/${handle}`
  return `${window.location.origin}/l/${handle}`
}

function formatLastRequest(timestamp: string | null) {
  if (!timestamp) return 'No requests yet'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp))
}

async function copyLobbyLink(lobby: LobbyWithDestination) {
  const link = lobbyUrl(lobby)
  try {
    await navigator.clipboard.writeText(link)
    toast.add({ title: 'Lobby link copied', description: link, icon: 'i-lucide-link', color: 'success', duration: 1800 })
  } catch {
    toast.add({ title: 'Lobby link', description: link, icon: 'i-lucide-link', color: 'neutral', duration: 5000 })
  }
}

async function copyLobbyEmbed(lobby: LobbyWithDestination) {
  const snippet = lobbyEmbedSnippet(lobby)
  try {
    await navigator.clipboard.writeText(snippet)
    toast.add({ title: 'Embed button copied', description: `/l/${lobby.handle}`, icon: 'i-lucide-code-2', color: 'success', duration: 1800 })
  } catch {
    toast.add({ title: 'Embed snippet', description: snippet, icon: 'i-lucide-code-2', color: 'neutral', duration: 5000 })
  }
}

function toggleLobbyEmbed(lobbyId: string) {
  expandedEmbedLobbyIds[lobbyId] = !expandedEmbedLobbyIds[lobbyId]
}

async function createLobby() {
  if (!normalizedHandle.value || !form.name.trim()) {
    toast.add({ title: 'Handle and name are required', color: 'error' })
    return
  }
  if (normalizedHandle.value.length < 3) {
    toast.add({ title: 'Handle is too short', description: 'Use at least 3 letters or numbers.', color: 'error' })
    return
  }
  if (!createConfigValid.value) {
    toast.add({ title: 'Check lobby rules', description: 'Duration, daily cap, and notice values are outside allowed ranges.', color: 'error' })
    return
  }
  if (!lobbiesAllowed.value) {
    toast.add({ title: 'Public lobbies are disabled', color: 'neutral' })
    return
  }

  saving.value = true
  try {
    const config: OfficeLobbyConfig = {
      destination_zone_id: form.destination_zone_id,
      availability_mode: form.availability_mode,
      event_duration_minutes: form.event_duration_minutes,
      minimum_notice_minutes: form.minimum_notice_minutes,
      daily_cap: form.daily_cap || undefined,
      availability_windows: form.availability_mode === 'scheduled' ? normalizeAvailabilityWindows(form.availability_windows) : undefined,
      brand: brandConfigFromDraft(form),
      shelf_items: normalizeShelfItems(form.shelf_items),
      intake_fields: normalizeIntakeFields(form.intake_fields).length
        ? normalizeIntakeFields(form.intake_fields)
        : [{ id: 'context', label: 'What would you like to discuss?', type: 'textarea' }]
    }
    await $fetch(`/api/office/${props.officeId}/lobbies`, {
      method: 'POST',
      body: {
        handle: normalizedHandle.value,
        name: form.name.trim(),
        description: form.description,
        destination_zone_id: form.destination_zone_id,
        config
      }
    })
    toast.add({ title: 'Lobby created', icon: 'i-lucide-check', color: 'success', duration: 1600 })
    resetForm()
    await refresh()
    await refreshAnalytics()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not create lobby', description: message || 'Try another handle.', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function deactivateLobby(lobby: LobbyWithDestination) {
  saving.value = true
  try {
    await $fetch(`/api/office/${props.officeId}/lobbies/${lobby.id}`, { method: 'DELETE' })
    toast.add({ title: 'Lobby deactivated', icon: 'i-lucide-archive', color: 'success', duration: 1600 })
    await refresh()
    await refreshAnalytics()
  } catch {
    toast.add({ title: 'Could not deactivate lobby', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function saveLobbySettings(lobby: LobbyWithDestination) {
  const draft = lobbyDrafts[lobby.id]
  if (!draft) return
  if (!isLobbyDraftValid(draft)) {
    toast.add({
      title: 'Check lobby rules',
      description: 'Duration, daily cap, notice, or accent color is outside the allowed range.',
      color: 'error'
    })
    return
  }

  saving.value = true
  try {
    const config: OfficeLobbyConfig = {
      ...lobbyConfig(lobby),
      destination_zone_id: draft.destination_zone_id,
      availability_mode: draft.availability_mode,
      event_duration_minutes: draft.event_duration_minutes,
      minimum_notice_minutes: draft.minimum_notice_minutes,
      daily_cap: draft.daily_cap || undefined,
      availability_windows: draft.availability_mode === 'scheduled' ? normalizeAvailabilityWindows(draft.availability_windows) : undefined,
      brand: brandConfigFromDraft(draft),
      shelf_items: normalizeShelfItems(draft.shelf_items),
      intake_fields: normalizeIntakeFields(draft.intake_fields)
    }
    await $fetch(`/api/office/${props.officeId}/lobbies/${lobby.id}`, {
      method: 'PATCH',
      body: {
        destination_zone_id: draft.destination_zone_id,
        config
      }
    })
    toast.add({ title: 'Lobby settings saved', icon: 'i-lucide-save', color: 'success', duration: 1600 })
    await refresh()
    await refreshAnalytics()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not save lobby', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    saving.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen && !form.destination_zone_id) resetForm()
})

watch(lobbies, syncLobbyDrafts, { immediate: true })
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
          <UIcon name="i-lucide-door-open" class="size-3.5 text-emerald-300" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold">Lobby links</span>
          <span class="block truncate text-xs text-white/40">{{ lobbies.length }} active handles for guests and external meetings</span>
        </span>
      </span>
      <span class="flex items-center gap-2">
        <a
          v-if="open"
          :href="analyticsCsvUrl()"
          class="hidden rounded-md bg-white/[0.04] px-2 py-1 text-xs font-medium text-white/55 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08] hover:text-white sm:inline-flex"
          @click.stop
        >
          Export
        </a>
        <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 text-white/45" />
      </span>
    </button>

    <div
      v-if="open"
      class="grid gap-3 border-t border-white/[0.06] p-3 lg:grid-cols-[minmax(0,1fr)_360px]"
    >
      <div class="space-y-2">
        <div
          v-if="!lobbiesAllowed"
          class="rounded-lg bg-amber-300/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-200/15"
        >
          Public lobby access is disabled in office controls.
        </div>
        <div
          v-if="analyticsError"
          class="rounded-lg bg-amber-300/10 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-200/15"
        >
          <div class="flex items-center justify-between gap-3">
            <span class="min-w-0">Lobby analytics could not be loaded.</span>
            <button
              type="button"
              class="rounded-md bg-white/[0.06] px-2 py-1 font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
              @click="refreshAnalytics"
            >
              Retry
            </button>
          </div>
        </div>
        <div class="relative grid grid-cols-5 gap-2 rounded-lg bg-black/20 p-2 ring-1 ring-white/[0.05]">
          <div
            v-if="analyticsPending"
            class="absolute inset-0 z-10 grid place-items-center rounded-lg bg-black/45 backdrop-blur-sm"
          >
            <XfLoader size="sm" />
          </div>
          <div>
            <div class="text-sm font-semibold text-white/85">
              {{ analyticsSummary.totalRequests }}
            </div>
            <div class="text-[10px] uppercase tracking-wide text-white/30">
              Requests
            </div>
          </div>
          <div>
            <div class="text-sm font-semibold text-emerald-100">
              {{ analyticsSummary.acceptedRequests }}
            </div>
            <div class="text-[10px] uppercase tracking-wide text-white/30">
              Accepted
            </div>
          </div>
          <div>
            <div class="text-sm font-semibold text-sky-100">
              {{ analyticsSummary.requestsToday }}
            </div>
            <div class="text-[10px] uppercase tracking-wide text-white/30">
              Today
            </div>
          </div>
          <div>
            <div
              class="text-sm font-semibold"
              :class="analyticsSummary.pendingRequests > 0 ? 'text-amber-100' : 'text-white/70'"
            >
              {{ analyticsSummary.pendingRequests }}
            </div>
            <div class="text-[10px] uppercase tracking-wide text-white/30">
              Pending
            </div>
          </div>
          <div>
            <div class="truncate text-sm font-semibold text-white/70">
              {{ summaryAcceptanceRate }}%
            </div>
            <div class="text-[10px] uppercase tracking-wide text-white/30">
              Accepted
            </div>
          </div>
        </div>
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
                Could not load lobby links
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
          v-else-if="!lobbies.length"
          class="rounded-lg bg-white/[0.035] px-3 py-3 text-sm text-white/45 ring-1 ring-white/[0.05]"
        >
          No lobby handles yet.
        </div>
        <div
          v-for="lobby in lobbies"
          :key="lobby.id"
          class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]"
        >
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium">{{ lobby.name }}</span>
                <span class="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/45">/l/{{ lobby.handle }}</span>
              </div>
              <div class="mt-0.5 truncate text-xs text-white/40">
                {{ lobby.destination_zone_name || 'Default room' }} · {{ lobby.description || 'Drop-in lobby' }}
              </div>
            </div>
            <button
              type="button"
              class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
              @click="copyLobbyLink(lobby)"
            >
              Copy
            </button>
            <button
              type="button"
              class="rounded-md bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
              @click="toggleLobbyEmbed(lobby.id)"
            >
              Embed
            </button>
            <button
              type="button"
              class="rounded-md bg-red-400/10 px-2.5 py-1.5 text-xs font-medium text-red-100 ring-1 ring-red-300/15 transition hover:bg-red-400/15"
              :disabled="saving"
              @click="deactivateLobby(lobby)"
            >
              Archive
            </button>
          </div>

          <div
            v-if="expandedEmbedLobbyIds[lobby.id]"
            class="mt-3 rounded-lg bg-black/20 p-3 ring-1 ring-white/[0.05]"
          >
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div class="text-xs font-semibold text-white/75">
                  Embed button
                </div>
                <div class="text-[11px] text-white/35">
                  Paste this HTML into an external website to open this lobby.
                </div>
              </div>
              <button
                type="button"
                class="rounded-md bg-white/[0.05] px-2.5 py-1.5 text-[11px] font-semibold text-white/70 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
                @click="copyLobbyEmbed(lobby)"
              >
                Copy code
              </button>
            </div>
            <a
              :href="lobbyUrl(lobby)"
              target="_blank"
              rel="noopener"
              class="mb-2 inline-flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-sm font-semibold no-underline"
              :style="lobbyEmbedPreviewStyle(lobby)"
            >
              <UIcon name="i-lucide-door-open" class="size-4" />
              {{ lobby.name || 'Open lobby' }}
            </a>
            <pre class="max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md bg-[#080a0d] p-2 text-[11px] leading-5 text-white/55 ring-1 ring-white/[0.04]">{{ lobbyEmbedSnippet(lobby) }}</pre>
          </div>

          <div
            v-if="lobbyDrafts[lobby.id]"
            class="mt-3 space-y-2"
          >
            <div class="grid gap-2 md:grid-cols-6">
              <select
                v-model="lobbyDrafts[lobby.id].destination_zone_id"
                class="h-8 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-[11px] text-white outline-none focus:border-white/25"
              >
                <option :value="null">
                  Default room
                </option>
                <option
                  v-for="zone in publicZones"
                  :key="zone.id"
                  :value="zone.id"
                >
                  {{ zone.name }}
                </option>
              </select>
              <select
                v-model="lobbyDrafts[lobby.id].availability_mode"
                class="h-8 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-[11px] text-white outline-none focus:border-white/25"
              >
                <option
                  v-for="option in availabilityOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <input
                v-model.number="lobbyDrafts[lobby.id].event_duration_minutes"
                type="number"
                min="5"
                max="240"
                class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none focus:border-white/25"
                aria-label="Event duration minutes"
              >
              <input
                v-model.number="lobbyDrafts[lobby.id].daily_cap"
                type="number"
                min="0"
                max="200"
                placeholder="Daily cap"
                class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                aria-label="Daily cap"
              >
              <input
                v-model.number="lobbyDrafts[lobby.id].minimum_notice_minutes"
                type="number"
                min="0"
                max="1440"
                placeholder="Notice"
                class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                aria-label="Minimum notice minutes"
              >
              <button
                type="button"
                class="h-8 rounded-md bg-emerald-400/10 px-2 text-[11px] font-semibold text-emerald-100 ring-1 ring-emerald-300/15 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                :disabled="saving || !isLobbyDraftValid(lobbyDrafts[lobby.id])"
                @click="saveLobbySettings(lobby)"
              >
                Save
              </button>
            </div>

            <div
              v-if="lobbyDrafts[lobby.id].availability_mode === 'scheduled'"
              class="rounded-lg bg-black/15 p-2 ring-1 ring-white/[0.04]"
            >
              <div class="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div class="text-[11px] font-semibold text-white/65">
                    Weekly availability
                  </div>
                  <div class="text-[10px] text-white/30">
                    Guests can only request times inside these windows.
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/50 ring-1 ring-white/[0.05] transition hover:bg-white/[0.08] hover:text-white/75 disabled:opacity-40"
                  :disabled="lobbyDrafts[lobby.id].availability_windows.length >= 14"
                  @click="addAvailabilityWindow(lobbyDrafts[lobby.id])"
                >
                  Add
                </button>
              </div>
              <div class="space-y-2">
                <div
                  v-for="(_, index) in draftAvailabilityWindows(lobbyDrafts[lobby.id])"
                  :key="`${lobby.id}-availability-${index}`"
                  class="grid gap-2 rounded-md bg-white/[0.025] p-2 ring-1 ring-white/[0.04] md:grid-cols-[minmax(0,1fr)_80px_80px_minmax(0,120px)_28px]"
                >
                  <div class="flex min-w-0 flex-wrap gap-1">
                    <button
                      v-for="day in weekdayOptions"
                      :key="day.value"
                      type="button"
                      class="h-7 rounded-md px-2 text-[10px] font-semibold ring-1 transition"
                      :class="lobbyDrafts[lobby.id].availability_windows[index]?.days.includes(day.value)
                        ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
                        : 'bg-white/[0.04] text-white/35 ring-white/[0.05] hover:text-white/60'"
                      @click="toggleAvailabilityWindowDay(lobbyDrafts[lobby.id], index, day.value)"
                    >
                      {{ day.label }}
                    </button>
                  </div>
                  <input
                    :value="lobbyDrafts[lobby.id].availability_windows[index]?.start ?? '09:00'"
                    type="time"
                    class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none focus:border-white/25"
                    :aria-label="`Availability window ${index + 1} start`"
                    @input="updateAvailabilityWindow(lobbyDrafts[lobby.id], index, 'start', inputValue($event))"
                  >
                  <input
                    :value="lobbyDrafts[lobby.id].availability_windows[index]?.end ?? '17:00'"
                    type="time"
                    class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none focus:border-white/25"
                    :aria-label="`Availability window ${index + 1} end`"
                    @input="updateAvailabilityWindow(lobbyDrafts[lobby.id], index, 'end', inputValue($event))"
                  >
                  <input
                    :value="lobbyDrafts[lobby.id].availability_windows[index]?.timezone ?? ''"
                    placeholder="Timezone"
                    class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    :aria-label="`Availability window ${index + 1} timezone`"
                    @input="updateAvailabilityWindow(lobbyDrafts[lobby.id], index, 'timezone', inputValue($event))"
                  >
                  <button
                    type="button"
                    class="flex h-8 items-center justify-center rounded-md bg-white/[0.04] text-white/35 ring-1 ring-white/[0.05] transition hover:bg-red-400/10 hover:text-red-100"
                    :aria-label="`Remove availability window ${index + 1}`"
                    @click="removeAvailabilityWindow(lobbyDrafts[lobby.id], index)"
                  >
                    <UIcon name="i-lucide-x" class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_120px_120px_94px]">
              <input
                v-model="lobbyDrafts[lobby.id].brand_logo_url"
                type="url"
                placeholder="Logo URL"
                class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                aria-label="Lobby logo URL"
              >
              <input
                v-model="lobbyDrafts[lobby.id].brand_background"
                placeholder="#10b981"
                class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                aria-label="Lobby accent color"
              >
              <select
                v-model="lobbyDrafts[lobby.id].brand_texture"
                class="h-8 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-[11px] text-white outline-none focus:border-white/25"
                aria-label="Lobby texture label"
              >
                <option
                  v-for="option in textureOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <label class="flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/60">
                <input v-model="lobbyDrafts[lobby.id].brand_verified" type="checkbox" class="size-3 accent-emerald-400">
                Verified
              </label>
            </div>

            <div class="rounded-lg bg-black/15 p-2 ring-1 ring-white/[0.04]">
              <div class="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div class="text-[11px] font-semibold text-white/65">
                    Waiting-room shelf
                  </div>
                  <div class="text-[10px] text-white/30">
                    Trust cues, product links, or awards shown to guests.
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/50 ring-1 ring-white/[0.05] transition hover:bg-white/[0.08] hover:text-white/75 disabled:opacity-40"
                  :disabled="lobbyDrafts[lobby.id].shelf_items.length >= 6"
                  @click="addShelfItem(lobbyDrafts[lobby.id])"
                >
                  Add
                </button>
              </div>
              <div class="space-y-2">
                <div
                  v-for="(_, index) in draftShelfItems(lobbyDrafts[lobby.id])"
                  :key="`${lobby.id}-shelf-${index}`"
                  class="grid gap-2 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_28px]"
                >
                  <input
                    :value="lobbyDrafts[lobby.id].shelf_items[index]?.label ?? ''"
                    placeholder="Label"
                    class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    :aria-label="`Shelf item ${index + 1} label`"
                    @input="updateShelfItem(lobbyDrafts[lobby.id], index, 'label', inputValue($event))"
                  >
                  <input
                    :value="lobbyDrafts[lobby.id].shelf_items[index]?.value ?? ''"
                    placeholder="Value"
                    class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    :aria-label="`Shelf item ${index + 1} value`"
                    @input="updateShelfItem(lobbyDrafts[lobby.id], index, 'value', inputValue($event))"
                  >
                  <input
                    :value="lobbyDrafts[lobby.id].shelf_items[index]?.url ?? ''"
                    type="url"
                    placeholder="Optional link"
                    class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    :aria-label="`Shelf item ${index + 1} link`"
                    @input="updateShelfItem(lobbyDrafts[lobby.id], index, 'url', inputValue($event))"
                  >
                  <button
                    type="button"
                    class="flex h-8 items-center justify-center rounded-md bg-white/[0.04] text-white/35 ring-1 ring-white/[0.05] transition hover:bg-red-400/10 hover:text-red-100"
                    :aria-label="`Remove shelf item ${index + 1}`"
                    @click="removeShelfItem(lobbyDrafts[lobby.id], index)"
                  >
                    <UIcon name="i-lucide-x" class="size-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <div class="rounded-lg bg-black/15 p-2 ring-1 ring-white/[0.04]">
              <div class="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div class="text-[11px] font-semibold text-white/65">
                    Guest intake fields
                  </div>
                  <div class="text-[10px] text-white/30">
                    Questions shown before a guest requests entry.
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/50 ring-1 ring-white/[0.05] transition hover:bg-white/[0.08] hover:text-white/75 disabled:opacity-40"
                  :disabled="lobbyDrafts[lobby.id].intake_fields.length >= 8"
                  @click="addIntakeField(lobbyDrafts[lobby.id])"
                >
                  Add
                </button>
              </div>
              <div class="space-y-2">
                <div
                  v-for="(_, index) in draftIntakeFields(lobbyDrafts[lobby.id])"
                  :key="`${lobby.id}-intake-${index}`"
                  class="grid gap-2 rounded-md bg-white/[0.025] p-2 ring-1 ring-white/[0.04] md:grid-cols-[minmax(0,1fr)_112px_74px_28px]"
                >
                  <input
                    :value="lobbyDrafts[lobby.id].intake_fields[index]?.label ?? ''"
                    placeholder="Question label"
                    class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                    :aria-label="`Intake field ${index + 1} label`"
                    @input="updateIntakeField(lobbyDrafts[lobby.id], index, 'label', inputValue($event))"
                  >
                  <select
                    :value="lobbyDrafts[lobby.id].intake_fields[index]?.type ?? 'text'"
                    class="h-8 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-[11px] text-white outline-none focus:border-white/25"
                    :aria-label="`Intake field ${index + 1} type`"
                    @change="updateIntakeField(lobbyDrafts[lobby.id], index, 'type', inputValue($event))"
                  >
                    <option
                      v-for="option in intakeTypeOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <label class="flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/60">
                    <input
                      :checked="lobbyDrafts[lobby.id].intake_fields[index]?.required ?? false"
                      type="checkbox"
                      class="size-3 accent-emerald-400"
                      @change="updateIntakeField(lobbyDrafts[lobby.id], index, 'required', checkedValue($event))"
                    >
                    Req
                  </label>
                  <button
                    type="button"
                    class="flex h-8 items-center justify-center rounded-md bg-white/[0.04] text-white/35 ring-1 ring-white/[0.05] transition hover:bg-red-400/10 hover:text-red-100"
                    :aria-label="`Remove intake field ${index + 1}`"
                    @click="removeIntakeField(lobbyDrafts[lobby.id], index)"
                  >
                    <UIcon name="i-lucide-x" class="size-3.5" />
                  </button>
                  <input
                    v-if="(lobbyDrafts[lobby.id].intake_fields[index]?.type ?? 'text') === 'select'"
                    :value="(lobbyDrafts[lobby.id].intake_fields[index]?.options ?? []).join(', ')"
                    placeholder="Options, comma separated"
                    class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25 md:col-span-4"
                    :aria-label="`Intake field ${index + 1} options`"
                    @input="updateIntakeFieldOptions(lobbyDrafts[lobby.id], index, inputValue($event))"
                  >
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="analyticsByLobbyId.get(lobby.id)"
            class="mt-3 grid grid-cols-5 gap-2 rounded-md bg-black/15 p-2 text-center ring-1 ring-white/[0.04]"
          >
            <div>
              <div class="text-sm font-semibold text-white/85">
                {{ analyticsByLobbyId.get(lobby.id)?.total_requests ?? 0 }}
              </div>
              <div class="text-[10px] uppercase tracking-wide text-white/30">
                Requests
              </div>
            </div>
            <div>
              <div class="text-sm font-semibold text-emerald-100">
                {{ analyticsByLobbyId.get(lobby.id)?.accepted_requests ?? 0 }}
              </div>
              <div class="text-[10px] uppercase tracking-wide text-white/30">
                Accepted
              </div>
            </div>
            <div>
              <div class="text-sm font-semibold text-sky-100">
                {{ analyticsByLobbyId.get(lobby.id)?.scheduled_requests ?? 0 }}
              </div>
              <div class="text-[10px] uppercase tracking-wide text-white/30">
                Scheduled
              </div>
            </div>
            <div>
              <div class="text-sm font-semibold text-violet-100">
                {{ analyticsByLobbyId.get(lobby.id)?.guest_badges ?? 0 }}
              </div>
              <div class="text-[10px] uppercase tracking-wide text-white/30">
                Badges
              </div>
            </div>
            <div>
              <div
                class="text-sm font-semibold"
                :class="(analyticsByLobbyId.get(lobby.id)?.pending_requests ?? 0) > 0 ? 'text-amber-100' : 'text-white/65'"
              >
                {{ analyticsByLobbyId.get(lobby.id)?.acceptance_rate ?? 0 }}%
              </div>
              <div class="text-[10px] uppercase tracking-wide text-white/30">
                Rate
              </div>
            </div>
          </div>
          <div
            v-if="analyticsByLobbyId.get(lobby.id)?.last_request_at || analyticsByLobbyId.get(lobby.id)?.pending_requests"
            class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/35"
          >
            <span
              v-if="analyticsByLobbyId.get(lobby.id)?.last_request_at"
              class="inline-flex items-center gap-1.5"
            >
              <UIcon name="i-lucide-clock" class="size-3 text-white/25" />
              <span>Last request {{ formatLastRequest(analyticsByLobbyId.get(lobby.id)?.last_request_at ?? null) }}</span>
            </span>
            <span
              v-if="analyticsByLobbyId.get(lobby.id)?.pending_requests"
              class="rounded-md bg-amber-300/10 px-1.5 py-0.5 text-amber-100 ring-1 ring-amber-200/15"
            >
              {{ analyticsByLobbyId.get(lobby.id)?.pending_requests }} waiting
            </span>
            <span
              v-if="analyticsByLobbyId.get(lobby.id)?.daily_cap"
              class="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-white/45 ring-1 ring-white/[0.05]"
            >
              Today {{ analyticsByLobbyId.get(lobby.id)?.requests_today ?? 0 }}/{{ analyticsByLobbyId.get(lobby.id)?.daily_cap }}
            </span>
          </div>
        </div>
      </div>

      <form class="space-y-2" @submit.prevent="createLobby">
        <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
          <div class="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/30">
            New lobby URL
          </div>
          <div class="mt-1 truncate text-xs font-medium text-white/70">
            {{ draftLobbyUrl() }}
          </div>
          <div
            v-if="normalizedHandle && normalizedHandle !== form.handle"
            class="mt-1 text-[11px] text-white/35"
          >
            Handle will be saved as <span class="font-medium text-white/55">/{{ normalizedHandle }}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <input
            v-model="form.handle"
            placeholder="sales"
            class="h-9 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
          <input
            v-model="form.name"
            placeholder="Sales Lobby"
            class="h-9 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
        </div>
        <p
          v-if="form.handle && normalizedHandle.length < 3"
          class="rounded-md bg-red-400/10 px-2 py-1.5 text-[11px] text-red-100 ring-1 ring-red-300/15"
        >
          Lobby handles need at least 3 letters or numbers.
        </p>
        <select
          v-model="form.destination_zone_id"
          class="h-9 w-full rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
        >
          <option :value="null">
            Default room
          </option>
          <option
            v-for="zone in publicZones"
            :key="zone.id"
            :value="zone.id"
          >
            {{ zone.name }}
          </option>
        </select>
        <textarea
          v-model="form.description"
          rows="2"
          placeholder="Short description for guests"
          class="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
        />
        <div class="grid grid-cols-4 gap-2">
          <select
            v-model="form.availability_mode"
            class="h-9 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
          >
            <option
              v-for="option in availabilityOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <input
            v-model.number="form.event_duration_minutes"
            type="number"
            min="5"
            max="240"
            placeholder="Duration"
            class="h-9 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
          <input
            v-model.number="form.daily_cap"
            type="number"
            min="0"
            max="200"
            placeholder="Daily cap"
            class="h-9 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
          <input
            v-model.number="form.minimum_notice_minutes"
            type="number"
            min="0"
            max="1440"
            placeholder="Notice"
            class="h-9 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
        </div>
        <div
          v-if="form.availability_mode === 'scheduled'"
          class="rounded-lg bg-white/[0.035] p-2 ring-1 ring-white/[0.05]"
        >
          <div class="mb-2 flex items-center justify-between gap-2">
            <div>
              <div class="text-[11px] font-semibold text-white/65">
                Weekly availability
              </div>
              <div class="text-[10px] text-white/30">
                Limit guest requests to these times.
              </div>
            </div>
            <button
              type="button"
              class="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/50 ring-1 ring-white/[0.05] transition hover:bg-white/[0.08] hover:text-white/75 disabled:opacity-40"
              :disabled="form.availability_windows.length >= 14"
              @click="addAvailabilityWindow(form)"
            >
              Add
            </button>
          </div>
          <div class="space-y-2">
            <div
              v-for="(_, index) in draftAvailabilityWindows(form)"
              :key="`new-lobby-availability-${index}`"
              class="grid gap-2 rounded-md bg-black/15 p-2 ring-1 ring-white/[0.04]"
            >
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="day in weekdayOptions"
                  :key="day.value"
                  type="button"
                  class="h-7 rounded-md px-2 text-[10px] font-semibold ring-1 transition"
                  :class="form.availability_windows[index]?.days.includes(day.value)
                    ? 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
                    : 'bg-white/[0.04] text-white/35 ring-white/[0.05] hover:text-white/60'"
                  @click="toggleAvailabilityWindowDay(form, index, day.value)"
                >
                  {{ day.label }}
                </button>
              </div>
              <div class="grid grid-cols-[1fr_1fr] gap-2">
                <input
                  :value="form.availability_windows[index]?.start ?? '09:00'"
                  type="time"
                  class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none focus:border-white/25"
                  :aria-label="`New lobby availability window ${index + 1} start`"
                  @input="updateAvailabilityWindow(form, index, 'start', inputValue($event))"
                >
                <input
                  :value="form.availability_windows[index]?.end ?? '17:00'"
                  type="time"
                  class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none focus:border-white/25"
                  :aria-label="`New lobby availability window ${index + 1} end`"
                  @input="updateAvailabilityWindow(form, index, 'end', inputValue($event))"
                >
              </div>
              <div class="grid grid-cols-[minmax(0,1fr)_28px] gap-2">
                <input
                  :value="form.availability_windows[index]?.timezone ?? ''"
                  placeholder="Timezone"
                  class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                  :aria-label="`New lobby availability window ${index + 1} timezone`"
                  @input="updateAvailabilityWindow(form, index, 'timezone', inputValue($event))"
                >
                <button
                  type="button"
                  class="flex h-8 items-center justify-center rounded-md bg-white/[0.04] text-white/35 ring-1 ring-white/[0.05] transition hover:bg-red-400/10 hover:text-red-100"
                  :aria-label="`Remove new lobby availability window ${index + 1}`"
                  @click="removeAvailabilityWindow(form, index)"
                >
                  <UIcon name="i-lucide-x" class="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <input
            v-model="form.brand_logo_url"
            type="url"
            placeholder="Logo URL"
            class="h-9 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
          <input
            v-model="form.brand_background"
            placeholder="#10b981"
            class="h-9 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none placeholder:text-white/30 focus:border-white/25"
          >
        </div>
        <div class="grid grid-cols-[minmax(0,1fr)_112px] gap-2">
          <select
            v-model="form.brand_texture"
            class="h-9 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-xs text-white outline-none focus:border-white/25"
          >
            <option
              v-for="option in textureOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <label class="flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white/60">
            <input v-model="form.brand_verified" type="checkbox" class="size-3 accent-emerald-400">
            Verified
          </label>
        </div>
        <div class="rounded-lg bg-white/[0.035] p-2 ring-1 ring-white/[0.05]">
          <div class="mb-2 flex items-center justify-between gap-2">
            <div>
              <div class="text-[11px] font-semibold text-white/65">
                Guest intake
              </div>
              <div class="text-[10px] text-white/30">
                Optional questions shown on the public lobby form.
              </div>
            </div>
            <button
              type="button"
              class="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/50 ring-1 ring-white/[0.05] transition hover:bg-white/[0.08] hover:text-white/75 disabled:opacity-40"
              :disabled="form.intake_fields.length >= 8"
              @click="addIntakeField(form)"
            >
              Add
            </button>
          </div>
          <div class="space-y-2">
            <div
              v-for="(_, index) in draftIntakeFields(form)"
              :key="`new-lobby-intake-${index}`"
              class="grid gap-2 rounded-md bg-black/15 p-2 ring-1 ring-white/[0.04]"
            >
              <input
                :value="form.intake_fields[index]?.label ?? ''"
                placeholder="Question label"
                class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                :aria-label="`New lobby intake field ${index + 1} label`"
                @input="updateIntakeField(form, index, 'label', inputValue($event))"
              >
              <div class="grid grid-cols-[minmax(0,1fr)_74px_28px] gap-2">
                <select
                  :value="form.intake_fields[index]?.type ?? 'text'"
                  class="h-8 rounded-md border border-white/[0.08] bg-[#171a20] px-2 text-[11px] text-white outline-none focus:border-white/25"
                  :aria-label="`New lobby intake field ${index + 1} type`"
                  @change="updateIntakeField(form, index, 'type', inputValue($event))"
                >
                  <option
                    v-for="option in intakeTypeOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <label class="flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white/60">
                  <input
                    :checked="form.intake_fields[index]?.required ?? false"
                    type="checkbox"
                    class="size-3 accent-emerald-400"
                    @change="updateIntakeField(form, index, 'required', checkedValue($event))"
                  >
                  Req
                </label>
                <button
                  type="button"
                  class="flex h-8 items-center justify-center rounded-md bg-white/[0.04] text-white/35 ring-1 ring-white/[0.05] transition hover:bg-red-400/10 hover:text-red-100"
                  :aria-label="`Remove new lobby intake field ${index + 1}`"
                  @click="removeIntakeField(form, index)"
                >
                  <UIcon name="i-lucide-x" class="size-3.5" />
                </button>
              </div>
              <input
                v-if="(form.intake_fields[index]?.type ?? 'text') === 'select'"
                :value="(form.intake_fields[index]?.options ?? []).join(', ')"
                placeholder="Options, comma separated"
                class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                :aria-label="`New lobby intake field ${index + 1} options`"
                @input="updateIntakeFieldOptions(form, index, inputValue($event))"
              >
            </div>
          </div>
        </div>
        <div class="rounded-lg bg-white/[0.035] p-2 ring-1 ring-white/[0.05]">
          <div class="mb-2 flex items-center justify-between gap-2">
            <div>
              <div class="text-[11px] font-semibold text-white/65">
                Waiting-room shelf
              </div>
              <div class="text-[10px] text-white/30">
                Optional guest-facing trust cues or resource links.
              </div>
            </div>
            <button
              type="button"
              class="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-white/50 ring-1 ring-white/[0.05] transition hover:bg-white/[0.08] hover:text-white/75 disabled:opacity-40"
              :disabled="form.shelf_items.length >= 6"
              @click="addShelfItem(form)"
            >
              Add
            </button>
          </div>
          <div class="space-y-2">
            <div
              v-for="(_, index) in draftShelfItems(form)"
              :key="`new-lobby-shelf-${index}`"
              class="grid gap-2 rounded-md bg-black/15 p-2 ring-1 ring-white/[0.04]"
            >
              <div class="grid grid-cols-[112px_minmax(0,1fr)_28px] gap-2">
                <input
                  :value="form.shelf_items[index]?.label ?? ''"
                  placeholder="Label"
                  class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                  :aria-label="`New lobby shelf item ${index + 1} label`"
                  @input="updateShelfItem(form, index, 'label', inputValue($event))"
                >
                <input
                  :value="form.shelf_items[index]?.value ?? ''"
                  placeholder="Value"
                  class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                  :aria-label="`New lobby shelf item ${index + 1} value`"
                  @input="updateShelfItem(form, index, 'value', inputValue($event))"
                >
                <button
                  type="button"
                  class="flex h-8 items-center justify-center rounded-md bg-white/[0.04] text-white/35 ring-1 ring-white/[0.05] transition hover:bg-red-400/10 hover:text-red-100"
                  :aria-label="`Remove new lobby shelf item ${index + 1}`"
                  @click="removeShelfItem(form, index)"
                >
                  <UIcon name="i-lucide-x" class="size-3.5" />
                </button>
              </div>
              <input
                :value="form.shelf_items[index]?.url ?? ''"
                type="url"
                placeholder="Optional link"
                class="h-8 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] text-white outline-none placeholder:text-white/30 focus:border-white/25"
                :aria-label="`New lobby shelf item ${index + 1} link`"
                @input="updateShelfItem(form, index, 'url', inputValue($event))"
              >
            </div>
          </div>
        </div>
        <button
          type="submit"
          class="h-9 w-full rounded-md bg-emerald-400/15 text-xs font-semibold text-emerald-100 ring-1 ring-emerald-300/20 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60"
          :disabled="saving || !canCreateLobby"
        >
          Create lobby
        </button>
        <p
          v-if="!createConfigValid"
          class="rounded-md bg-red-400/10 px-2 py-1.5 text-[11px] text-red-100 ring-1 ring-red-300/15"
        >
          Duration must be 5-240 minutes, notice 0-1440 minutes, daily cap 0-200, and accent color must be a hex color.
        </p>
      </form>
    </div>
  </section>
</template>
