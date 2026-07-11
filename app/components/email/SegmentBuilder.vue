<!-- app/components/email/SegmentBuilder.vue -->
<!-- Audience segment editor for a campaign (email Phase 5). Builds a match-all/
     match-any list of field/op/value rules, PATCHes campaigns.filter_rules, then
     re-materialises to show how many recipients now match. Draft-only (the API
     rejects edits once a campaign leaves draft). Mirrors the leads filter grammar. -->
<script setup lang="ts">
import { describeEmailActionError } from '~~/app/utils/emailActionError'

interface Rule { field: string, op: string, value: string }
interface StoredRule { field: string, op: string, value?: unknown }
interface StoredSegment { match: 'all' | 'any', rules: StoredRule[] }

const props = defineProps<{
  campaignId: string | null
  campaignName?: string
  initial?: StoredSegment | null
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown }) => Promise<T>

const OPS = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'does not equal' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
  { value: 'gte', label: 'at least' },
  { value: 'lte', label: 'at most' },
  { value: 'contains', label: 'contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
  { value: 'in', label: 'is one of' },
  { value: 'not_in', label: 'is not one of' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' }
]
const NO_VALUE = new Set(['is_empty', 'is_not_empty'])
const LIST_OPS = new Set(['in', 'not_in'])

const match = ref<'all' | 'any'>('all')
const rules = ref<Rule[]>([])
const saving = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  match.value = props.initial?.match || 'all'
  rules.value = (props.initial?.rules || []).map(r => ({
    field: r.field,
    op: r.op,
    value: Array.isArray(r.value) ? r.value.join(', ') : (r.value == null ? '' : String(r.value))
  }))
})

function addRule() {
  rules.value.push({ field: '', op: 'eq', value: '' })
}
function removeRule(i: number) {
  rules.value.splice(i, 1)
}

function buildFilterRules(): StoredSegment | null {
  const clean = rules.value.filter(r => r.field.trim() && r.op)
  if (!clean.length) return null
  return {
    match: match.value,
    rules: clean.map((r) => {
      const out: StoredRule = { field: r.field.trim(), op: r.op }
      if (!NO_VALUE.has(r.op)) {
        out.value = LIST_OPS.has(r.op)
          ? r.value.split(',').map(s => s.trim()).filter(Boolean)
          : r.value
      }
      return out
    })
  }
}

async function save() {
  if (!props.campaignId) return
  saving.value = true
  try {
    const filter_rules = buildFilterRules()
    await apiFetch(`/api/email/campaigns/${props.campaignId}`, {
      method: 'PATCH',
      body: { filter_rules }
    })
    // Re-materialise so to_send reflects the new segment (best-effort).
    let toSend: number | null = null
    try {
      const r = await apiFetch<{ to_send: number }>(
        `/api/email/campaigns/${props.campaignId}/materialize`,
        { method: 'POST' }
      )
      toSend = r.to_send
    } catch { /* materialise is best-effort; the segment still saved */ }
    toast.add({
      title: filter_rules ? 'Audience saved' : 'Audience cleared',
      description: toSend != null
        ? `${toSend} recipient(s) match.`
        : 'Recipients will be recomputed when you materialise.',
      color: 'success'
    })
    open.value = false
    emit('saved')
  } catch (e: unknown) {
    const sm = (e as { data?: { statusMessage?: string } })?.data?.statusMessage
    toast.add({
      title: 'Save failed',
      description: sm === 'campaign_not_editable'
        ? 'This campaign can no longer be edited.'
        : sm === 'invalid_segment'
          ? 'One of the rules is invalid — check the operator.'
          : describeEmailActionError(e, 'Please try again.'),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Audience">
    <template #content>
      <div class="p-4 space-y-4">
        <div>
          <p class="text-sm font-semibold">
            Audience for {{ campaignName ? `“${campaignName}”` : 'this campaign' }}
          </p>
          <p class="text-sm text-muted">
            Narrow the target lists to subscribers matching these rules. Leave empty
            to send to everyone on the lists.
          </p>
        </div>

        <div v-if="rules.length" class="flex items-center gap-2 text-sm">
          <span class="text-muted">Match</span>
          <USelect
            v-model="match"
            :items="[{ label: 'all', value: 'all' }, { label: 'any', value: 'any' }]"
            value-key="value"
            size="sm"
            class="w-24"
          />
          <span class="text-muted">of the following</span>
        </div>

        <div class="space-y-2">
          <div
            v-for="(rule, i) in rules"
            :key="i"
            class="grid grid-cols-12 gap-2 items-center"
          >
            <UInput
              v-model="rule.field"
              placeholder="field (e.g. budget)"
              size="sm"
              class="col-span-4"
            />
            <USelect
              v-model="rule.op"
              :items="OPS"
              value-key="value"
              size="sm"
              class="col-span-4"
            />
            <UInput
              v-if="!NO_VALUE.has(rule.op)"
              v-model="rule.value"
              :placeholder="LIST_OPS.has(rule.op) ? 'a, b, c' : 'value'"
              size="sm"
              class="col-span-3"
            />
            <div v-else class="col-span-3" />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              size="xs"
              class="col-span-1 justify-self-end"
              @click="removeRule(i)"
            />
          </div>
        </div>

        <UButton
          icon="i-lucide-plus"
          variant="soft"
          color="neutral"
          size="xs"
          label="Add rule"
          @click="addRule"
        />

        <p class="text-[12px] text-muted">
          Fields: <code>email</code>, <code>name</code>, <code>status</code>, or any
          subscriber attribute (e.g. <code>plan</code>, <code>attribs.city</code>).
        </p>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="open = false"
          />
          <UButton
            color="primary"
            label="Save audience"
            :loading="saving"
            @click="save()"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
