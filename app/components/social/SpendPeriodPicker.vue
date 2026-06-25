<script setup lang="ts">
import { CalendarDate, today, getLocalTimeZone } from '@internationalized/date'
import { startOfWeek, endOfWeek, addWeeks, format, getWeek, startOfMonth, endOfMonth, eachWeekOfInterval, isSameMonth } from 'date-fns'

const props = defineProps<{
  month: number
  year: number
  /** Optional: filter to a date range within the month (e.g., a week) */
  weekFilter?: { start: string; end: string } | null
  lastSyncedAt?: string | null
  latestSyncJobs?: Array<{
    platform: string
    status: 'running' | 'completed' | 'failed'
    syncedCount: number
    error?: string | null
    startedAt: string
    finishedAt?: string | null
  }>
  syncing?: boolean
}>()

const emit = defineEmits<{
  'update:month': [month: number]
  'update:year': [year: number]
  'update:weekFilter': [filter: { start: string; end: string } | null]
  'sync': []
}>()

const tz = getLocalTimeZone()
const now = today(tz)
const popoverOpen = ref(false)

// ── Calendar model ──
const calendarValue = computed({
  get: () => new CalendarDate(props.year, props.month, 1),
  set: (val: CalendarDate) => {
    emit('update:month', val.month)
    emit('update:year', val.year)
    emit('update:weekFilter', null) // reset week filter on month change
    popoverOpen.value = false
  }
})

// ── Shortcuts ──
const shortcuts = computed(() => {
  const m = now.month
  const y = now.year
  const prev = m === 1 ? { month: 12, year: y - 1 } : { month: m - 1, year: y }
  const prev2 = prev.month === 1 ? { month: 12, year: prev.year - 1 } : { month: prev.month - 1, year: prev.year }

  return [
    { label: 'This Month', month: m, year: y },
    { label: 'Last Month', month: prev.month, year: prev.year },
    { label: monthName(prev2.month, prev2.year), month: prev2.month, year: prev2.year },
  ]
})

function monthName(m: number, y: number) {
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
}

function selectShortcut(s: { month: number; year: number }) {
  emit('update:month', s.month)
  emit('update:year', s.year)
  emit('update:weekFilter', null)
  popoverOpen.value = false
}

function isActiveShortcut(s: { month: number; year: number }) {
  return s.month === props.month && s.year === props.year && !props.weekFilter
}

// ── Week selector ──
const weeksInMonth = computed(() => {
  const monthStart = startOfMonth(new Date(props.year, props.month - 1, 1))
  const monthEnd = endOfMonth(monthStart)
  const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd }, { weekStartsOn: 1 })

  return weeks.map((weekStart, i) => {
    const wStart = weekStart < monthStart ? monthStart : weekStart
    const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
    const clampedEnd = wEnd > monthEnd ? monthEnd : wEnd

    return {
      label: `W${i + 1}`,
      tooltip: `${format(wStart, 'd MMM')} – ${format(clampedEnd, 'd MMM')}`,
      start: format(wStart, 'yyyy-MM-dd'),
      end: format(clampedEnd, 'yyyy-MM-dd'),
    }
  })
})

// Week shortcuts (This Week / Last Week) — only show if relevant to selected month
const todayDate = new Date()
const weekShortcuts = computed(() => {
  const result: { label: string; start: string; end: string }[] = []

  const thisWeekStart = startOfWeek(todayDate, { weekStartsOn: 1 })
  const thisWeekEnd = endOfWeek(todayDate, { weekStartsOn: 1 })
  const selectedMonthDate = new Date(props.year, props.month - 1, 1)

  if (isSameMonth(thisWeekStart, selectedMonthDate) || isSameMonth(thisWeekEnd, selectedMonthDate)) {
    result.push({
      label: 'This Week',
      start: format(thisWeekStart, 'yyyy-MM-dd'),
      end: format(thisWeekEnd, 'yyyy-MM-dd'),
    })
  }

  const lastWeekStart = startOfWeek(addWeeks(todayDate, -1), { weekStartsOn: 1 })
  const lastWeekEnd = endOfWeek(addWeeks(todayDate, -1), { weekStartsOn: 1 })
  if (isSameMonth(lastWeekStart, selectedMonthDate) || isSameMonth(lastWeekEnd, selectedMonthDate)) {
    result.push({
      label: 'Last Week',
      start: format(lastWeekStart, 'yyyy-MM-dd'),
      end: format(lastWeekEnd, 'yyyy-MM-dd'),
    })
  }

  return result
})

function selectWeek(w: { start: string; end: string }) {
  if (props.weekFilter?.start === w.start && props.weekFilter?.end === w.end) {
    emit('update:weekFilter', null) // toggle off
  } else {
    emit('update:weekFilter', { start: w.start, end: w.end })
  }
}

function isActiveWeek(w: { start: string; end: string }) {
  return props.weekFilter?.start === w.start && props.weekFilter?.end === w.end
}

// ── Display label ──
const displayLabel = computed(() => {
  if (props.weekFilter) {
    const s = new Date(props.weekFilter.start + 'T00:00:00')
    const e = new Date(props.weekFilter.end + 'T00:00:00')
    return `${format(s, 'd MMM')} – ${format(e, 'd MMM yyyy')}`
  }
  return monthName(props.month, props.year)
})

