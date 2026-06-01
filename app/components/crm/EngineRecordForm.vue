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
