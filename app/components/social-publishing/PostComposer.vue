<script setup lang="ts">
import { CalendarDate, CalendarDateTime, parseDate, toZoned, type DateValue } from '@internationalized/date'
import type { SocialPublishPlatform } from '~/types'
import { useSocialComposer, type ScheduleMode } from '~/composables/useSocialComposer'

const { state, setOverride, resolved } = useSocialComposer()

const PLATFORM_OPTIONS: { value: SocialPublishPlatform; label: string; icon: string; limit: number }[] = [
  { value: 'facebook', label: 'Facebook', icon: 'i-lucide-facebook', limit: 63206 },
  { value: 'instagram', label: 'Instagram', icon: 'i-lucide-instagram', limit: 2200 },
  { value: 'linkedin', label: 'LinkedIn', icon: 'i-lucide-linkedin', limit: 3000 },
  { value: 'tiktok', label: 'TikTok', icon: 'i-lucide-music', limit: 2200 },
  { value: 'youtube', label: 'YouTube', icon: 'i-lucide-youtube', limit: 5000 },
  { value: 'google-business', label: 'Google Business', icon: 'i-lucide-store', limit: 1500 },
]
const labelFor = (p: string) => PLATFORM_OPTIONS.find(o => o.value === p)?.label ?? p

// tightest character limit across selected networks, for the base counter
const tightestLimit = computed(() => {
  const limits = state.value.platforms.map(p => PLATFORM_OPTIONS.find(o => o.value === p)?.limit ?? 99999)
  return limits.length ? Math.min(...limits) : 0
})
const overBase = computed(() => tightestLimit.value > 0 && state.value.content.length > tightestLimit.value)

// comma-separated <-> array bridges for hashtags / tags
function csvModel(key: 'hashtags' | 'tags') {
  return computed<string>({
    get: () => state.value[key].join(', '),
    set: (v) => { state.value[key] = v.split(',').map(s => s.trim()).filter(Boolean) },
  })
}
const hashtagsModel = csvModel('hashtags')
const tagsModel = csvModel('tags')

// media URLs
const newMediaUrl = ref('')
function addMedia() {
  const url = newMediaUrl.value.trim()
  if (url && !state.value.mediaUrls.includes(url)) state.value.mediaUrls.push(url)
  newMediaUrl.value = ''
}
function removeMedia(url: string) {
  state.value.mediaUrls = state.value.mediaUrls.filter(u => u !== url)
}

// schedule date bridge (ISO <-> CalendarDate)
function toCalendarDate(iso: string | null): DateValue | null {
  if (!iso) return null
  try { return parseDate(iso.slice(0, 10)) } catch { return null }
}
// Half-hour time options (HH:MM)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

// Derive the initial time-of-day (in the post's timezone) from an existing scheduledAt.
function timeFromScheduled(): string {
  if (!state.value.scheduledAt) return '09:00'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: state.value.timezone,
    }).format(new Date(state.value.scheduledAt))
  } catch { return '09:00' }
}

const scheduleDate = ref<DateValue | null>(toCalendarDate(state.value.scheduledAt))
const scheduleTime = ref(timeFromScheduled())

// Combine the chosen calendar date + time into an instant in the post's timezone.
function recomputeScheduledAt() {
  if (!scheduleDate.value) { state.value.scheduledAt = null; return }
  const d = scheduleDate.value as CalendarDate
  const [h, m] = scheduleTime.value.split(':').map(Number)
  const cdt = new CalendarDateTime(d.year, d.month, d.day, h || 0, m || 0)
  state.value.scheduledAt = toZoned(cdt, state.value.timezone || 'Australia/Sydney').toDate().toISOString()
}
watch([scheduleDate, scheduleTime], recomputeScheduledAt)

// Re-sync the local date/time controls if the post is (re)loaded externally (e.g. ?edit).
watch(() => state.value.scheduledAt, (iso) => {
  const next = toCalendarDate(iso)
  if (next?.toString() !== scheduleDate.value?.toString()) scheduleDate.value = next
  const t = timeFromScheduled()
  if (t !== scheduleTime.value) scheduleTime.value = t
})

const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const scheduleLabel = computed(() => scheduleDate.value
  ? dateFmt.format(new Date(state.value.scheduledAt || Date.now()))
  : 'Pick a date')

const scheduleModes: { value: ScheduleMode; label: string; icon: string }[] = [
  { value: 'now', label: 'Publish now', icon: 'i-lucide-send' },
  { value: 'schedule', label: 'Schedule', icon: 'i-lucide-calendar-clock' },
  { value: 'queue', label: 'Add to queue', icon: 'i-lucide-list-plus' },
]
</script>