// ── Month navigation ──
function prevMonth() {
  if (props.month === 1) {
    emit('update:month', 12)
    emit('update:year', props.year - 1)
  } else {
    emit('update:month', props.month - 1)
  }
  emit('update:weekFilter', null)
}

function nextMonth() {
  if (props.month === 12) {
    emit('update:month', 1)
    emit('update:year', props.year + 1)
  } else {
    emit('update:month', props.month + 1)
  }
  emit('update:weekFilter', null)
}

const isCurrentMonth = computed(() =>
  props.month === now.month && props.year === now.year
)

// ── Last sync ──
const syncLabel = computed(() => {
  if (!props.lastSyncedAt) return null
  const d = new Date(props.lastSyncedAt)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(mins / 60)

  let relative: string
  if (mins < 1) relative = 'Just now'
  else if (mins < 60) relative = `${mins}m ago`
  else if (hours < 24) relative = `${hours}h ${mins % 60}m ago`
  else relative = `${Math.floor(hours / 24)}d ago`

  const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  return { relative, exact: `${date} at ${time}` }
})

const latestFailedSync = computed(() => {
  return [...(props.latestSyncJobs || [])]
    .filter(job => job.status === 'failed')
    .sort((a, b) => new Date(b.finishedAt || b.startedAt).getTime() - new Date(a.finishedAt || a.startedAt).getTime())[0] || null
})

const latestFailedSyncLabel = computed(() => {
  const job = latestFailedSync.value
  if (!job) return null
  const d = new Date(job.finishedAt || job.startedAt)
  const time = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })
  const date = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  return {
    exact: `${date} at ${time}`,
    title: job.error || `${job.platform} sync failed with ${job.syncedCount} campaigns updated`,
  }
})

const syncButtonLabel = computed(() => props.syncing ? 'Syncing' : 'Sync now')
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- Month nav arrows + Period popover -->
    <div class="flex items-center gap-1">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        size="xs"
        @click="prevMonth"
      />

      <UPopover v-model:open="popoverOpen" :content="{ align: 'start' }">
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-calendar"
          class="data-[state=open]:bg-elevated group min-w-[180px] justify-between"
        >
          <span class="font-medium">{{ displayLabel }}</span>
          <template #trailing>
            <UIcon
              name="i-lucide-chevron-down"
              class="shrink-0 text-dimmed size-4 group-data-[state=open]:rotate-180 transition-transform duration-200"
            />
          </template>
        </UButton>

        <template #content>
          <div class="flex items-stretch sm:divide-x divide-default">
            <!-- Shortcuts -->
            <div class="flex flex-col py-1">
              <div class="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Quick Select</div>
              <UButton
                v-for="s in shortcuts"
                :key="s.label"
                :label="s.label"
                color="neutral"
                variant="ghost"
                class="rounded-none px-4 text-sm"
                :class="[isActiveShortcut(s) ? 'bg-elevated font-medium' : 'hover:bg-elevated/50']"
                @click="selectShortcut(s)"
              />

              <div v-if="weekShortcuts.length" class="border-t border-default mt-1 pt-1">
                <div class="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">Week</div>
                <UButton
                  v-for="w in weekShortcuts"
                  :key="w.label"
                  :label="w.label"
                  color="neutral"
                  variant="ghost"
                  class="rounded-none px-4 text-sm"
                  :class="[isActiveWeek(w) ? 'bg-elevated font-medium' : 'hover:bg-elevated/50']"
                  @click="selectWeek(w); popoverOpen = false"
                />
              </div>
            </div>

            <!-- Calendar -->
            <div class="p-2">
              <UCalendar
                v-model="calendarValue"
                class="rounded-lg"
              />
            </div>
          </div>
        </template>
      </UPopover>

      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="isCurrentMonth"
        @click="nextMonth"
      />
    </div>

    <!-- Week filter pills -->
    <div class="hidden lg:flex items-center gap-0.5 border-l border-default pl-3">
      <UButton
        size="xs"
        :variant="!weekFilter ? 'soft' : 'ghost'"
        :color="!weekFilter ? 'primary' : 'neutral'"
        label="All"
        @click="$emit('update:weekFilter', null)"
      />
      <UButton
        v-for="w in weeksInMonth"
        :key="w.start"
        size="xs"
        :variant="isActiveWeek(w) ? 'soft' : 'ghost'"
        :color="isActiveWeek(w) ? 'primary' : 'neutral'"
        :label="w.label"
        @click="selectWeek(w)"
      />
    </div>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Last synced + Sync button -->
    <div class="flex items-center gap-2">
      <div class="text-xs text-muted text-right hidden sm:block">
        <div v-if="latestFailedSyncLabel" class="text-warning" :title="latestFailedSyncLabel.title">
          Latest sync failed
          <span class="text-muted/60 ml-1">({{ latestFailedSyncLabel.exact }})</span>
        </div>
        <div v-if="syncLabel" :title="syncLabel.exact">
          Last successful data sync {{ syncLabel.relative }}
          <span class="text-muted/60 ml-1">({{ syncLabel.exact }})</span>
        </div>
        <div v-else-if="!latestFailedSyncLabel">
          Never synced
        </div>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        :label="syncButtonLabel"
        color="primary"
        size="sm"
        :loading="syncing"
        :disabled="syncing"
        @click="$emit('sync')"
      />
    </div>
  </div>
</template>
