<script setup lang="ts">
// Manual recommendation creation. Two-tier form: 5 fields visible by
// default, advanced disclosure for the rest. Parent owns open state
// and refreshes the list after a successful create via the @created
// event.

import { CATEGORIES, CATEGORY_LABELS } from '~~/server/utils/advisorCategories'

type CreatedRec = {
  id: string
  [key: string]: any
}

type ClientOption = { id: string; name: string }
type TeamMember = { id: string; name: string }

const props = defineProps<{
  open: boolean
  clients: ClientOption[]
  teamMembers: TeamMember[]
  metricKeys: Array<{ key: string; label: string }>
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'created', rec: CreatedRec): void
}>()

// ── Form state ─────────────────────────────────────────────────────
const AGENCY = '__agency__'
const NONE = '__none__'

const title = ref('')
const action = ref('')
const category = ref<string>(NONE)
const priority = ref<'low' | 'medium' | 'high'>('medium')
const clientId = ref<string>(AGENCY)

const showAdvanced = ref(false)
const impact = ref('')
const effort = ref<string>(NONE)
const targetMetric = ref<string>(NONE)
const targetDirection = ref<'up' | 'down' | null>(null)
const dueDate = ref('')
const assignedTo = ref<string>(NONE)

const submitting = ref(false)
const errorMsg = ref<string | null>(null)
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