<template>
  <div class="space-y-6">
    <!-- Networks -->
    <UFormField label="Networks" help="Pick which connected accounts this post goes to.">
      <USelectMenu
        v-model="state.platforms"
        :items="PLATFORM_OPTIONS"
        value-key="value"
        label-key="label"
        multiple
        placeholder="Select networks"
        icon="i-lucide-share-2"
        class="w-full"
      />
    </UFormField>

    <!-- Base content -->
    <UFormField label="Post content">
      <UTextarea
        v-model="state.content"
        :rows="6"
        autoresize
        placeholder="What do you want to share?"
        class="w-full"
      />
      <template #help>
        <span :class="overBase ? 'text-error' : 'text-muted'">
          {{ state.content.length }}<span v-if="tightestLimit"> / {{ tightestLimit }}</span> characters
          <span v-if="overBase"> — over the limit for {{ labelFor(state.platforms[0]) }}</span>
        </span>
      </template>
    </UFormField>

    <!-- Per-network customization -->
    <div class="rounded-lg border border-default p-4 space-y-4">
      <UCheckbox
        v-model="state.customizePerNetwork"
        label="Customize per network"
        :description="state.platforms.length ? 'Override the copy or media for specific networks. Blank tabs inherit the base post.' : 'Select networks first.'"
        :disabled="!state.platforms.length"
      />
      <UTabs
        v-if="state.customizePerNetwork && state.platforms.length"
        :items="state.platforms.map(p => ({ label: labelFor(p), value: p, slot: 'panel' }))"
      >
        <template #panel="{ item }">
          <div class="pt-3 space-y-2">
            <UTextarea
              :model-value="state.platformOverrides[item.value]?.content ?? ''"
              :rows="4"
              autoresize
              :placeholder="`Custom copy for ${item.label} (blank = use base post)`"
              class="w-full"
              @update:model-value="(v: string) => setOverride(item.value, { content: v })"
            />
            <p class="text-xs text-muted">
              Preview shows: “{{ resolved(item.value).content.slice(0, 80) || '—' }}”
            </p>
          </div>
        </template>
      </UTabs>
    </div>

    <!-- Link + media -->
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Link (optional)" help="UTM params are added per network on publish.">
        <UInput v-model="state.linkUrl" placeholder="https://…" class="w-full" />
      </UFormField>
      <UFormField label="First comment (optional)">
        <UInput v-model="state.firstComment" placeholder="Posted as the first comment" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Media" help="Add image URLs (R2 / Banner Studio creatives). Banner Studio picker + AI image are a fast-follow.">
      <div class="flex gap-2">
        <UInput v-model="newMediaUrl" placeholder="https://…/image.jpg" class="flex-1" @keydown.enter.prevent="addMedia" />
        <UButton icon="i-lucide-plus" color="neutral" variant="subtle" @click="addMedia">Add</UButton>
      </div>
      <div v-if="state.mediaUrls.length" class="mt-2 flex flex-wrap gap-2">
        <UBadge v-for="url in state.mediaUrls" :key="url" color="neutral" variant="subtle" class="max-w-full">
          <span class="truncate max-w-[200px]">{{ url.split('/').pop() }}</span>
          <UButton icon="i-lucide-x" size="xs" variant="link" color="neutral" class="-mr-1" @click="removeMedia(url)" />
        </UBadge>
      </div>
    </UFormField>

    <!-- Tags + hashtags -->
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Hashtags" help="Comma-separated.">
        <UInput v-model="hashtagsModel" placeholder="launch, sale" class="w-full" />
      </UFormField>
      <UFormField label="Tags" help="Internal — used by reporting & inbox later.">
        <UInput v-model="tagsModel" placeholder="campaign-q3, evergreen" class="w-full" />
      </UFormField>
    </div>

    <!-- Schedule -->
    <UFormField label="When">
      <div class="flex flex-wrap items-center gap-3">
        <USelectMenu
          v-model="state.scheduleMode"
          :items="scheduleModes"
          value-key="value"
          label-key="label"
          class="w-44"
        />
        <template v-if="state.scheduleMode === 'schedule'">
          <UPopover>
            <UButton icon="i-lucide-calendar" color="neutral" variant="subtle">{{ scheduleLabel }}</UButton>
            <template #content>
              <UCalendar v-model="scheduleDate" class="p-2" />
            </template>
          </UPopover>
          <USelectMenu
            v-model="scheduleTime"
            :items="TIME_OPTIONS"
            icon="i-lucide-clock"
            class="w-28"
          />
          <span class="text-xs text-muted">{{ state.timezone }}</span>
        </template>
        <span v-else-if="state.scheduleMode === 'queue'" class="text-sm text-muted">
          Drops into the next free posting slot.
        </span>
      </div>
    </UFormField>
  </div>
</template>
