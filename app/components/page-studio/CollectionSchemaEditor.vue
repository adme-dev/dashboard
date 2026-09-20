<script setup lang="ts">
import type { CollectionDefinition, CollectionField } from '~~/shared/pageStudio/collectionDefinition'

const props = defineProps<{ definition?: CollectionDefinition, saving?: boolean }>()
const emit = defineEmits<{ save: [body: unknown], dirty: [value: boolean] }>()
const source = () =>
  props.definition
    ? structuredClone(toRaw(props.definition))
    : {
        id: '',
        label: '',
        displayFieldId: 'name',
        formatVersion: 1 as const,
        version: 1,
        fields: [
          {
            id: 'name',
            label: 'Name',
            type: 'text',
            required: true,
            visibility: 'private',
            maxLength: 120
          } as CollectionField
        ]
      }
const draft = ref(source())
const baseline = ref(JSON.stringify(draft.value))
watch(
  () => props.definition,
  () => {
    draft.value = source()
    baseline.value = JSON.stringify(draft.value)
  }
)
watch(draft, () => emit('dirty', JSON.stringify(draft.value) !== baseline.value), { deep: true })
const types = ['text', 'integer', 'boolean', 'date', 'instant', 'decimal', 'enum'].map(value => ({
  label: {
    text: 'Text',
    integer: 'Whole number',
    boolean: 'Yes / no',
    date: 'Date',
    instant: 'Date and time',
    decimal: 'Decimal',
    enum: 'Choice'
  }[value],
  value
}))
function setType(index: number, type: CollectionField['type']) {
  const field = draft.value.fields[index]!
  const common = { id: field.id, label: field.label, required: field.required, visibility: field.visibility }
  draft.value.fields[index]
    = type === 'decimal'
      ? { ...common, type, precision: 12, scale: 2 }
      : type === 'enum'
        ? { ...common, type, options: [{ id: 'option_one', label: 'Option one' }] }
        : ({ ...common, type } as CollectionField)
}
function add() {
  draft.value.fields.push({
    id: `field_${draft.value.fields.length + 1}`,
    label: 'New field',
    type: 'text',
    required: false,
    visibility: 'private'
  })
}
function submit() {
  const { scope: _scope, ...definition } = draft.value as CollectionDefinition
  emit('save', {
    definition: { ...definition, version: (props.definition?.version ?? 0) + 1 },
    expectedVersion: props.definition?.version ?? 0
  })
}
</script>

<template>
  <div class="@container space-y-6">
    <p class="max-w-2xl text-sm text-muted">
      Define the fields editors can save. Existing field types, required values and choices are protected;
      incompatible changes need a separate migration.
    </p>
    <fieldset :disabled="saving" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField
        label="Collection name"
        required
      >
        <UInput
          v-model="draft.label"
          :maxlength="120"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Collection ID"
        required
        description="Lowercase letters, numbers and underscores. Cannot change after creation."
      >
        <UInput
          v-model="draft.id"
          :disabled="!!definition"
          :maxlength="64"
          class="w-full"
        />
      </UFormField>
      <UFormField
        label="Entry label field"
        required
        class="@lg:col-span-2"
      >
        <USelect
          v-model="draft.displayFieldId"
          :items="
            draft.fields
              .filter((field) => field.id)
              .map((field) => ({ label: field.label || field.id, value: field.id }))
          "
          class="w-full"
        />
      </UFormField>
    </fieldset>
    <div v-for="(field, index) in draft.fields" :key="index" class="border-t border-default pt-5">
      <fieldset :disabled="saving" class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField
          label="Field name"
          required
        >
          <UInput
            v-model="field.label"
            :maxlength="120"
            class="w-full"
          />
        </UFormField>
        <UFormField
          label="Field ID"
          required
        >
          <UInput
            v-model="field.id"
            :disabled="!!definition?.fields.some((saved) => saved.id === field.id)"
            :maxlength="64"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Field type">
          <USelect
            :model-value="field.type"
            :items="types"
            class="w-full"
            @update:model-value="setType(index, $event as CollectionField['type'])"
          />
        </UFormField>
        <UFormField label="Visibility">
          <USelect
            v-model="field.visibility"
            :items="[
              { label: 'Private', value: 'private' },
              { label: 'Public', value: 'public' }
            ]"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Validation">
          <UCheckbox
            v-model="field.required"
            label="Required value"
          />
        </UFormField>
        <UFormField
          v-if="field.type === 'text'"
          label="Maximum characters"
        >
          <UInput
            v-model.number="field.maxLength"
            type="number"
            :min="1"
            :max="4000"
            class="w-full"
          />
        </UFormField>
        <template v-if="field.type === 'integer'">
          <UFormField label="Minimum">
            <UInput v-model.number="field.min" type="number" class="w-full" />
          </UFormField><UFormField label="Maximum">
            <UInput v-model.number="field.max" type="number" class="w-full" />
          </UFormField>
        </template>
        <template v-if="field.type === 'decimal'">
          <UFormField label="Total digits">
            <UInput
              v-model.number="field.precision"
              type="number"
              :min="1"
              :max="18"
              class="w-full"
            />
          </UFormField><UFormField label="Decimal places">
            <UInput
              v-model.number="field.scale"
              type="number"
              :min="0"
              :max="6"
              class="w-full"
            />
          </UFormField>
        </template>
        <div v-if="field.type === 'enum'" class="space-y-3 @lg:col-span-2">
          <div
            v-for="(option, optionIndex) in field.options"
            :key="optionIndex"
            class="grid grid-cols-1 gap-3 @lg:grid-cols-2"
          >
            <UFormField :label="`Choice ${optionIndex + 1} label`">
              <UInput
                v-model="option.label"
                class="w-full"
              />
            </UFormField>
            <UFormField :label="`Choice ${optionIndex + 1} ID`">
              <UInput
                v-model="option.id"
                class="w-full"
              />
            </UFormField>
          </div>
          <UButton
            label="Add choice"
            color="neutral"
            variant="outline"
            :disabled="field.options.length >= 100"
            @click="() => { field.options.push({ id: `option_${field.options.length + 1}`, label: 'New choice' }) }"
          />
        </div>
      </fieldset>
    </div>
    <div class="flex flex-wrap gap-3">
      <UButton
        label="Add field"
        color="neutral"
        variant="outline"
        :disabled="saving || draft.fields.length >= 30"
        @click="add"
      /><UButton
        label="Save collection schema"
        :loading="saving"
        :disabled="!draft.id || !draft.label"
        @click="submit"
      />
    </div>
  </div>
</template>
