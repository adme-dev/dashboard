<script setup lang="ts">
import type {
  AiDepartmentDraftSeedInput,
  AiDepartmentDraftSeedResult,
  AiDepartmentReadinessItem
} from '~/types/aiGovernance'

const props = defineProps<{
  open: boolean
  item: AiDepartmentReadinessItem | null
  onSeed: (input: AiDepartmentDraftSeedInput) => Promise<AiDepartmentDraftSeedResult>
}>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const reason = ref('')
const confirmation = ref('')
const pending = ref(false)
const result = ref<AiDepartmentDraftSeedResult | null>(null)
const error = ref<string | null>(null)

const OWNER_RESOLUTION_STATUSES = new Set<AiDepartmentReadinessItem['status']>([
  'ready_for_owner_confirmation',
  'missing_owner',
  'owner_inactive',
  'owner_not_member'
])

const canSeed = computed(() => Boolean(
  props.item
  && OWNER_RESOLUTION_STATUSES.has(props.item.status)
  && props.item.department
  && props.item.ownerCandidate
  && reason.value.trim().length >= 10
  && confirmation.value === 'SEED_DRAFT'
  && !pending.value
  && !result.value
))

watch(
  () => [props.open, props.item?.key] as const,
  ([open]) => {
    if (!open) return
    reason.value = ''
    confirmation.value = ''
    pending.value = false
    result.value = null
    error.value = null
  }
)

function errorMessage(caught: unknown) {
  const value = caught as { data?: { statusMessage?: string } } | null
  return value?.data?.statusMessage || 'The draft pack could not be seeded.'
}

async function seed() {
  const item = props.item
  if (!canSeed.value || !item?.department || !item.ownerCandidate) return

  pending.value = true
  error.value = null
  try {
    result.value = await props.onSeed({
      blueprintKey: item.key,
      departmentId: item.department.id,
      ownerUserId: item.ownerCandidate.id,
      reason: reason.value.trim()
    })
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Confirm owner and seed draft"
    description="Create one dormant department-pack draft for governance review."
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div v-if="item" class="@container space-y-4">
        <UAlert
          color="warning"
          variant="soft"
          icon="i-lucide-shield-alert"
          title="Draft only — no runtime access"
          description="No model is called, no pilot is assigned, no release is activated, and no notification is sent."
        />

        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div class="rounded-lg bg-elevated p-3">
            <dt class="text-xs font-medium text-muted">
              Department
            </dt>
            <dd class="mt-1 text-default">
              {{ item.department?.name ?? 'Unavailable' }}
            </dd>
          </div>
          <div class="rounded-lg bg-elevated p-3">
            <dt class="text-xs font-medium text-muted">
              Selected owner
            </dt>
            <dd class="mt-1 text-default">
              {{ item.ownerCandidate?.name ?? 'Unavailable' }}
            </dd>
          </div>
        </dl>

        <UFormField
          label="Audit reason"
          help="Minimum 10 characters; stored in the append-only governance audit."
        >
          <UTextarea
            id="seed-draft-reason"
            v-model="reason"
            data-testid="seed-draft-reason"
            :rows="3"
            :maxlength="2000"
            :disabled="pending || Boolean(result)"
            placeholder="Record who approved this owner and why the draft is being created."
            class="w-full"
          />
        </UFormField>

        <UFormField label="Confirmation" help="Type SEED_DRAFT to confirm and enable draft creation.">
          <UInput
            id="seed-draft-confirmation"
            v-model="confirmation"
            data-testid="seed-draft-confirmation"
            autocomplete="off"
            spellcheck="false"
            :disabled="pending || Boolean(result)"
            placeholder="SEED_DRAFT"
            class="w-full font-mono"
          />
        </UFormField>

        <div
          v-if="error"
          role="alert"
          aria-live="assertive"
          class="rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error"
        >
          {{ error }}
        </div>

        <UAlert
          v-if="result"
          color="success"
          variant="soft"
          icon="i-lucide-file-check-2"
          :title="result.outcome === 'created' ? 'Draft pack created' : 'Draft pack already exists'"
          description="The pack remains dormant until exact-version evaluation evidence and a separately approved release transition exist."
        />

        <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton color="neutral" variant="ghost" @click="emit('update:open', false)">
            {{ result ? 'Done' : 'Cancel' }}
          </UButton>
          <UButton
            v-if="!result"
            data-testid="seed-draft-submit"
            icon="i-lucide-file-plus-2"
            color="warning"
            :loading="pending"
            :disabled="!canSeed"
            @click="seed"
          >
            Seed dormant draft
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
