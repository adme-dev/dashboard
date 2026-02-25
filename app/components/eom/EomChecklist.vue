<script setup lang="ts">
const props = defineProps<{
  runStatus: string
}>()

const steps = [
  { step: 1, task: 'Confirm all jobs marked Done/Proof in Monday', owner: 'Kellie/Hannah', auto: false },
  { step: 2, task: 'Check Xero OAuth token is valid', owner: 'System', auto: true },
  { step: 3, task: 'Get last invoice number from Xero', owner: 'System', auto: true },
  { step: 4, task: 'Pull completed jobs from Monday.com', owner: 'System', auto: true },
  { step: 5, task: 'Pull PPC spend (Meta + Google)', owner: 'System', auto: true },
  { step: 6, task: 'Generate invoice lines with COA + GST', owner: 'System', auto: true },
  { step: 7, task: 'Validate contact names against Xero', owner: 'System', auto: true },
  { step: 8, task: 'Review totals (~$250-280K typical)', owner: 'Kellie', auto: false },
  { step: 9, task: 'Spot-check 5-10 rows', owner: 'Kellie', auto: false },
  { step: 10, task: 'PPC budget vs actual reconciliation', owner: 'Kellie/Hannah', auto: false },
  { step: 11, task: 'Upload to Xero as DRAFT', owner: 'System', auto: true },
  { step: 12, task: 'Review and AUTHORISE in Xero', owner: 'Rob', auto: false },
  { step: 13, task: 'Archive CSV to storage', owner: 'System', auto: true },
]

const manualChecks = ref<Record<number, boolean>>({})

function autoComplete(step: number): boolean {
  const status = props.runStatus
  if (step <= 6) return ['review', 'pushed', 'complete'].includes(status)
  if (step === 7) return ['review', 'pushed', 'complete'].includes(status)
  if (step === 11) return ['pushed', 'complete'].includes(status)
  if (step === 13) return status === 'complete'
  return false
}

function isComplete(step: number, auto: boolean): boolean {
  if (auto) return autoComplete(step)
  return !!manualChecks.value[step]
}

const progress = computed(() => {
  const completed = steps.filter(s => isComplete(s.step, s.auto)).length
  return Math.round((completed / steps.length) * 100)
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">EOM Workflow Checklist</h3>
      <span class="text-sm text-muted">{{ progress }}% complete</span>
    </div>
    <div class="w-full bg-elevated rounded-full h-2">
      <div class="h-2 rounded-full bg-primary transition-all" :style="{ width: `${progress}%` }" />
    </div>
    <div class="space-y-1">
      <div v-for="s in steps" :key="s.step" class="flex items-center gap-3 py-1.5">
        <div v-if="s.auto" class="w-5 h-5 flex items-center justify-center">
          <UIcon v-if="isComplete(s.step, s.auto)" name="i-lucide-check-circle" class="w-5 h-5 text-success" />
          <UIcon v-else name="i-lucide-circle" class="w-5 h-5 text-muted" />
        </div>
        <input v-else v-model="manualChecks[s.step]" type="checkbox" class="w-4 h-4 rounded" />
        <div class="flex-1">
          <span class="text-sm" :class="isComplete(s.step, s.auto) ? 'line-through text-muted' : ''">
            {{ s.step }}. {{ s.task }}
          </span>
        </div>
        <span class="text-xs text-muted">{{ s.owner }}</span>
      </div>
    </div>
  </div>
</template>
