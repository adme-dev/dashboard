<script setup lang="ts">
import type {
  Department,
  SocialConversation,
  SocialInboxAiActionInput,
  SocialInboxAiActionProposal,
  SocialInboxAiTriageResult,
  SocialInboxPriority,
  SocialInboxTriageAction
} from '~/types'

const props = defineProps<{
  conversation: SocialConversation
  triage?: SocialInboxAiTriageResult | null
  loading?: boolean
  busyKey?: string | null
  proposals?: Record<string, SocialInboxAiActionProposal>
}>()

const emit = defineEmits<{
  run: []
  applyTriage: [patch: { priority?: SocialInboxPriority | null, tags?: string[] }]
  proposeAction: [payload: { actionKey: string, input: SocialInboxAiActionInput }]
  confirmAction: [payload: { actionKey: string, proposal: SocialInboxAiActionProposal }]
}>()

interface ProjectOption {
  id: string
  name: string
  clientId?: string
}

type BadgeColor = 'error' | 'success' | 'warning' | 'neutral'

const { data: departmentsData } = await useFetch<Department[]>('/api/agency/departments', {
  query: { active: 'true' },
  default: () => []
})

const projectQuery = computed(() => ({ clientId: props.conversation.client_id }))
const { data: projectsData } = await useFetch<ProjectOption[]>('/api/agency/projects', {
  query: projectQuery,
  default: () => []
})

const departmentOptions = computed(() => (departmentsData.value ?? [])
  .filter(department => department.isActive !== false)
  .map(department => ({ label: department.name, value: department.id })))

const projectOptions = computed(() => (projectsData.value ?? [])
  .map(project => ({ label: project.name, value: project.id })))

const caseSelections = ref<Record<string, { departmentId: string, projectId: string }>>({})

const priorityColor: Record<SocialInboxPriority, BadgeColor> = {
  low: 'neutral',
  medium: 'warning',
  high: 'warning',
  urgent: 'error'
}

const sentimentColor: Record<SocialInboxAiTriageResult['sentiment'], BadgeColor> = {
  positive: 'success',
  neutral: 'neutral',
  negative: 'warning',
  urgent: 'error'
}

const riskColor: Record<SocialInboxAiTriageResult['riskLevel'], BadgeColor> = {
  low: 'success',
  medium: 'warning',
  high: 'error'
}

const currentTags = computed(() => props.conversation.tags ?? [])
const triagePatch = computed(() => {
  const patch: { priority?: SocialInboxPriority | null, tags?: string[] } = {}
  if (props.triage?.suggestedPriority && props.triage.suggestedPriority !== props.conversation.priority) {
    patch.priority = props.triage.suggestedPriority
  }
  const suggestedTags = props.triage?.suggestedTags ?? []
  const mergedTags = [...new Set([...currentTags.value, ...suggestedTags])]
  if (suggestedTags.length && mergedTags.join('\n') !== currentTags.value.join('\n')) {
    patch.tags = mergedTags
  }
  return patch
})
const canApplyTriage = computed(() => Object.keys(triagePatch.value).length > 0)

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)
}

function actionKey(action: SocialInboxTriageAction, index: number) {
  if (action.type === 'link_task') return `link:${action.taskId}`
  if (action.type === 'create_social_case') return `case:${index}:${slug(action.title)}`
  return `approval:${index}`
}

function proposalFor(key: string) {
  return props.proposals?.[key] ?? null
}

function selectionFor(key: string) {
  const current = caseSelections.value[key]
  const next = {
    departmentId: current?.departmentId || departmentOptions.value[0]?.value || '',
    projectId: current?.projectId || projectOptions.value[0]?.value || ''
  }
  if (!current || current.departmentId !== next.departmentId || current.projectId !== next.projectId) {
    caseSelections.value = { ...caseSelections.value, [key]: next }
  }
  return next
}

function updateSelection(key: string, patch: Partial<{ departmentId: string, projectId: string }>) {
  caseSelections.value = {
    ...caseSelections.value,
    [key]: { ...selectionFor(key), ...patch }
  }
}

function proposeLink(action: Extract<SocialInboxTriageAction, { type: 'link_task' }>, key: string) {
  emit('proposeAction', {
    actionKey: key,
    input: { type: 'link_task', taskId: action.taskId, reason: action.reason }
  })
}

function proposeCase(action: Extract<SocialInboxTriageAction, { type: 'create_social_case' }>, key: string) {
  const selection = selectionFor(key)
  emit('proposeAction', {
    actionKey: key,
    input: {
      type: 'create_social_case',
      departmentId: selection.departmentId,
      projectId: selection.projectId,
      title: action.title,
      description: action.description,
      reason: action.reason
    }
  })
}

function confirmProposal(key: string, proposal: SocialInboxAiActionProposal) {
  emit('confirmAction', { actionKey: key, proposal })
}
</script>

