<script setup lang="ts">
const props = defineProps<{
  templateId: string
  fieldKey: string
  fieldType: string
  fieldLabel: string
  clientId?: string
  existingValues: Record<string, any>
}>()

const emit = defineEmits<{
  apply: [value: string]
}>()

const isOpen = ref(false)
const isLoading = ref(false)
const suggestions = ref<string[]>([])
const history = ref<string[]>([])
const error = ref<string | null>(null)
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

async function fetchSuggestions() {
  if (isLoading.value) return

  isLoading.value = true
  error.value = null

  try {
    // Fetch AI suggestions and history in parallel
    const [suggestResult, historyResult] = await Promise.all([
      apiFetch<{ suggestions: string[] }>('/api/agency/briefs/ai/suggest', {
        method: 'POST',
        body: {
          templateId: props.templateId,
          fieldKey: props.fieldKey,
          clientId: props.clientId,
          existingValues: props.existingValues
        }
      }).catch(() => ({ suggestions: [] })),
      apiFetch<{ values: string[] }>('/api/agency/briefs/ai/history', {
        query: {
          templateId: props.templateId,
          fieldKey: props.fieldKey,
          ...(props.clientId ? { clientId: props.clientId } : {})
        }
      }).catch(() => ({ values: [] }))
    ]) as [any, any]

    suggestions.value = suggestResult.suggestions || []
    history.value = historyResult.values || []

    if (suggestions.value.length === 0 && history.value.length === 0) {
      error.value = 'No suggestions available for this field'
    }
  } catch (err: any) {
    error.value = err.data?.statusMessage || 'Failed to get suggestions'
  } finally {
    isLoading.value = false
  }
}

function applySuggestion(value: string) {
  emit('apply', value)
  isOpen.value = false
}

function toggle() {
  isOpen.value = !isOpen.value
  if (isOpen.value && suggestions.value.length === 0 && history.value.length === 0) {
    fetchSuggestions()
  }
}
</script>

<template>
  <UPopover v-model:open="isOpen">
    <UButton
      icon="i-lucide-sparkles"
      variant="ghost"
      size="xs"
      color="neutral"
      :title="`AI suggestions for ${fieldLabel}`"
      @click="toggle"
    />

    <template #content>
      <div class="p-3 w-80 max-h-96 overflow-y-auto">
        <!-- Loading -->
        <div v-if="isLoading" class="flex items-center justify-center py-6">
          <XfLoader />
        </div>

        <!-- Error -->
        <div v-else-if="error && suggestions.length === 0 && history.length === 0" class="text-center py-4">
          <UIcon name="i-lucide-alert-circle" class="size-5 text-muted mb-1" />
          <p class="text-xs text-muted">{{ error }}</p>
          <UButton
            label="Retry"
            variant="ghost"
            size="xs"
            class="mt-2"
            @click="fetchSuggestions"
          />
        </div>

        <template v-else>
          <!-- AI Suggestions -->
          <div v-if="suggestions.length > 0" class="mb-3">
            <p class="text-xs font-medium text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <UIcon name="i-lucide-sparkles" class="size-3" />
              AI Suggestions
            </p>
            <div class="space-y-0.5">
              <button
                v-for="(suggestion, index) in suggestions"
                :key="`ai-${index}`"
                class="w-full text-left p-2 rounded-md hover:bg-muted/30 transition-colors text-sm leading-snug"
                @click="applySuggestion(suggestion)"
              >
                {{ suggestion }}
              </button>
            </div>
          </div>

          <!-- Previously Used -->
          <div v-if="history.length > 0">
            <p class="text-xs font-medium text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <UIcon name="i-lucide-history" class="size-3" />
              Previously Used
            </p>
            <div class="space-y-0.5">
              <button
                v-for="(value, index) in history"
                :key="`hist-${index}`"
                class="w-full text-left p-2 rounded-md hover:bg-muted/30 transition-colors text-sm text-muted leading-snug"
                @click="applySuggestion(value)"
              >
                {{ value }}
              </button>
            </div>
          </div>

          <!-- Empty state when both are empty after load -->
          <div v-if="suggestions.length === 0 && history.length === 0 && !isLoading" class="text-center py-4">
            <p class="text-xs text-muted">No suggestions available</p>
          </div>

          <!-- Refresh -->
          <div v-if="!isLoading" class="mt-2 pt-2 border-t border-default">
            <UButton
              label="Refresh"
              icon="i-lucide-refresh-cw"
              variant="ghost"
              size="xs"
              class="w-full"
              @click="fetchSuggestions"
            />
          </div>
        </template>
      </div>
    </template>
  </UPopover>
</template>
