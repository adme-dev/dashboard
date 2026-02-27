<script setup lang="ts">
const props = defineProps<{
  modelValue?: string
  members: Array<{
    id: string
    name: string
    email?: string
    role?: string
    avatar?: string
    active_task_count?: number
  }>
  aiSuggestedId?: string | null
  aiReason?: string | null
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

const selected = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const items = computed(() =>
  props.members.map((m) => ({
    label: m.name,
    value: m.id,
    role: m.role || '',
    taskCount: m.active_task_count ?? 0,
    isAiSuggested: m.id === props.aiSuggestedId
  }))
)

function getUtilizationColor(count: number) {
  if (count <= 3) return 'bg-green-500'
  if (count <= 7) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getUtilizationWidth(count: number) {
  const pct = Math.min(count / 10 * 100, 100)
  return `${pct}%`
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
</script>

<template>
  <USelectMenu
    v-model="selected"
    :items="items"
    :placeholder="placeholder || 'Unassigned'"
    value-key="value"
  >
    <template #item="{ item }">
      <div class="flex items-center gap-2 w-full min-w-0">
        <span class="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center flex-shrink-0">
          {{ getInitials(item.label as string) }}
        </span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-sm truncate">{{ item.label }}</span>
            <UBadge
              v-if="item.isAiSuggested"
              size="xs"
              color="primary"
              variant="subtle"
            >
              <UIcon name="i-lucide-sparkles" class="w-3 h-3 mr-0.5" />
              AI
            </UBadge>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
            <span class="text-xs text-muted capitalize">{{ item.role }}</span>
            <div class="flex items-center gap-1">
              <div class="w-12 h-1 bg-default/30 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="getUtilizationColor(item.taskCount as number)"
                  :style="{ width: getUtilizationWidth(item.taskCount as number) }"
                />
              </div>
              <span class="text-[10px] text-muted">{{ item.taskCount }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </USelectMenu>

  <p
    v-if="aiSuggestedId && aiReason && modelValue === aiSuggestedId"
    class="text-xs text-primary mt-1 flex items-center gap-1"
  >
    <UIcon name="i-lucide-sparkles" class="w-3 h-3" />
    {{ aiReason }}
  </p>
</template>
