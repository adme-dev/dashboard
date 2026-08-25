<script setup lang="ts">
import type { CalendarDate } from '@internationalized/date'
import { getLocalTimeZone, today } from '@internationalized/date'
import { formatTimeAgo } from '@vueuse/core'
import { format } from 'date-fns'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'

definePageMeta({ layout: 'agency' })

const route = useRoute()
const api = useQrCodes()
const toast = useToast()
const id = route.params.id as string

const { data, refresh, error } = await useFetch(`/api/agency/qr-codes/${id}`)
useHead({ title: () => data.value?.code?.name ?? 'QR code' })

// shallowRef avoids Vue deep-reactivating the CalendarDate class instances (which strips their
// prototype/type identity and breaks TS narrowing against @internationalized/date's CalendarDate).
const tz = getLocalTimeZone()
const range = shallowRef({ start: today(tz).subtract({ days: 29 }), end: today(tz) })
const rangeOpen = ref(false)
const iso = (d: CalendarDate) => d.toString()
const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 }
]
function applyPreset(days: number) {
  range.value = { start: today(tz).subtract({ days: days - 1 }), end: today(tz) }
  rangeOpen.value = false
}
const activePreset = computed(() => {
  const end = today(tz)
  if (range.value.end.compare(end) !== 0) return null
  return PRESETS.find(p => range.value.start.compare(end.subtract({ days: p.days - 1 })) === 0)?.days ?? null
})
const rangeLabel = computed(() => {
  if (activePreset.value) return `Last ${activePreset.value} days`
  const f = (d: CalendarDate) => format(d.toDate(tz), 'd MMM')
  return `${f(range.value.start)} – ${f(range.value.end)}`
})
const { data: analytics, status: analyticsStatus } = await useFetch(`/api/agency/qr-codes/${id}/analytics`, {
  query: computed(() => ({ from: iso(range.value.start), to: iso(range.value.end) }))
})

