<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { EDM_CONDITION_AUTHORING } from '~~/app/composables/useEdmConditions'
import {
  parseContentCondition,
  type ContentCondition,
  type ConditionPredicate
} from '~~/shared/emailRendering/conditions'

const props = defineProps<{
  condition?: unknown
  eligible: boolean
  ready: boolean
  pending?: boolean
}>()
const emit = defineEmits<{
  apply: [value: ContentCondition | null]
  reconcile: []
}>()
const authoring = inject(EDM_CONDITION_AUTHORING, null)
const open = ref(false)
const confirmDelete = ref(false)
const selected = ref('__new__')
const name = ref('')
const predicate = ref<ConditionPredicate>({ field: 'first_name', op: 'exists' })
const current = computed(() => {
  try {
    return parseContentCondition(props.condition)
  } catch {
    return null
  }
})
const choices = computed(() => [
  { label: 'New condition', value: '__new__' },
  ...(authoring?.definitions.value ?? []).map(value => ({
    label: value.name,
    value: value.id
  }))
])
const valid = computed(() => {
  try {
    return parseContentCondition({
      version: 1,
      name: name.value,
      predicate: predicate.value
    })
  } catch {
    return null
  }
})
const editable = computed(
  () =>
    !!authoring?.canEdit.value
    && props.eligible
    && props.ready
    && !authoring.busy.value
    && !props.pending
)
function initialise() {
  selected.value = '__new__'
  name.value = current.value?.name ?? ''
  predicate.value = JSON.parse(
    JSON.stringify(
      current.value?.predicate ?? { field: 'first_name', op: 'exists' }
    )
  )
}
watch(open, (value) => {
  if (value) initialise()
})
watch(
  () => authoring?.clientId.value,
  () => {
    open.value = false
    confirmDelete.value = false
    initialise()
  }
)
function choose(id: string) {
  selected.value = id
  const definition = authoring?.definitions.value.find(
    value => value.id === id
  )
  if (definition) {
    name.value = definition.name
    predicate.value = JSON.parse(JSON.stringify(definition.predicate))
  } else initialise()
}
async function saveDefinition() {
  if (!editable.value || !valid.value || !authoring?.clientId.value) return
  const saved = await authoring.save(
    {
      client_id: authoring.clientId.value,
      name: valid.value.name,
      predicate: valid.value.predicate
    },
    selected.value === '__new__' ? undefined : selected.value
  )
  if (saved && selected.value === '__new__') selected.value = authoring.definitions.value.find(value => value.name === valid.value?.name)?.id ?? '__new__'
}
function apply(value: ContentCondition | null) {
  if (!editable.value) return
  emit('apply', value)
  open.value = false
}
async function removeDefinition() {
  if (editable.value && selected.value !== '__new__')
    await authoring?.remove(selected.value)
  confirmDelete.value = false
  initialise()
}
</script>

<template>
  <section class="space-y-2 border-b border-default pb-4">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-medium">Show to recipients</span>
      <UBadge
        v-if="current"
        icon="i-lucide-list-filter"
        variant="soft"
        size="sm"
      >
        {{ current.name }}
      </UBadge>
    </div>
    <p class="text-xs text-muted">
      {{
        current
          ? 'This block uses a saved copy of its rules.'
          : 'Everyone sees this block.'
      }}
    </p>
    <UButton
      v-if="editable"
      :label="current ? 'Edit condition' : 'Add condition'"
      size="xs"
      variant="soft"
      icon="i-lucide-list-filter"
      @click="open = true"
    />
    <UButton
      v-if="pending"
      label="Reconcile condition save"
      size="xs"
      variant="soft"
      @click="emit('reconcile')"
    />
    <p v-if="!eligible" class="text-xs text-muted">
      Required, legal, locked and linked content stays visible, including its
      enclosing sections.
    </p>
    <p v-else-if="!editable && !pending" class="text-xs text-muted">
      Condition edits require a saved client design draft and current designer
      access. Save content changes first.
    </p>
    <UAlert
      v-if="authoring?.error.value"
      :description="authoring.error.value"
      color="error"
      variant="soft"
      :actions="[{ label: 'Retry', onClick: authoring.load }]"
    />
    <UModal
      v-model:open="open"
      title="Recipient condition"
      description="Use email address, full name or first name. Rules are copied into this saved block."
    >
      <template #body>
        <div class="@container max-h-[65svh] overflow-y-auto space-y-4">
          <UFormField label="Client conditions">
            <USelect
              :model-value="selected"
              :items="choices"
              class="w-full"
              @update:model-value="choose(String($event))"
            />
          </UFormField>
          <UFormField label="Condition name">
            <UInput
              v-model="name"
              :maxlength="100"
              class="w-full"
            />
          </UFormField>
          <EmailBuilderEdmConditionPredicateEditor v-model="predicate" />
          <p v-if="!valid" class="text-xs text-error">
            Enter a name and plain comparison text. Use up to 24 terms and four
            levels.
          </p>
          <p class="text-xs text-muted">
            Changing a client condition does not change existing blocks or
            frozen campaigns. Apply a new copy to update this block.
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              :label="
                selected === '__new__'
                  ? 'Save to client conditions'
                  : 'Update client condition'
              "
              variant="outline"
              color="neutral"
              :disabled="!editable || !valid"
              :loading="authoring?.busy.value"
              @click="saveDefinition"
            />
            <UButton
              v-if="selected !== '__new__'"
              label="Delete client condition"
              variant="ghost"
              color="error"
              :disabled="!editable"
              @click="confirmDelete = true"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap justify-end gap-2">
          <UButton
            v-if="current"
            label="Show to everyone"
            variant="ghost"
            color="neutral"
            :disabled="!editable"
            @click="apply(null)"
          />
          <UButton
            label="Apply to block"
            :disabled="!editable || !valid"
            @click="valid && apply(valid)"
          />
        </div>
      </template>
    </UModal>
    <UModal
      v-model:open="confirmDelete"
      title="Delete client condition?"
      description="Existing blocks and frozen campaigns keep their copied rules."
    >
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="confirmDelete = false"
        /><UButton
          label="Delete condition"
          color="error"
          :disabled="!editable"
          @click="removeDefinition"
        />
      </template>
    </UModal>
  </section>
</template>
