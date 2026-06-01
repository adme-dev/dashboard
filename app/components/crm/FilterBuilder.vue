<script setup lang="ts">
// F9 — advanced filter builder. Edits a draft set of clauses in a popover and
// commits on Apply. The server re-validates every clause, so partial rows are safe.
import type { CrmEntity, CrmFilterClause } from '~/types/crm'
import { FILTER_FIELD_DEFS, opsForType, valueKind, fieldDef } from '~/utils/crmFilterFields'

const props = defineProps<{ entity: CrmEntity }>()
const model = defineModel<CrmFilterClause[]>({ default: () => [] })

// Local draft type uses `value: any` so the v-model bindings (USelect/UInput/
// UInputTags) type-check cleanly; committed back to the unknown-typed model on apply.
type DraftClause = { field: string, op: string, value: any }

const open = ref(false)
const draft = ref<DraftClause[]>([])

watch(open, (v) => {
  if (v) draft.value = model.value.map(c => ({ field: c.field, op: c.op, value: c.value }))
})

const fieldOptions = computed(() => FILTER_FIELD_DEFS[props.entity].map(f => ({ label: f.label, value: f.key })))
function opsFor(c: DraftClause) {
  const def = fieldDef(props.entity, c.field)
  return def ? opsForType(def.type) : []
}
function kindFor(c: DraftClause): 'none' | 'single' | 'multi' {
  const def = fieldDef(props.entity, c.field)
  return def ? valueKind(def.type, c.op) : 'none'
}
function defFor(c: DraftClause) { return fieldDef(props.entity, c.field) }

function addRow() {
  const first = FILTER_FIELD_DEFS[props.entity][0]
  draft.value.push({ field: first.key, op: opsForType(first.type)[0].value, value: undefined })
}
function removeRow(i: number) { draft.value.splice(i, 1) }
function normalizeValue(c: DraftClause) {
  const kind = kindFor(c)
  if (kind === 'multi') c.value = Array.isArray(c.value) ? c.value : []
  else if (kind === 'none') c.value = undefined
  else if (Array.isArray(c.value)) c.value = undefined
}
function onFieldChange(c: DraftClause) {
  // Reset op + value to valid defaults for the new field type.
  const def = fieldDef(props.entity, c.field)
  c.op = def ? opsForType(def.type)[0].value : 'eq'
  c.value = undefined
  normalizeValue(c)
}
function onOpChange(c: DraftClause) { normalizeValue(c) }

function isComplete(c: DraftClause) {
  if (!c.field || !c.op) return false
  const kind = kindFor(c)
  if (kind === 'none') return true
  if (kind === 'multi') return Array.isArray(c.value) && c.value.length > 0
  return c.value !== undefined && c.value !== null && c.value !== ''
}

function apply() {
  model.value = draft.value.filter(isComplete).map((c) => {
    const def = defFor(c)
    // Coerce number values so the server's typeof===number check passes.
    if (def?.type === 'number' && kindFor(c) === 'single') return { ...c, value: Number(c.value) }
    return c
  })
  open.value = false
}
function clearAll() { draft.value = []; model.value = []; open.value = false }

const activeCount = computed(() => model.value.length)
</script>

<template>
  <UPopover v-model:open="open">
    <UButton
      icon="i-lucide-filter"
      :variant="activeCount ? 'soft' : 'ghost'"
      :color="activeCount ? 'primary' : 'neutral'"
      size="sm"
    >
      Filters
      <UBadge v-if="activeCount" :label="String(activeCount)" size="sm" color="primary" variant="solid" class="ml-1" />
    </UButton>

    <template #content>
      <div class="w-[34rem] max-w-[90vw] p-4 space-y-3">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold">Filter {{ entity }}</p>
          <UButton size="xs" variant="ghost" icon="i-lucide-plus" @click="addRow">Add condition</UButton>
        </div>

        <p v-if="!draft.length" class="text-sm text-muted py-4 text-center">
          No conditions. Add one to narrow the list.
        </p>

        <div v-for="(c, i) in draft" :key="i" class="flex items-start gap-2">
          <USelect
            v-model="c.field"
            :items="fieldOptions"
            value-key="value"
            size="sm"
            class="w-40 shrink-0"
            @update:model-value="onFieldChange(c)"
          />
          <USelect v-model="c.op" :items="opsFor(c)" value-key="value" size="sm" class="w-36 shrink-0" @update:model-value="onOpChange(c)" />

          <template v-if="kindFor(c) === 'single'">
            <USelect
              v-if="defFor(c)?.type === 'enum'"
              v-model="c.value"
              :items="defFor(c)!.options || []"
              value-key="value"
              size="sm"
              placeholder="Value"
              class="flex-1"
            />
            <UInput
              v-else
              v-model="c.value"
              :type="defFor(c)?.type === 'number' ? 'number' : 'text'"
              size="sm"
              placeholder="Value"
              class="flex-1"
            />
          </template>
          <UInputTags
            v-else-if="kindFor(c) === 'multi'"
            v-model="c.value"
            size="sm"
            placeholder="Add value, Enter"
            class="flex-1"
          />
          <div v-else class="flex-1" />

          <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" class="mt-0.5" @click="removeRow(i)" />
        </div>

        <div class="flex items-center justify-between pt-1 border-t border-default">
          <UButton size="xs" variant="ghost" color="neutral" :disabled="!activeCount && !draft.length" @click="clearAll">
            Clear all
          </UButton>
          <UButton size="xs" color="primary" icon="i-lucide-check" @click="apply">Apply</UButton>
        </div>
      </div>
    </template>
  </UPopover>
</template>
