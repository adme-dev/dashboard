<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'
import type { CollectionField, CollectionValues } from '~~/shared/pageStudio/collectionDefinition'

const props = defineProps<{ fields: CollectionField[], disabled?: boolean, errors?: Record<string, string> }>()
const values = defineModel<CollectionValues>({ required: true })
function set(field: CollectionField, value: string | number | boolean | undefined) {
  const next = { ...values.value }
  if (value === undefined) {
    values.value = Object.fromEntries(Object.entries(next).filter(([key]) => key !== field.id))
    return
  }
  next[field.id] = value
  values.value = next
}
function numeric(field: CollectionField): string | number {
  const value = values.value[field.id]
  return typeof value === 'number' || typeof value === 'string' ? value : ''
}
function include(field: CollectionField, enabled: boolean) {
  if (!enabled) return set(field, undefined)
  set(
    field,
    field.type === 'boolean'
      ? false
      : field.type === 'integer'
        ? 0
        : field.type === 'enum'
          ? (field.options[0]?.id ?? '')
          : ''
  )
}
function calendar(field: CollectionField) {
  const date = String(values.value[field.id] ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined
  try {
    const [y, m, d] = date.split('-').map(Number)
    return new CalendarDate(y!, m!, d!)
  } catch {
    return undefined
  }
}
function chooseDate(field: CollectionField, date: unknown) {
  if (!date) return
  const day = String(date)
  set(field, field.type === 'instant' ? `${day}T${time(field)}Z` : day)
}
function time(field: CollectionField) {
  return String(values.value[field.id] ?? '').match(/T(\d{2}:\d{2}:\d{2}\.\d{3})Z$/)?.[1] ?? '00:00:00.000'
}
function setTime(field: CollectionField, value: string | number) {
  const day = calendar(field)?.toString()
  if (day) set(field, `${day}T${value}Z`)
}
</script>

<template>
  <div class="@container">
    <fieldset :disabled="disabled" class="grid grid-cols-1 gap-5 @lg:grid-cols-2">
      <UFormField
        v-for="field in props.fields"
        :key="field.id"
        :label="field.label"
        :required="field.required"
        :error="errors?.[field.id]"
        :description="field.visibility === 'private' ? 'Private field' : undefined"
        :class="field.type === 'text' ? '@lg:col-span-2' : ''"
      >
        <UFormField
          v-if="!field.required"
          :label="`Include ${field.label}`"
          :ui="{ label: 'sr-only', container: 'mt-0' }"
          class="mb-2"
        >
          <UCheckbox
            :model-value="Object.hasOwn(values, field.id)"
            :aria-label="`Include ${field.label}`"
            label="Include this field"
            @update:model-value="include(field, $event === true)"
          />
        </UFormField>
        <template v-if="field.required || Object.hasOwn(values, field.id)">
          <UTextarea
            v-if="field.type === 'text' && (field.maxLength ?? 4000) > 300"
            :model-value="String(values[field.id] ?? '')"
            :maxlength="field.maxLength ?? 4000"
            :rows="3"
            class="w-full"
            @update:model-value="set(field, $event)"
          />
          <UInput
            v-else-if="field.type === 'text'"
            :model-value="String(values[field.id] ?? '')"
            :maxlength="field.maxLength"
            class="w-full"
            @update:model-value="set(field, String($event))"
          />
          <UInput
            v-else-if="field.type === 'integer'"
            type="number"
            :model-value="numeric(field)"
            :min="field.min"
            :max="field.max"
            :step="1"
            class="w-full"
            @update:model-value="set(field, $event === '' ? undefined : Number($event))"
          />
          <UInput
            v-else-if="field.type === 'decimal'"
            :model-value="String(values[field.id] ?? '')"
            inputmode="decimal"
            :placeholder="field.scale ? `0.${'0'.repeat(field.scale)}` : '0'"
            class="w-full"
            @update:model-value="set(field, String($event))"
          />
          <UCheckbox
            v-else-if="field.type === 'boolean'"
            :model-value="values[field.id] === true"
            :label="field.label"
            @update:model-value="set(field, $event === true)"
          />
          <USelect
            v-else-if="field.type === 'enum'"
            :model-value="String(values[field.id] ?? '__choose__')"
            :items="[
              { label: 'Choose a value', value: '__choose__' },
              ...field.options.map((option) => ({ label: option.label, value: option.id }))
            ]"
            class="w-full"
            @update:model-value="set(field, $event === '__choose__' ? undefined : String($event))"
          />
          <div v-else-if="field.type === 'date' || field.type === 'instant'" class="space-y-3">
            <UPopover>
              <UButton
                :label="calendar(field)?.toString() ?? 'Choose a date'"
                color="neutral"
                variant="outline"
                icon="i-lucide-calendar"
                class="w-full justify-start"
              />
              <template #content>
                <div class="p-2">
                  <UCalendar
                    :disabled="disabled"
                    :model-value="calendar(field)"
                    @update:model-value="chooseDate(field, $event)"
                  /><UButton
                    v-if="!field.required"
                    label="Clear date"
                    variant="ghost"
                    color="neutral"
                    @click="set(field, undefined)"
                  />
                </div>
              </template>
            </UPopover>
            <UFormField
              v-if="field.type === 'instant'"
              label="Time (UTC)"
              description="HH:mm:ss.SSS, for example 09:30:00.000"
            >
              <UInput
                :model-value="time(field)"
                :maxlength="12"
                class="w-full"
                @update:model-value="setTime(field, $event)"
              />
            </UFormField>
          </div>
        </template>
      </UFormField>
    </fieldset>
  </div>
</template>
