<script setup lang="ts">
const props = defineProps<{
  open: boolean
  item: any
  categoryName: string
  categoryOptions: { label: string; value: string }[]
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown, query?: Record<string, unknown> }) => Promise<T>

type UiColor = 'error' | 'info' | 'success' | 'primary' | 'secondary' | 'warning' | 'neutral'

interface RateCardAuditEntry {
  id: string
  itemId: string
  itemName: string
  action: string
  fieldName: string | null
  oldValue: string | null
  newValue: string | null
  changedAt: string
  changedByName: string | null
}

const localOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

// Full editable form
const form = ref({
  serviceName: '',
  categoryId: '',
  price: 0,
  priceUnit: 'once-off',
  setupFee: 0,
  setupNotes: '',
  notes: '',
  description: '',
})

const priceUnitOptions = [
  { label: 'Once-off', value: 'once-off' },
  { label: 'Per Month', value: 'per-month' },
  { label: 'Per Hour', value: 'per-hour' },
  { label: 'Per Unit', value: 'per-unit' },
  { label: 'POA', value: 'POA' },
]

// Sync form when item changes
watch(() => props.item, (item) => {
  if (item) {
    form.value = {
      serviceName: item.serviceName || '',
      categoryId: item.categoryId || '',
      price: item.price || 0,
      priceUnit: item.priceUnit || 'once-off',
      setupFee: item.setupFee || 0,
      setupNotes: item.setupNotes || '',
      notes: item.notes || '',
      description: item.description || '',
    }
  }
}, { immediate: true })

// Description contenteditable
const descriptionRef = ref<HTMLElement | null>(null)
const descriptionFocused = ref(false)

function onDescriptionInput(e: Event) {
  const el = e.target as HTMLElement
  form.value.description = el.innerText
}

function focusDescription() {
  descriptionFocused.value = true
  nextTick(() => {
    descriptionRef.value?.focus()
  })
}

// Sync contenteditable when form.description changes externally (AI generate)
watch(() => form.value.description, (val) => {
  if (descriptionRef.value && !descriptionFocused.value) {
    descriptionRef.value.innerText = val
  }
})

// Also set content when slideover opens
watch(() => props.open, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      if (descriptionRef.value) {
        descriptionRef.value.innerText = form.value.description
      }
    })
  }
})

// Save
const saving = ref(false)
const hasChanges = computed(() => {
  if (!props.item) return false
  return form.value.serviceName !== (props.item.serviceName || '')
    || form.value.categoryId !== (props.item.categoryId || '')
    || form.value.price !== (props.item.price || 0)
    || form.value.priceUnit !== (props.item.priceUnit || 'once-off')
    || form.value.setupFee !== (props.item.setupFee || 0)
    || form.value.setupNotes !== (props.item.setupNotes || '')
    || form.value.notes !== (props.item.notes || '')
    || form.value.description !== (props.item.description || '')
})

async function save() {
  if (!props.item) return
  saving.value = true
  try {
    await apiFetch(`/api/agency/rate-cards/${props.item.id}`, {
      method: 'PATCH',
      body: form.value,
    })
    toast.add({ title: 'Saved', description: `"${form.value.serviceName}" updated`, color: 'success' })
    emit('saved')
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to save', color: 'error' })
  } finally {
    saving.value = false
  }
}

// AI description generation
const generating = ref(false)

async function generateDescription() {
  if (!props.item) return
  generating.value = true
  try {
    const result = await apiFetch<{ description: string }>('/api/agency/rate-cards/generate-description', {
      method: 'POST',
      body: {
        serviceName: form.value.serviceName,
        categoryName: props.categoryName,
        price: form.value.price,
        priceUnit: form.value.priceUnit,
        setupFee: form.value.setupFee,
        setupNotes: form.value.setupNotes,
        notes: form.value.notes,
      },
    })
    if (result.description) {
      form.value.description = result.description
      toast.add({ title: 'Generated', description: 'AI description ready — review and save', color: 'success' })
    }
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to generate description', color: 'error' })
  } finally {
    generating.value = false
  }
}

// Format helpers
function formatPriceDisplay() {
  if (form.value.priceUnit === 'POA') return 'POA'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(form.value.price)
}

// Audit history
const auditData = ref<{ entries: RateCardAuditEntry[] } | null>(null)

watch(() => props.item?.id, async (itemId) => {
  if (!itemId) {
    auditData.value = null
    return
  }
  auditData.value = await apiFetch<{ entries: RateCardAuditEntry[] }>('/api/agency/rate-cards/audit', {
    method: 'GET',
    query: { itemId, limit: 10 }
  })
}, { immediate: true })

const auditEntries = computed(() => auditData.value?.entries || [])

function formatAuditAction(entry: any) {
  switch (entry.action) {
    case 'create': return 'Created'
    case 'update': return `Updated ${entry.fieldName?.replace(/_/g, ' ')}`
    case 'delete': return 'Archived'
    case 'import': return 'Imported'
    default: return entry.action
  }
}

function auditActionColor(action: string): UiColor {
  switch (action) {
    case 'create': return 'success'
    case 'import': return 'info'
    case 'delete': return 'error'
    default: return 'neutral'
  }
}
</script>