<template>
  <div class="space-y-3 rounded-md border border-default bg-elevated/40 p-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 text-xs font-medium text-muted">
        <UIcon name="i-lucide-sparkles" class="size-3.5" />
        AI triage
      </div>
      <UButton
        size="xs"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        label="Run"
        :loading="loading"
        @click="emit('run')"
      />
    </div>

    <div v-if="loading" class="space-y-2" aria-busy="true">
      <USkeleton class="h-4 w-5/6" />
      <USkeleton class="h-4 w-2/3" />
      <USkeleton class="h-8 w-full" />
    </div>

    <template v-else-if="triage">
      <p class="text-xs leading-5 text-default">
        {{ triage.summary }}
      </p>
      <div class="flex flex-wrap gap-1.5">
        <UBadge :color="sentimentColor[triage.sentiment]" variant="subtle" size="xs">
          {{ triage.sentiment }}
        </UBadge>
        <UBadge :color="riskColor[triage.riskLevel]" variant="subtle" size="xs">
          {{ triage.riskLevel }} risk
        </UBadge>
        <UBadge
          v-if="triage.suggestedPriority"
          :color="priorityColor[triage.suggestedPriority]"
          variant="subtle"
          size="xs"
        >
          {{ triage.suggestedPriority }}
        </UBadge>
      </div>

      <div v-if="triage.suggestedTags.length" class="flex flex-wrap gap-1">
        <UBadge
          v-for="tag in triage.suggestedTags"
          :key="tag"
          color="neutral"
          variant="soft"
          size="xs"
        >
          {{ tag }}
        </UBadge>
      </div>

      <UButton
        v-if="canApplyTriage"
        size="xs"
        variant="subtle"
        icon="i-lucide-tags"
        label="Apply"
        block
        @click="emit('applyTriage', triagePatch)"
      />

      <div v-if="triage.actions.length" class="space-y-2">
        <div
          v-for="(action, index) in triage.actions"
          :key="actionKey(action, index)"
          class="space-y-2 rounded-md border border-default bg-default/30 p-2"
        >
          <template v-if="action.type === 'link_task'">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-xs font-medium text-default">
                  Link task
                </p>
                <p class="truncate text-[11px] text-muted">
                  {{ action.taskId }}
                </p>
              </div>
              <UBadge color="neutral" variant="subtle" size="xs">
                task
              </UBadge>
            </div>
            <p class="text-[11px] leading-4 text-muted">
              {{ action.reason }}
            </p>
            <UButton
              v-if="proposalFor(actionKey(action, index))"
              size="xs"
              color="success"
              variant="subtle"
              icon="i-lucide-check"
              label="Confirm"
              block
              :loading="busyKey === `${actionKey(action, index)}:confirm`"
              @click="confirmProposal(actionKey(action, index), proposalFor(actionKey(action, index))!)"
            />
            <UButton
              v-else
              size="xs"
              variant="ghost"
              icon="i-lucide-link"
              label="Stage link"
              block
              :loading="busyKey === `${actionKey(action, index)}:propose`"
              @click="proposeLink(action, actionKey(action, index))"
            />
          </template>

          <template v-else-if="action.type === 'create_social_case'">
            <div class="flex items-start justify-between gap-2">
              <p class="min-w-0 truncate text-xs font-medium text-default">
                {{ action.title }}
              </p>
              <UBadge color="warning" variant="subtle" size="xs">
                case
              </UBadge>
            </div>
            <p class="line-clamp-3 text-[11px] leading-4 text-muted">
              {{ action.description }}
            </p>
            <div v-if="!proposalFor(actionKey(action, index))" class="space-y-2">
              <UFormField label="Board" size="xs">
                <USelectMenu
                  :model-value="selectionFor(actionKey(action, index)).departmentId"
                  :items="departmentOptions"
                  value-key="value"
                  class="w-full min-w-0"
                  size="sm"
                  @update:model-value="updateSelection(actionKey(action, index), { departmentId: String($event || '') })"
                />
              </UFormField>
              <UFormField label="Project" size="xs">
                <USelectMenu
                  :model-value="selectionFor(actionKey(action, index)).projectId"
                  :items="projectOptions"
                  value-key="value"
                  class="w-full min-w-0"
                  size="sm"
                  @update:model-value="updateSelection(actionKey(action, index), { projectId: String($event || '') })"
                />
              </UFormField>
            </div>
            <UButton
              v-if="proposalFor(actionKey(action, index))"
              size="xs"
              color="success"
              variant="subtle"
              icon="i-lucide-check"
              label="Confirm"
              block
              :loading="busyKey === `${actionKey(action, index)}:confirm`"
              @click="confirmProposal(actionKey(action, index), proposalFor(actionKey(action, index))!)"
            />
            <UButton
              v-else
              size="xs"
              variant="ghost"
              icon="i-lucide-square-plus"
              label="Stage case"
              block
              :disabled="!selectionFor(actionKey(action, index)).departmentId || !selectionFor(actionKey(action, index)).projectId"
              :loading="busyKey === `${actionKey(action, index)}:propose`"
              @click="proposeCase(action, actionKey(action, index))"
            />
          </template>

          <template v-else>
            <div class="flex items-start gap-2">
              <UIcon name="i-lucide-user-check" class="mt-0.5 size-3.5 text-muted" />
              <p class="text-[11px] leading-4 text-muted">
                {{ action.reason }}
              </p>
            </div>
          </template>
        </div>
      </div>
    </template>

    <p v-else class="text-xs text-muted">
      No triage yet.
    </p>
  </div>
</template>
