<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import { computed } from 'vue'
import { audiencePresetRange } from '~/composables/useAudienceAnalytics'

const props = defineProps<{
  from: string
  to: string
  clientId: string | null
  availableClients: Array<{ id: string, name: string }>
}>()

const emit = defineEmits<{
  'update:from': [value: string]
  'update:to': [value: string]
  'update:clientId': [value: string | null]
}>()

const presets = [
  { label: '7 days', days: 7 as const },
  { label: '30 days', days: 30 as const },
  { label: '90 days', days: 90 as const }
]

const clientOptions = computed(() => [
  { label: 'All accessible clients', value: 'all' },
  ...props.availableClients.map(client => ({ label: client.name, value: client.id }))
])

function calendarValue(value: string): DateValue | null {
  try {
    return parseDate(value)
  } catch {
    return null
  }
}

const fromModel = computed({
  get: () => calendarValue(props.from),
  set: (value: DateValue | null) => {
    if (value) emit('update:from', value.toString())
  }
})

const toModel = computed({
  get: () => calendarValue(props.to),
  set: (value: DateValue | null) => {
    if (value) emit('update:to', value.toString())
  }
})

const clientModel = computed({
  get: () => props.clientId ?? 'all',
  set: (value: string) => emit('update:clientId', value === 'all' ? null : value)
})

const dateFormatter = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
})

function displayDate(value: string): string {
  const parsed = calendarValue(value)
  if (!parsed) return value
  return dateFormatter.format(new Date(parsed.year, parsed.month - 1, parsed.day))
}

function applyPreset(days: 7 | 30 | 90) {
  const range = audiencePresetRange(days)
  emit('update:from', range.from)
  emit('update:to', range.to)
}
</script>

<template>
  <UCard :ui="{ body: '@container' }">
    <div class="grid grid-cols-1 gap-4 @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,1.2fr)_auto] @lg:items-end">
      <UFormField label="From">
        <UPopover>
          <UButton
            :label="displayDate(props.from)"
            icon="i-lucide-calendar-days"
            color="neutral"
            variant="outline"
            class="w-full justify-start"
          />
          <template #content>
            <UCalendar v-model="fromModel" class="p-2" />
          </template>
        </UPopover>
      </UFormField>

      <UFormField label="To">
        <UPopover>
          <UButton
            :label="displayDate(props.to)"
            icon="i-lucide-calendar-days"
            color="neutral"
            variant="outline"
            class="w-full justify-start"
          />
          <template #content>
            <UCalendar v-model="toModel" class="p-2" />
          </template>
        </UPopover>
      </UFormField>

      <UFormField label="Client">
        <USelectMenu
          v-model="clientModel"
          :items="clientOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <div class="flex flex-wrap gap-1.5" aria-label="Date presets">
        <UButton
          v-for="preset in presets"
          :key="preset.days"
          :label="preset.label"
          size="sm"
          color="neutral"
          variant="soft"
          @click="applyPreset(preset.days)"
        />
      </div>
    </div>
  </UCard>
</template>
