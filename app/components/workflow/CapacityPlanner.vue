<script setup lang="ts">
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns'

const props = defineProps<{
  departmentId?: string
}>()

// Current week state
const currentWeekStart = ref(startOfWeek(new Date(), { weekStartsOn: 1 }))

const weekDays = computed(() => {
  return eachDayOfInterval({
    start: currentWeekStart.value,
    end: endOfWeek(currentWeekStart.value, { weekStartsOn: 1 })
  }).slice(0, 5) // Mon-Fri only
})

// Fetch capacity data
const { data: capacityData, pending: loading } = await useFetch('/api/agency/dashboard/workload', {
  query: computed(() => ({
    departmentId: props.departmentId,
    weekStart: format(currentWeekStart.value, 'yyyy-MM-dd')
  }))
})

const capacity = computed(() => capacityData.value || { members: [] as any[] })

// Navigation
const goToPreviousWeek = () => {
  currentWeekStart.value = addDays(currentWeekStart.value, -7)
}

const goToNextWeek = () => {
  currentWeekStart.value = addDays(currentWeekStart.value, 7)
}

const goToCurrentWeek = () => {
  currentWeekStart.value = startOfWeek(new Date(), { weekStartsOn: 1 })
}

// Get hours for a specific day
const getHoursForDay = (member: any, day: Date) => {
  const dayKey = format(day, 'yyyy-MM-dd')
  return member.dailyHours?.[dayKey] || 0
}

// Capacity status
const getCapacityColor = (hours: number, targetHours: number = 8) => {
  const ratio = hours / targetHours
  if (ratio === 0) return 'bg-neutral-200 dark:bg-neutral-700'
  if (ratio < 0.5) return 'bg-emerald-200 dark:bg-emerald-800'
  if (ratio < 0.8) return 'bg-blue-200 dark:bg-blue-800'
  if (ratio < 1) return 'bg-amber-200 dark:bg-amber-800'
  if (ratio === 1) return 'bg-emerald-400 dark:bg-emerald-600'
  return 'bg-red-300 dark:bg-red-700'
}

// Check if day is today
const isToday = (day: Date) => isSameDay(day, new Date())

// Week label
const weekLabel = computed(() => {
  const start = format(currentWeekStart.value, 'MMM d')
  const end = format(addDays(currentWeekStart.value, 4), 'MMM d, yyyy')
  return `${start} - ${end}`
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-calendar-range" class="h-5 w-5 text-muted" />
          <h3 class="font-semibold">Capacity Planner</h3>
        </div>

        <!-- Week navigation -->
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-chevron-left"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="goToPreviousWeek"
          />
          <UButton
            :label="weekLabel"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="goToCurrentWeek"
          />
          <UButton
            icon="i-lucide-chevron-right"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="goToNextWeek"
          />
        </div>
      </div>
    </template>

    <!-- Loading state -->
    <template v-if="loading">
      <div class="space-y-4">
        <div class="grid grid-cols-6 gap-2">
          <div />
          <USkeleton v-for="i in 5" :key="i" class="h-8" />
        </div>
        <div v-for="j in 4" :key="j" class="grid grid-cols-6 gap-2">
          <USkeleton class="h-10" />
          <USkeleton v-for="i in 5" :key="i" class="h-10" />
        </div>
      </div>
    </template>

    <!-- Capacity grid -->
    <template v-else>
      <div class="overflow-x-auto">
        <table class="w-full">
          <!-- Header: Days -->
          <thead>
            <tr>
              <th class="text-left text-xs font-medium text-muted pb-3 w-40">Team Member</th>
              <th
                v-for="day in weekDays"
                :key="day.toISOString()"
                class="text-center text-xs font-medium pb-3 w-20"
                :class="isToday(day) ? 'text-primary' : 'text-muted'"
              >
                <div>{{ format(day, 'EEE') }}</div>
                <div class="text-lg">{{ format(day, 'd') }}</div>
              </th>
              <th class="text-center text-xs font-medium text-muted pb-3 w-20">Total</th>
            </tr>
          </thead>

          <!-- Body: Team members -->
          <tbody class="divide-y divide-neutral-200 dark:divide-neutral-700">
            <tr
              v-for="member in capacity.members"
              :key="member.id"
              class="group"
            >
              <!-- Member name -->
              <td class="py-2 pr-4">
                <div class="flex items-center gap-2">
                  <UAvatar :alt="member.name" size="xs" />
                  <span class="text-sm font-medium truncate">{{ member.name }}</span>
                </div>
              </td>

              <!-- Daily hours -->
              <td
                v-for="day in weekDays"
                :key="day.toISOString()"
                class="py-2 px-1"
              >
                <div
                  class="h-10 rounded flex items-center justify-center text-sm font-medium transition-colors"
                  :class="[
                    getCapacityColor(getHoursForDay(member, day)),
                    isToday(day) ? 'ring-2 ring-primary ring-offset-2' : ''
                  ]"
                >
                  {{ getHoursForDay(member, day) || '-' }}
                </div>
              </td>

              <!-- Weekly total -->
              <td class="py-2 px-1 text-center">
                <span class="text-sm font-bold">
                  {{ member.weeklyHours || 0 }}h
                </span>
                <span class="text-xs text-muted block">
                  / 40h
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Empty state -->
        <div v-if="!capacity.members?.length" class="text-center py-8">
          <UIcon name="i-lucide-calendar-x" class="h-8 w-8 text-muted mx-auto mb-2" />
          <p class="text-sm text-muted">No capacity data available</p>
        </div>
      </div>

      <!-- Legend -->
      <div class="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-center gap-4 text-xs text-muted">
        <span class="font-medium">Capacity:</span>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-neutral-200 dark:bg-neutral-700" />
          <span>Empty</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-emerald-200 dark:bg-emerald-800" />
          <span>&lt;50%</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-blue-200 dark:bg-blue-800" />
          <span>50-80%</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-amber-200 dark:bg-amber-800" />
          <span>80-100%</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-4 h-4 rounded bg-red-300 dark:bg-red-700" />
          <span>Over</span>
        </div>
      </div>
    </template>
  </UCard>
</template>
