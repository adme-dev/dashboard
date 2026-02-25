<script setup lang="ts">
defineProps<{
  validation: {
    checks: Array<{ name: string; passed: boolean; message: string; severity: string; details?: any }>
    flaggedItems: number
    passed: boolean
  }
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-3">
      <UIcon :name="validation.passed ? 'i-lucide-check-circle' : 'i-lucide-alert-triangle'" :class="validation.passed ? 'text-success' : 'text-warning'" class="w-5 h-5" />
      <h3 class="font-semibold">{{ validation.passed ? 'All checks passed' : 'Some checks need attention' }}</h3>
      <span v-if="validation.flaggedItems > 0" class="text-sm text-error">{{ validation.flaggedItems }} flagged items</span>
    </div>

    <div class="space-y-2">
      <div v-for="check in validation.checks" :key="check.name" class="border border-default rounded-lg p-3 flex items-start gap-3">
        <UIcon
          :name="check.passed ? 'i-lucide-check-circle' : check.severity === 'error' ? 'i-lucide-x-circle' : 'i-lucide-alert-triangle'"
          :class="check.passed ? 'text-success' : check.severity === 'error' ? 'text-error' : 'text-warning'"
          class="w-5 h-5 mt-0.5 flex-shrink-0"
        />
        <div>
          <p class="font-medium text-sm">{{ check.name }}</p>
          <p class="text-sm text-muted">{{ check.message }}</p>
          <div v-if="check.details && !check.passed" class="mt-2 text-xs text-muted bg-elevated/50 rounded p-2">
            <pre class="whitespace-pre-wrap">{{ typeof check.details === 'string' ? check.details : JSON.stringify(check.details, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
