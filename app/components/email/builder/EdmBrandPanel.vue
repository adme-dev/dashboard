<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { useEdmDesignBrand } from '~~/app/composables/useEdmDesignBrand'
import type { TemplateDesignDraftRead } from '~~/server/utils/email-marketing/designReads'

const props = defineProps<{ flow: ReturnType<typeof useEdmDesignBrand>, draftId: string, blocked: boolean }>()
const emit = defineEmits<{ saved: [draft: Extract<TemplateDesignDraftRead, { state: 'structured' }>] }>()
const kitId = ref('__none__')
const blockId = ref('__none__')
const field = ref('__block__')
const options = computed(() => props.flow.options.value)
const kits = computed(() => [{ label: 'Choose a brand kit', value: '__none__' }, ...(options.value?.kits ?? []).map(kit => ({ label: `${kit.name}${kit.shared ? ' (shared)' : ''}${kit.isDefault ? ' · default' : ''}`, value: kit.id }))])
const selected = computed(() => options.value?.kits.find(kit => kit.id === kitId.value))
const block = computed(() => options.value?.lockTargets.find(target => target.blockId === blockId.value))
const blocks = computed(() => [{ label: 'Choose a saved block', value: '__none__' }, ...(options.value?.lockTargets ?? []).map(target => ({ label: `${target.type} · ${target.blockId}`, value: target.blockId }))])
const fields = computed(() => [{ label: 'Entire block design', value: '__block__' }, ...(block.value?.styleFields ?? []).map(path => ({ label: path.replace(/^data\./, ''), value: path }))])
const locked = computed(() => field.value === '__block__' ? block.value?.locked : block.value?.lockedStyleFields.includes(field.value))
const disabled = computed(() => props.blocked || props.flow.busy.value || props.flow.hasPending.value)
watch(() => props.draftId, async (id) => {
  await props.flow.load(id)
  kitId.value = options.value?.brand?.kitId ?? options.value?.defaultKitId ?? '__none__'
}, { immediate: true })
watch(blockId, () => {
  field.value = '__block__'
})
async function apply() {
  const draft = await props.flow.applyBrand(kitId.value)
  if (draft) emit('saved', draft)
}
async function toggleLock() {
  if (!block.value) return
  const draft = await props.flow.setLock(field.value === '__block__'
    ? { blockId: block.value.blockId, target: 'block', locked: !locked.value }
    : { blockId: block.value.blockId, target: 'style', field: field.value, locked: !locked.value })
  if (draft) emit('saved', draft)
}
</script>

<template>
  <div class="@container space-y-6 p-5">
    <UAlert v-if="flow.error.value" color="warning" :title="flow.error.value" />
    <section class="space-y-4">
      <div>
        <h3 class="font-semibold text-highlighted">
          Brand defaults
        </h3>
        <p class="mt-1 text-sm text-muted">
          Apply a saved brand to new blocks. Existing content and design stay as authored.
        </p>
      </div>
      <p v-if="options?.brand" class="text-sm text-muted">
        Applied: {{ options.brand.name }} · version {{ options.brand.version }}
      </p>
      <UFormField label="Brand kit">
        <USelect
          v-model="kitId"
          :items="kits"
          class="w-full"
          :disabled="disabled || !options"
        />
      </UFormField>
      <div v-if="selected" class="space-y-2 border-l-2 border-default pl-3 text-sm">
        <p class="flex items-center gap-2">
          <span class="size-4 rounded border border-default" :style="{ backgroundColor: selected.defaults.primaryColor }" />{{ selected.defaults.primaryColor }}
        </p>
        <p>{{ selected.defaults.fontFamily.replaceAll('_', ' ').toLowerCase() }} · {{ selected.defaults.contentWidth }} px default width</p>
        <p class="text-muted">
          {{ selected.defaults.fontFallback ? `${selected.defaults.requestedFont || 'No brand font'} uses the supported Modern Sans fallback.` : 'Uses a supported email font stack.' }} Uploaded fonts are not embedded; appearance depends on the recipient’s email app.
        </p>
      </div>
      <UButton
        label="Apply brand to new blocks"
        icon="i-lucide-palette"
        :disabled="disabled || !selected"
        :loading="flow.busy.value"
        @click="apply"
      />
    </section>
    <section v-if="options?.canManageLocks" class="space-y-4 border-t border-default pt-5">
      <div>
        <h3 class="font-semibold text-highlighted">
          Design locks
        </h3>
        <p class="mt-1 text-sm text-muted">
          Protect layout and styling while keeping existing text and link editing permissions. Locks also cover nested blocks and mobile styles.
        </p>
      </div>
      <UFormField label="Saved block">
        <USelect
          v-model="blockId"
          :items="blocks"
          class="w-full"
          :disabled="disabled"
        />
      </UFormField>
      <UFormField label="Design to protect">
        <USelect
          v-model="field"
          :items="fields"
          class="w-full"
          :disabled="disabled || !block"
        />
      </UFormField>
      <UButton
        :label="locked ? 'Remove selected design lock' : 'Lock selected design'"
        :icon="locked ? 'i-lucide-lock-open' : 'i-lucide-lock-keyhole'"
        color="neutral"
        variant="outline"
        :disabled="disabled || !block"
        @click="toggleLock"
      />
      <p class="text-xs text-muted">
        Legal content, linked modules and other protected content retain their independent restrictions.
      </p>
    </section>
  </div>
</template>
