<script setup lang="ts">
const props = defineProps<{
  templateId: string
  templateName: string
  clientId?: string
}>()

const emit = defineEmits<{
  apply: [values: Record<string, any>]
  close: []
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

// State
const isOpen = ref(true)
const prompt = ref('')
const selectedClientId = ref<string>(props.clientId || 'none')
const isGenerating = ref(false)
const generatedFields = ref<Array<{
  key: string
  label: string
  value: string
  accepted: boolean
  rejected: boolean
  editing: boolean
}>>([])
const warnings = ref<string[]>([])
const hasGenerated = ref(false)

// Fetch clients for selector (only when no clientId prop)
const clientsData = ref<any | null>(null)

async function refreshClients() {
  if (props.clientId) return
  clientsData.value = await apiFetch<any>('/api/agency/clients', {
    query: { limit: 100 },
  })
}

refreshClients()

const clientOptions = computed(() => {
  if (!clientsData.value) return []
  const clients = (clientsData.value as any)?.clients || clientsData.value || []
  return [
    { label: 'No client', value: 'none' },
    ...clients.map((c: any) => ({ label: c.name, value: c.id }))
  ]
})

const effectiveClientId = computed(() => {
  if (props.clientId) return props.clientId
  return selectedClientId.value === 'none' ? undefined : selectedClientId.value || undefined
})

async function generate() {
  if (!prompt.value.trim()) {
    toast.add({ title: 'Prompt required', description: 'Please describe the brief you need', color: 'error' })
    return
  }

  isGenerating.value = true
  generatedFields.value = []
  warnings.value = []

  try {
    const result = await apiFetch<any>('/api/agency/briefs/ai/generate', {
      method: 'POST',
      body: {
        templateId: props.templateId,
        clientId: effectiveClientId.value,
        prompt: prompt.value.trim()
      }
    })

    // Normalize: API may return { fields: [...] } or { generatedValues: {...}, ... }
    if (result.fields) {
      generatedFields.value = result.fields.map((f: any) => ({
        key: f.key,
        label: f.label || f.key,
        value: typeof f.value === 'string' ? f.value : JSON.stringify(f.value),
        accepted: true,
        rejected: false,
        editing: false
      }))
    } else if (result.generatedValues) {
      generatedFields.value = Object.entries(result.generatedValues).map(([key, value]) => ({
        key,
        label: key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
        accepted: true,
        rejected: false,
        editing: false
      }))
    }

    warnings.value = result.warnings || []
    hasGenerated.value = true

    if (generatedFields.value.length === 0) {
      toast.add({ title: 'No fields generated', description: 'AI could not generate content for this template', color: 'error' })
    }
  } catch (err: any) {
    toast.add({
      title: 'Generation Failed',
      description: err.data?.statusMessage || 'Failed to generate brief content',
      color: 'error'
    })
  } finally {
    isGenerating.value = false
  }
}

function acceptField(index: number) {
  generatedFields.value[index].accepted = true
  generatedFields.value[index].rejected = false
  generatedFields.value[index].editing = false
}

function rejectField(index: number) {
  generatedFields.value[index].rejected = true
  generatedFields.value[index].accepted = false
  generatedFields.value[index].editing = false
}

function toggleEdit(index: number) {
  generatedFields.value[index].editing = !generatedFields.value[index].editing
}

const acceptedFields = computed(() =>
  generatedFields.value.filter(f => f.accepted && !f.rejected)
)

function acceptAllFields() {
  for (const field of generatedFields.value) {
    field.accepted = true
    field.rejected = false
  }
}

function applyAll() {
  const values: Record<string, any> = {}
  for (const field of acceptedFields.value) {
    values[field.key] = field.value
  }
  emit('apply', values)
  toast.add({
    title: 'Brief Generated',
    description: `${acceptedFields.value.length} field${acceptedFields.value.length !== 1 ? 's' : ''} applied`,
    color: 'success'
  })
}

function handleClose() {
  isOpen.value = false
  emit('close')
}
</script>

<template>
  <USlideover v-model:open="isOpen" @update:open="(val: boolean) => { if (!val) handleClose() }">
    <template #content>
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-default">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
            <div>
              <h2 class="font-semibold">AI Brief Generator</h2>
              <p class="text-sm text-muted">{{ templateName }}</p>
            </div>
          </div>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            @click="handleClose"
          />
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5">
          <!-- Prompt -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Describe the brief you need</label>
            <UTextarea
              v-model="prompt"
              :rows="6"
              placeholder="Describe the brief you need... e.g. 'We need a social media campaign for our Q2 product launch targeting millennials with a budget of $5000'"
              :disabled="isGenerating"
            />
          </div>

          <!-- Client selector (when no clientId prop) -->
          <div v-if="!props.clientId && clientOptions.length > 0" class="space-y-2">
            <label class="text-sm font-medium">Client (optional)</label>
            <USelectMenu
              v-model="selectedClientId"
              :items="clientOptions"
              placeholder="Select a client..."
              :disabled="isGenerating"
              class="w-full"
            />
          </div>

          <!-- Generate button -->
          <UButton
            label="Generate"
            icon="i-lucide-sparkles"
            color="primary"
            :loading="isGenerating"
            :disabled="!prompt.trim()"
            block
            @click="generate"
          />

          <!-- Warnings -->
          <UAlert
            v-for="(warning, index) in warnings"
            :key="index"
            :title="warning"
            icon="i-lucide-alert-triangle"
            color="warning"
            variant="subtle"
          />

          <!-- Generated fields preview -->
          <div v-if="hasGenerated && generatedFields.length > 0" class="space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-sm font-medium">
                Generated Fields ({{ acceptedFields.length }}/{{ generatedFields.length }})
              </p>
              <UButton
                label="Accept All"
                variant="ghost"
                size="xs"
                icon="i-lucide-check-check"
                @click="acceptAllFields"
              />
            </div>

            <div
              v-for="(field, index) in generatedFields"
              :key="field.key"
              class="rounded-lg border p-3 space-y-2 transition-colors"
              :class="[
                field.rejected ? 'border-red-500/30 dark:border-red-400/30 bg-red-500/5 opacity-60' : 'border-default',
                field.accepted && !field.rejected ? 'border-emerald-500/30 dark:border-emerald-400/30 bg-emerald-500/5' : ''
              ]"
            >
              <!-- Field header -->
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{{ field.label }}</span>
                <div class="flex items-center gap-1">
                  <UTooltip text="Edit">
                    <UButton
                      icon="i-lucide-pencil"
                      variant="ghost"
                      size="xs"
                      color="neutral"
                      @click="toggleEdit(index)"
                    />
                  </UTooltip>
                  <UTooltip text="Accept">
                    <UButton
                      icon="i-lucide-check"
                      variant="ghost"
                      size="xs"
                      :color="field.accepted && !field.rejected ? 'success' : 'neutral'"
                      @click="acceptField(index)"
                    />
                  </UTooltip>
                  <UTooltip text="Reject">
                    <UButton
                      icon="i-lucide-x"
                      variant="ghost"
                      size="xs"
                      :color="field.rejected ? 'error' : 'neutral'"
                      @click="rejectField(index)"
                    />
                  </UTooltip>
                </div>
              </div>

              <!-- Field value (read-only) -->
              <p v-if="!field.editing" class="text-sm text-muted whitespace-pre-wrap">{{ field.value }}</p>

              <!-- Field value (editable) -->
              <UInput
                v-else
                v-model="field.value"
                class="w-full"
                @keydown.enter="toggleEdit(index)"
              />
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div
          v-if="hasGenerated && acceptedFields.length > 0"
          class="px-6 py-4 border-t border-default flex items-center justify-between"
        >
          <p class="text-sm text-muted">
            {{ acceptedFields.length }} field{{ acceptedFields.length > 1 ? 's' : '' }} will be applied
          </p>
          <UButton
            label="Apply All Accepted"
            icon="i-lucide-check"
            color="primary"
            @click="applyAll"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
