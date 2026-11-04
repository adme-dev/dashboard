<script setup lang="ts">
import { inject, ref, watch, computed } from 'vue'
import { EDM_MERGE_AUTHORING } from '~~/app/composables/useEdmMergeTags'
import { MergeDefinitionInputSchema, mergeDefinitionToken, type MergeDefinition } from '~~/shared/emailRendering/mergeTagDefinitions'

const authoring = inject(EDM_MERGE_AUTHORING)!
const editingId = ref<string | undefined>()
const form = ref({ name: '', token: 'custom_', preview_value: '', fallback: '' })
const deleting = ref<MergeDefinition | null>(null)
const validation = ref('')
const input = computed(() => ({ ...form.value, client_id: authoring.clientId.value || '' }))
function reset() {
  editingId.value = undefined
  form.value = { name: '', token: 'custom_', preview_value: '', fallback: '' }
  validation.value = ''
}
function edit(item: MergeDefinition) {
  editingId.value = item.id
  form.value = { name: item.name, token: item.token, preview_value: item.preview_value, fallback: item.fallback }
  validation.value = ''
}
watch(authoring.clientId, () => {
  reset()
  deleting.value = null
})
async function save() {
  const parsed = MergeDefinitionInputSchema.safeParse(input.value)
  if (!parsed.success) {
    validation.value = 'Enter a name, a custom_ token, and a fallback of 1–200 characters without &, <, >, braces, pipes or line breaks.'
    return
  }
  if (await authoring.save(parsed.data, editingId.value)) reset()
}
async function remove() {
  if (deleting.value) await authoring.remove(deleting.value.id)
  deleting.value = null
}
</script>

<template>
  <div class="@container space-y-5">
    <p class="text-sm text-muted">
      Client tags are reusable writing shortcuts. Their sample values never become recipient data. Inserted tags keep their original fallback when this catalog changes.
    </p>
    <UAlert v-if="!authoring.clientId.value" title="Choose a client in Save settings to manage its tags." color="neutral" />
    <UAlert v-if="authoring.error.value" :title="authoring.error.value" color="error" />
    <UButton
      v-if="authoring.error.value"
      label="Retry loading tags"
      variant="soft"
      :loading="authoring.loading.value"
      @click="authoring.load()"
    />
    <template v-if="authoring.clientId.value">
      <div class="max-h-52 overflow-y-auto divide-y divide-default">
        <div v-for="item in authoring.definitions.value" :key="item.id" class="flex items-start gap-2 py-3">
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">
              {{ item.name }}
            </p><p class="break-all text-xs text-muted font-mono">
              {{ mergeDefinitionToken(item) }}
            </p><p class="text-xs text-muted">
              Sample: {{ item.preview_value || '(empty — fallback applies)' }}
            </p>
          </div>
          <UButton
            label="Edit"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="authoring.busy.value"
            @click="edit(item)"
          />
          <UButton
            icon="i-lucide-trash-2"
            aria-label="Delete tag"
            color="error"
            variant="ghost"
            size="xs"
            :disabled="authoring.busy.value"
            @click="deleting = item"
          />
        </div>
        <p v-if="!authoring.loading.value && !authoring.definitions.value.length" class="text-sm text-muted py-2">
          No custom tags for this client yet.
        </p>
      </div>
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Name">
          <UInput v-model="form.name" class="w-full" :maxlength="100" />
        </UFormField>
        <UFormField label="Token" help="Start with custom_, then lowercase letters, numbers or underscores.">
          <UInput
            v-model="form.token"
            :disabled="!!editingId"
            class="w-full"
            :maxlength="63"
          />
        </UFormField>
        <UFormField label="Sample value" help="Only used by Preview as samples.">
          <UInput v-model="form.preview_value" class="w-full" :maxlength="256" />
        </UFormField>
        <UFormField label="Delivery fallback" help="Literal text written into every inserted token; no HTML or &, braces or pipes.">
          <UInput v-model="form.fallback" class="w-full" :maxlength="200" />
        </UFormField>
      </div>
      <UAlert v-if="validation" :title="validation" color="error" />
      <div class="flex justify-end gap-2">
        <UButton
          v-if="editingId"
          label="Cancel edit"
          variant="ghost"
          color="neutral"
          @click="reset"
        /><UButton
          :label="editingId ? 'Save tag' : 'Create tag'"
          :loading="authoring.busy.value"
          :disabled="authoring.loading.value || !!authoring.error.value"
          @click="save"
        />
      </div>
    </template>
    <UModal :open="!!deleting" title="Delete merge tag?" @update:open="!$event && (deleting = null)">
      <template #body>
        <p class="text-sm">
          Existing email content keeps this tag and its fallback. Only the client catalog entry will be deleted.
        </p>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="deleting = null"
        /><UButton
          label="Delete tag"
          color="error"
          :loading="authoring.busy.value"
          @click="remove"
        />
      </template>
    </UModal>
  </div>
</template>