const editingUrl = ref(false)
const urlDraft = ref('')
const urlError = computed(() => {
  if (!urlDraft.value) return ''
  const d = validateDestinationUrl(urlDraft.value)
  if (isDestinationInvalid(d)) return d.reason
  return ''
})
function startEdit() {
  urlDraft.value = data.value?.code?.destination_url ?? ''
  editingUrl.value = true
}
async function saveUrl() {
  if (urlError.value || !urlDraft.value) return
  if (urlDraft.value === data.value?.code?.destination_url) {
    editingUrl.value = false
    return
  }
  try {
    await api.update(id, { destinationUrl: urlDraft.value })
    editingUrl.value = false
    toast.add({ title: 'Destination updated', description: 'Printed codes now point here.', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not update', description: e?.data?.statusMessage, color: 'error' })
  }
}

const toggling = ref(false)
async function toggleActive() {
  const c = data.value?.code
  if (!c) return
  toggling.value = true
  try {
    await api.update(id, { isActive: !c.is_active })
    toast.add({ title: c.is_active ? 'QR code deactivated' : 'QR code activated', description: c.is_active ? 'Scans now land on a "no longer active" page.' : 'Scans redirect to the destination again.', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not update', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    toggling.value = false
  }
}

const editorOpen = ref(false)
async function copy() {
  await navigator.clipboard.writeText(data.value!.shortUrl)
  toast.add({ title: 'Short link copied', color: 'success' })
}
async function downloadPng() {
  try {
    await api.downloadPng(data.value!.code)
  } catch (e: any) {
    toast.add({ title: 'Could not generate PNG', description: e?.message ?? 'Unknown error', color: 'error' })
  }
}
const ago = (d: string) => formatTimeAgo(new Date(d))
const full = (d: string) => format(new Date(d), 'd MMM yyyy, h:mm a')
</script>

<template>
  <div v-if="error" class="h-full overflow-y-auto p-6">
    <UAlert
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="QR code not found"
      description="It may have been deleted, or you don't have access to this client."
      :actions="[{ label: 'All QR codes', to: '/agency/qr-codes', variant: 'soft', color: 'error' }]"
    />
  </div>
  <div v-else-if="data" class="h-full overflow-y-auto p-6 space-y-6">
    <UButton
      to="/agency/qr-codes"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      class="px-0"
    >
      All QR codes
    </UButton>

    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ data.code.name }}
          </h1>
          <UBadge :color="data.code.is_active ? 'success' : 'neutral'" variant="subtle" size="sm">
            {{ data.code.is_active ? 'Active' : 'Inactive' }}
          </UBadge>
        </div>
        <p class="mt-0.5 text-sm text-muted">
          {{ data.code.client_name ?? '' }}<span v-if="data.code.folder_name"> · {{ data.code.folder_name }}</span>
          <span v-if="data.code.created_at"> · created {{ ago(data.code.created_at) }}</span>
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-palette"
          variant="soft"
          color="neutral"
          @click="() => { editorOpen = true }"
        >
          Edit design
        </UButton>
        <UButton
          :icon="data.code.is_active ? 'i-lucide-pause' : 'i-lucide-play'"
          variant="soft"
          :color="data.code.is_active ? 'neutral' : 'success'"
          :loading="toggling"
          @click="toggleActive"
        >
          {{ data.code.is_active ? 'Deactivate' : 'Activate' }}
        </UButton>
      </div>
    </header>

    <div class="grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside class="space-y-3 lg:sticky lg:top-6 lg:self-start">
        <QrPreview
          :text="data.shortUrl"
          :style="data.code.style"
          :size="300"
          fluid
        />
        <div class="grid grid-cols-2 gap-2">
          <UButton
            :to="api.exportUrl(id)"
            external
            icon="i-lucide-download"
            block
          >
            SVG
          </UButton>
          <UButton
            icon="i-lucide-image"
            variant="soft"
            block
            @click="downloadPng"
          >
            PNG
          </UButton>
        </div>
        <p class="text-xs text-muted">
          SVG for print and signage; PNG (2048px) for decks and email.
        </p>
      </aside>

      <section class="min-w-0 space-y-6">
        <UCard :ui="{ body: 'p-0' }">
          <dl class="divide-y divide-default">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
              <dt class="w-28 shrink-0 text-xs font-medium uppercase tracking-wider text-muted">
                Short link
              </dt>
              <dd class="flex min-w-0 flex-1 items-center gap-2">
                <span class="truncate font-mono text-sm">{{ data.shortUrl }}</span>
                <UTooltip text="Copy">
                  <UButton
                    icon="i-lucide-copy"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    aria-label="Copy short link"
                    @click="copy"
                  />
                </UTooltip>
                <UTooltip text="Open in new tab">
                  <UButton
                    :to="data.shortUrl"
                    external
                    target="_blank"
                    icon="i-lucide-external-link"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    aria-label="Open short link"
                  />
                </UTooltip>
                <span class="hidden text-xs text-muted sm:inline">printed on the code · fixed</span>
              </dd>
            </div>
            <div class="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
              <dt class="w-28 shrink-0 pt-1 text-xs font-medium uppercase tracking-wider text-muted">
                Destination
              </dt>
              <dd v-if="!editingUrl" class="flex min-w-0 flex-1 items-center gap-2">
                <a
                  :href="data.code.destination_url"
                  target="_blank"
                  rel="noopener"
                  class="truncate text-sm text-primary hover:underline"
                >{{ data.code.destination_url }}</a>
                <UButton
                  icon="i-lucide-pencil"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  aria-label="Change destination"
                  @click="startEdit"
                />
              </dd>
              <dd v-else class="min-w-0 flex-1 space-y-2">
                <UFormField :error="urlError || undefined" help="Takes effect on the next scan — no reprint needed.">
                  <UInput
                    v-model="urlDraft"
                    icon="i-lucide-link"
                    autofocus
                    class="w-full"
                    @keydown.enter="saveUrl"
                    @keydown.esc="editingUrl = false"
                  />
                </UFormField>
                <div class="flex gap-2">
                  <UButton size="sm" :disabled="!!urlError || !urlDraft" @click="saveUrl">
                    Save destination
                  </UButton>
                  <UButton
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    @click="() => { editingUrl = false }"
                  >
                    Cancel
                  </UButton>
                </div>
              </dd>
            </div>
          </dl>
        </UCard>

        <QrConnectCard
          v-if="analytics"
          :code="data.code"
          :tracker-installed="!!analytics.trackerInstalled"
          :visits="analytics.visits ?? { sessions: 0, visitors: 0 }"
          :leads="analytics.leads?.total ?? 0"
        />

        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-semibold">
            Scans
          </h2>
          <div class="flex items-center gap-1">
            <UButton
              v-for="p in PRESETS"
              :key="p.days"
              size="xs"
              :variant="activePreset === p.days ? 'solid' : 'ghost'"
              :color="activePreset === p.days ? 'primary' : 'neutral'"
              @click="applyPreset(p.days)"
            >
              {{ p.label }}
            </UButton>
            <UPopover v-model:open="rangeOpen">
              <UButton
                icon="i-lucide-calendar"
                size="xs"
                :variant="activePreset ? 'ghost' : 'solid'"
                :color="activePreset ? 'neutral' : 'primary'"
              >
                {{ activePreset ? 'Custom' : rangeLabel }}
              </UButton>
              <template #content>
                <div class="p-2">
                  <UCalendar v-model="range" range :max-value="today(tz)" />
                </div>
              </template>
            </UPopover>
          </div>
        </div>

        <QrAnalytics
          v-if="analytics"
          :data="analytics"
          :range-label="rangeLabel"
          :class="analyticsStatus === 'pending' ? 'opacity-60 transition' : ''"
        />

        <UCard v-if="data.history?.length">
          <template #header>
            <div class="flex items-baseline justify-between">
              <span class="text-sm font-medium">Destination history</span>
              <span class="text-xs text-muted">{{ data.history.length }} {{ data.history.length === 1 ? 'change' : 'changes' }}</span>
            </div>
          </template>
          <ol class="divide-y divide-default text-sm">
            <li v-for="h in data.history" :key="h.changed_at" class="flex gap-3 py-2.5">
              <UIcon name="i-lucide-corner-down-right" class="mt-0.5 size-4 shrink-0 text-muted" />
              <div class="min-w-0 flex-1">
                <p class="break-all">
                  {{ h.new_url }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  <UTooltip :text="full(h.changed_at)">
                    <span>{{ ago(h.changed_at) }}</span>
                  </UTooltip><span v-if="h.changed_by_name"> · {{ h.changed_by_name }}</span><span v-if="h.old_url" class="break-all"> · was {{ h.old_url }}</span>
                </p>
              </div>
            </li>
          </ol>
        </UCard>
      </section>
    </div>
    <QrEditor v-model:open="editorOpen" :code="data.code" @saved="() => refresh()" />
  </div>
</template>
