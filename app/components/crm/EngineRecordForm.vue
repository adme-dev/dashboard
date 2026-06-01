<script setup lang="ts">
// Renders editable inputs for a CONFIG-OBJECT record from its field defs (distinct from the
// person/company-specific RecordForm.vue used by core CRM). Control per field_type comes from
// the shared controlForFieldType map so it never drifts from server validation.
// Date fields use the UPopover + UCalendar pattern (CLAUDE.md — never <UInput type=date>).
import { CalendarDate } from '@internationalized/date'
import { controlForFieldType } from '~/utils/crmFieldControls'
import type { CrmFieldDef } from '~/types/crm'

const props = defineProps<{ fields: CrmFieldDef[], modelValue: Record<string, unknown>, clientId: string }>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, unknown>] }>()

const local = reactive<Record<string, unknown>>({ ...props.modelValue })
watch(local, () => emit('update:modelValue', { ...local }), { deep: true })

function toCalendarDate(iso: unknown): CalendarDate | null {
  if (typeof iso !== 'string' || !iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return (y && m && d) ? new CalendarDate(y, m, d) : null
}
function setDate(key: string, cd: CalendarDate | null) {
  local[key] = cd ? cd.toString() : null
}
// Click a star to set the rating; click the active star again to step down (1 → 0 clears).
function setRating(key: string, n: number) {
  local[key] = Number(local[key]) === n ? n - 1 : n
}
</script>

<template>
  <div class="grid grid-cols-2 gap-4">
    <UFormField v-for="f in fields" :key="f.id" :label="f.label" :required="f.is_required">
      <UTextarea v-if="controlForFieldType(f.field_type) === 'textarea'" v-model="(local[f.key] as string)" :rows="4" autoresize />

      <UInput v-else-if="controlForFieldType(f.field_type) === 'number'" v-model.number="(local[f.key] as number)" type="number" />

      <UCheckbox v-else-if="controlForFieldType(f.field_type) === 'checkbox'" v-model="(local[f.key] as boolean)" />

      <USelectMenu v-else-if="controlForFieldType(f.field_type) === 'select'" v-model="(local[f.key] as string)" :items="f.options" />

      <UPopover v-else-if="controlForFieldType(f.field_type) === 'date'">
        <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="justify-start font-normal w-full">
          {{ local[f.key] ? String(local[f.key]).slice(0, 10) : 'Pick a date' }}
        </UButton>
        <template #content>
          <UCalendar
            :model-value="toCalendarDate(local[f.key])"
            @update:model-value="(v) => setDate(f.key, v as CalendarDate | null)"
          />
        </template>
      </UPopover>

      <UInputTags
        v-else-if="controlForFieldType(f.field_type) === 'tags'"
        :model-value="(local[f.key] as string[]) || []"
        placeholder="Add tag, press Enter"
        @update:model-value="(v) => (local[f.key] = v)"
      />

      <div v-else-if="controlForFieldType(f.field_type) === 'rating'" class="flex items-center gap-0.5">
        <UButton
          v-for="n in 5"
          :key="n"
          variant="ghost"
          size="xs"
          class="p-0.5"
          :aria-label="`Rate ${n} of 5`"
          @click="setRating(f.key, n)"
        >
          <UIcon
            name="i-lucide-star"
            class="size-5 transition-colors"
            :class="Number(local[f.key]) >= n ? 'text-amber-400 fill-amber-400' : 'text-muted hover:text-amber-300'"
          />
        </UButton>
        <span class="ml-1.5 text-xs text-muted tabular-nums">{{ Number(local[f.key]) || 0 }}/5</span>
      </div>

      <CrmRelationPicker
        v-else-if="controlForFieldType(f.field_type) === 'relation' && f.relation_target"
        v-model="(local[f.key] as string)"
        :target="f.relation_target"
        :client-id="clientId"
      />

      <UInput v-else v-model="(local[f.key] as string)" />
    </UFormField>
  </div>
</template>