// ── Derived options ─────────────────────────────────────────────────
const CATEGORY_OPTIONS = [
  { value: NONE, label: '— Uncategorized —' },
  ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

const EFFORT_OPTIONS = [
  { value: NONE, label: '— Not sized —' },
  { value: 'xs', label: 'XS' },
  { value: 's', label: 'S' },
  { value: 'm', label: 'M' },
  { value: 'l', label: 'L' },
  { value: 'xl', label: 'XL' },
]

const clientOptions = computed(() => ([
  { value: AGENCY, label: 'Agency (own books)' },
  ...props.clients.map((c) => ({ value: c.id, label: c.name })),
]))

const metricOptions = computed(() => ([
  { value: NONE, label: '— No tracked metric —' },
  ...props.metricKeys.map((m) => ({ value: m.key, label: m.label })),
]))

const assigneeOptions = computed(() => ([
  { value: NONE, label: 'Unassigned' },
  ...props.teamMembers.map((m) => ({ value: m.id, label: m.name })),
]))

// ── Submit ─────────────────────────────────────────────────────────
const canSubmit = computed(() =>
  title.value.trim().length > 0 && action.value.trim().length > 0 && !submitting.value
)

function reset() {
  title.value = ''
  action.value = ''
  category.value = NONE
  priority.value = 'medium'
  clientId.value = AGENCY
  showAdvanced.value = false
  impact.value = ''
  effort.value = NONE
  targetMetric.value = NONE
  targetDirection.value = null
  dueDate.value = ''
  assignedTo.value = NONE
  errorMsg.value = null
}

function setOpen(v: boolean) {
  emit('update:open', v)
  if (!v) reset()
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  errorMsg.value = null
  try {
    const body: Record<string, any> = {
      title: title.value.trim(),
      action: action.value.trim(),
      priority: priority.value,
    }
    if (category.value !== NONE) body.category = category.value
    if (clientId.value !== AGENCY) body.client_id = clientId.value
    if (impact.value.trim()) body.impact = impact.value.trim()
    if (effort.value !== NONE) body.effort = effort.value
    if (targetMetric.value !== NONE) body.target_metric = targetMetric.value
    if (targetDirection.value) body.target_direction = targetDirection.value
    if (dueDate.value) body.due_date = dueDate.value
    if (assignedTo.value !== NONE) body.assigned_to = assignedTo.value

    const res = await apiFetch<{ recommendation: CreatedRec }>(
      '/api/advisor/recommendations',
      { method: 'POST', body }
    )
    toast.add({ title: 'Recommendation created', color: 'success' })
    emit('created', res.recommendation)
    setOpen(false)
  } catch (err: any) {
    errorMsg.value = err?.data?.statusMessage ?? err?.message ?? 'Failed to create'
    toast.add({ title: 'Create failed', description: errorMsg.value ?? undefined, color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal :open="open" :ui="{ content: 'max-w-lg' }" @update:open="setOpen">
    <template #content>
      <div class="p-5 space-y-4">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="font-semibold text-lg">New recommendation</h3>
            <p class="text-xs text-muted">Capture an observation or action item alongside the AI's.</p>
          </div>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="setOpen(false)" />
        </div>

        <UAlert
          v-if="errorMsg"
          color="error"
          variant="subtle"
          :description="errorMsg"
        />

        <!-- Visible fields -->
        <div class="space-y-3">
          <div>
            <label class="text-xs text-muted mb-1 block">Title <span class="text-red-500">*</span></label>
            <UInput v-model="title" placeholder="Short summary" size="sm" />
          </div>
          <div>
            <label class="text-xs text-muted mb-1 block">Action <span class="text-red-500">*</span></label>
            <UTextarea v-model="action" :rows="4" size="sm" placeholder="What concretely needs to happen?" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-muted mb-1 block">Category</label>
              <USelectMenu
                v-model="category"
                :items="CATEGORY_OPTIONS"
                value-key="value"
                size="sm"
              />
            </div>
            <div>
              <label class="text-xs text-muted mb-1 block">Priority</label>
              <USelectMenu
                v-model="priority"
                :items="PRIORITY_OPTIONS"
                value-key="value"
                size="sm"
              />
            </div>
          </div>
          <div>
            <label class="text-xs text-muted mb-1 block">Client / scope</label>
            <USelectMenu
              v-model="clientId"
              :items="clientOptions"
              value-key="value"
              size="sm"
            />
          </div>
        </div>

        <!-- Advanced disclosure -->
        <button
          type="button"
          class="text-xs text-muted hover:text-default flex items-center gap-1"
          @click="showAdvanced = !showAdvanced"
        >
          <UIcon :name="showAdvanced ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
          {{ showAdvanced ? 'Hide advanced' : 'Show advanced' }}
        </button>

        <div v-if="showAdvanced" class="space-y-3 pt-1 border-t border-default">
          <div>
            <label class="text-xs text-muted mb-1 block">Expected impact</label>
            <UInput v-model="impact" placeholder="e.g. Save $4k/month, reduce DSO by 10 days" size="sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-muted mb-1 block">Effort</label>
              <USelectMenu
                v-model="effort"
                :items="EFFORT_OPTIONS"
                value-key="value"
                size="sm"
              />
            </div>
            <div>
              <label class="text-xs text-muted mb-1 block">Due date</label>
              <UInput v-model="dueDate" type="date" size="sm" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-muted mb-1 block">Target metric</label>
              <USelectMenu
                v-model="targetMetric"
                :items="metricOptions"
                value-key="value"
                size="sm"
              />
            </div>
            <div>
              <label class="text-xs text-muted mb-1 block">Direction</label>
              <UButtonGroup>
                <UButton
                  :color="targetDirection === 'up' ? 'primary' : 'neutral'"
                  :variant="targetDirection === 'up' ? 'solid' : 'outline'"
                  size="sm"
                  icon="i-lucide-arrow-up-right"
                  @click="targetDirection = targetDirection === 'up' ? null : 'up'"
                >Up</UButton>
                <UButton
                  :color="targetDirection === 'down' ? 'primary' : 'neutral'"
                  :variant="targetDirection === 'down' ? 'solid' : 'outline'"
                  size="sm"
                  icon="i-lucide-arrow-down-right"
                  @click="targetDirection = targetDirection === 'down' ? null : 'down'"
                >Down</UButton>
              </UButtonGroup>
            </div>
          </div>
          <div>
            <label class="text-xs text-muted mb-1 block">Assignee</label>
            <USelectMenu
              v-model="assignedTo"
              :items="assigneeOptions"
              value-key="value"
              size="sm"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="flex justify-end gap-2 pt-2 border-t border-default">
          <UButton variant="ghost" color="neutral" size="sm" @click="setOpen(false)">Cancel</UButton>
          <UButton
            color="primary"
            size="sm"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="submit"
          >Create</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