<template>
  <USlideover v-model:open="localOpen" title="Service Detail">
    <template #body>
      <div v-if="item" class="space-y-5">
        <!-- Service name — full width -->
        <div>
          <label class="text-xs font-medium text-muted mb-1 block">Service Name</label>
          <UInput v-model="form.serviceName" placeholder="e.g. Google Search (SEM)" class="w-full" />
        </div>

        <div class="border-t border-default" />

        <!-- Category -->
        <div>
          <label class="text-xs font-medium text-muted mb-1 block">Category</label>
          <USelectMenu
            v-model="form.categoryId"
            :items="categoryOptions"
            value-key="value"
            placeholder="Select category"
            class="w-full"
          />
        </div>

        <!-- Pricing fields -->
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-muted mb-1 block">Price (ex GST)</label>
              <UInput
                v-model.number="form.price"
                type="number"
                step="0.01"
                size="sm"
                class="w-full"
                :disabled="form.priceUnit === 'POA'"
                :placeholder="form.priceUnit === 'POA' ? 'N/A' : '0.00'"
              />
            </div>
            <div>
              <label class="text-xs font-medium text-muted mb-1 block">Price Unit</label>
              <USelectMenu
                v-model="form.priceUnit"
                :items="priceUnitOptions"
                value-key="value"
                size="sm"
                class="w-full"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-muted mb-1 block">Setup Fee</label>
              <UInput
                v-model.number="form.setupFee"
                type="number"
                step="0.01"
                size="sm"
                class="w-full"
                placeholder="0.00"
              />
            </div>
            <div>
              <label class="text-xs font-medium text-muted mb-1 block">Setup Notes</label>
              <UInput
                v-model="form.setupNotes"
                size="sm"
                class="w-full"
                placeholder="e.g. One-off set up"
              />
            </div>
          </div>
        </div>

        <div class="border-t border-default" />

        <!-- Description section -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium text-muted uppercase tracking-wide">Service Description</label>
            <UButton
              v-if="form.description"
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-sparkles"
              :loading="generating"
              @click="generateDescription"
            >
              Regenerate
            </UButton>
          </div>

          <!-- Empty state — prominent CTA -->
          <div v-if="!form.description && !descriptionFocused" class="rounded-lg border border-dashed border-default p-6 text-center">
            <UIcon name="i-lucide-file-text" class="size-8 text-muted mx-auto mb-3" />
            <p class="text-sm text-muted mb-4">No description yet. Describe what this service includes for proposals and client-facing docs.</p>
            <div class="flex items-center justify-center gap-2">
              <UButton
                variant="soft"
                color="primary"
                icon="i-lucide-sparkles"
                :loading="generating"
                @click="generateDescription"
              >
                AI Generate
              </UButton>
              <UButton
                variant="outline"
                color="neutral"
                icon="i-lucide-pencil"
                @click="focusDescription"
              >
                Write manually
              </UButton>
            </div>
          </div>

          <!-- Contenteditable — visible when has content or focused -->
          <div
            v-show="form.description || descriptionFocused"
            ref="descriptionRef"
            contenteditable="true"
            class="min-h-[120px] p-3 rounded-lg text-sm leading-relaxed outline-none transition-all whitespace-pre-wrap bg-transparent border border-transparent hover:bg-elevated/30 focus:bg-elevated/50 focus:border-default"
            @input="onDescriptionInput"
            @focus="descriptionFocused = true"
            @blur="descriptionFocused = false"
          />
        </div>

        <!-- Internal notes -->
        <div>
          <label class="text-xs font-medium text-muted mb-1 block">Internal Notes</label>
          <UTextarea
            v-model="form.notes"
            :rows="3"
            class="w-full"
            placeholder="Internal notes, caveats, pricing context..."
            :ui="{ base: 'bg-elevated/50' }"
          />
        </div>

        <!-- Audit history -->
        <div v-if="auditEntries.length > 0" class="border-t border-default pt-4">
          <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Recent Changes</h4>
          <div class="space-y-2">
            <div
              v-for="entry in auditEntries"
              :key="entry.id"
              class="flex items-start gap-2 text-xs"
            >
              <UBadge :color="auditActionColor(entry.action)" variant="subtle" size="xs" class="mt-0.5 shrink-0">
                {{ entry.action }}
              </UBadge>
              <div class="flex-1 min-w-0">
                <p>
                  <span class="font-medium">{{ entry.changedByName || 'System' }}</span>
                  {{ formatAuditAction(entry) }}
                </p>
                <p v-if="entry.oldValue && entry.newValue" class="text-muted mt-0.5">
                  <span class="line-through">{{ entry.oldValue }}</span>
                  <UIcon name="i-lucide-arrow-right" class="inline size-3 mx-0.5" />
                  {{ entry.newValue }}
                </p>
              </div>
              <span class="text-muted whitespace-nowrap shrink-0">
                {{ new Date(entry.changedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex items-center justify-between w-full">
        <span v-if="hasChanges" class="text-xs text-muted italic">Unsaved changes</span>
        <span v-else />
        <div class="flex gap-2">
          <UButton variant="ghost" color="neutral" label="Cancel" @click="close" />
          <UButton
            color="primary"
            label="Save"
            :loading="saving"
            :disabled="!hasChanges"
            @click="save"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
