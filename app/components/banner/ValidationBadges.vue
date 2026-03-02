<script setup lang="ts">
/**
 * Inline validation badges for banner formats.
 * Shows platform compliance status with expandable details.
 */
const props = defineProps<{
  projectId: string
  formatKey?: string // optional — filter to single format
}>()

const { data: validation, status, refresh } = useFetch<any>(
  () => `/api/agency/banner-studio/validate`,
  {
    method: 'POST',
    body: { projectId: props.projectId },
    default: () => null,
    immediate: true,
  },
)

const results = computed(() => {
  if (!validation.value?.results) return []
  if (props.formatKey) {
    return validation.value.results.filter((r: any) => r.formatKey === props.formatKey)
  }
  return validation.value.results
})

const expandedFormat = ref<string | null>(null)

function toggleExpand(fk: string) {
  expandedFormat.value = expandedFormat.value === fk ? null : fk
}

function severityIcon(sev: string): string {
  if (sev === 'error') return 'i-lucide-circle-x'
  if (sev === 'warning') return 'i-lucide-alert-triangle'
  return 'i-lucide-info'
}

function severityColor(sev: string): string {
  if (sev === 'error') return 'text-red-500'
  if (sev === 'warning') return 'text-yellow-500'
  return 'text-(--ui-text-muted)'
}

defineExpose({ refresh })
</script>

<template>
  <div>
    <div v-if="status === 'pending'" class="flex items-center gap-1 text-xs text-(--ui-text-muted)">
      <UIcon name="i-lucide-loader-2" class="w-3 h-3 animate-spin" />
      Validating...
    </div>

    <div v-else-if="results.length" class="space-y-1.5">
      <div
        v-for="r in results"
        :key="r.formatKey"
        class="text-xs"
      >
        <!-- Summary badge -->
        <button
          class="flex items-center gap-1.5 w-full text-left px-1.5 py-1 rounded hover:bg-(--ui-bg-elevated) transition-colors"
          @click="toggleExpand(r.formatKey)"
        >
          <UIcon
            :name="r.errors > 0 ? 'i-lucide-circle-x' : r.warnings > 0 ? 'i-lucide-alert-triangle' : 'i-lucide-circle-check'"
            class="w-3.5 h-3.5 shrink-0"
            :class="r.errors > 0 ? 'text-red-500' : r.warnings > 0 ? 'text-yellow-500' : 'text-green-500'"
          />
          <span v-if="!formatKey" class="font-medium">{{ r.formatKey }}</span>
          <span class="text-(--ui-text-muted)">
            {{ r.errors > 0 ? `${r.errors} error${r.errors > 1 ? 's' : ''}` : '' }}
            {{ r.errors > 0 && r.warnings > 0 ? ', ' : '' }}
            {{ r.warnings > 0 ? `${r.warnings} warning${r.warnings > 1 ? 's' : ''}` : '' }}
            {{ r.errors === 0 && r.warnings === 0 ? 'All checks passed' : '' }}
          </span>
          <UIcon
            name="i-lucide-chevron-down"
            class="w-3 h-3 ml-auto transition-transform"
            :class="expandedFormat === r.formatKey ? 'rotate-180' : ''"
          />
        </button>

        <!-- Expanded rules -->
        <div v-if="expandedFormat === r.formatKey" class="ml-5 mt-1 space-y-1">
          <div
            v-for="rule in r.rules"
            :key="rule.id"
            class="flex items-start gap-1.5 py-0.5"
          >
            <UIcon :name="severityIcon(rule.severity)" class="w-3 h-3 mt-0.5 shrink-0" :class="severityColor(rule.severity)" />
            <div>
              <span class="text-[10px] uppercase font-bold text-(--ui-text-muted) mr-1">{{ rule.platform }}</span>
              <span>{{ rule.message }}</span>
              <div v-if="rule.fix" class="text-[10px] text-(--ui-text-muted) mt-0.5">
                Fix: {{ rule.fix }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
