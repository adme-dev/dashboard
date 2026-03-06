<script setup lang="ts">
import { format } from 'date-fns'

const props = defineProps<{
  taskId: string
}>()

const emit = defineEmits<{
  updated: []
}>()

const toast = useToast()

// Fetch approval data
const { data: approvalData, pending, refresh } = await useFetch(
  () => `/api/agency/tasks/${props.taskId}/approvals`
)

const approval = computed(() => (approvalData.value as any)?.approval)
const hasApproval = computed(() => !!approval.value)

// Fetch available workflows for starting new approval
const { data: workflowsData } = await useFetch('/api/agency/workflows/approvals')
const availableWorkflows = computed(() => (workflowsData.value?.workflows || []) as any[])

// Modal states
const showStartModal = ref(false)
const showResponseModal = ref(false)
const selectedWorkflow = ref<string | null>(null)
const selectedStep = ref<any>(null)
const responseType = ref<'approved' | 'rejected'>('approved')
const responseComment = ref('')
const submitting = ref(false)

// Format helpers
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy h:mm a')
}

// Get step status color
const getStepStatusColor = (step: any): string => {
  if (!step.response) return 'bg-gray-300 dark:bg-gray-600'
  switch (step.response.status) {
    case 'approved': return 'bg-emerald-500'
    case 'rejected': return 'bg-red-500'
    case 'skipped': return 'bg-gray-400'
    default: return 'bg-gray-300'
  }
}

const getStepIcon = (step: any): string => {
  if (!step.response) return 'i-lucide-circle-dashed'
  switch (step.response.status) {
    case 'approved': return 'i-lucide-check-circle'
    case 'rejected': return 'i-lucide-x-circle'
    case 'skipped': return 'i-lucide-skip-forward'
    default: return 'i-lucide-circle-dashed'
  }
}

const getOverallStatusColor = (status: string): 'success' | 'error' | 'warning' | 'info' | 'neutral' => {
  switch (status) {
    case 'approved': return 'success'
    case 'rejected': return 'error'
    case 'in_progress': return 'warning'
    case 'pending': return 'info'
    default: return 'neutral'
  }
}

// Start approval workflow
const startApproval = async () => {
  if (!selectedWorkflow.value) {
    toast.add({ title: 'Please select a workflow', color: 'error' })
    return
  }

  submitting.value = true
  try {
    await $fetch(`/api/agency/tasks/${props.taskId}/approvals`, {
      method: 'POST',
      body: { workflowId: selectedWorkflow.value }
    })
    toast.add({ title: 'Approval workflow started', color: 'success' })
    showStartModal.value = false
    selectedWorkflow.value = null
    refresh()
    emit('updated')
  } catch (err: any) {
    toast.add({ title: 'Failed to start approval', description: err.data?.message, color: 'error' })
  } finally {
    submitting.value = false
  }
}

// Open response modal for a step
const openResponseModal = (step: any, type: 'approved' | 'rejected') => {
  selectedStep.value = step
  responseType.value = type
  responseComment.value = ''
  showResponseModal.value = true
}

// Submit step response
const submitResponse = async () => {
  if (!selectedStep.value) return

  submitting.value = true
  try {
    await $fetch(`/api/agency/tasks/${props.taskId}/approvals/${selectedStep.value.stepId}`, {
      method: 'PATCH',
      body: {
        status: responseType.value,
        comment: responseComment.value
      }
    })
    toast.add({ title: responseType.value === 'approved' ? 'Step approved' : 'Step rejected', color: 'success' })
    showResponseModal.value = false
    selectedStep.value = null
    responseComment.value = ''
    refresh()
    emit('updated')
  } catch (err: any) {
    toast.add({ title: 'Failed to submit response', description: err.data?.message, color: 'error' })
  } finally {
    submitting.value = false
  }
}

// Cancel approval workflow
const cancelApproval = async () => {
  if (!confirm('Are you sure you want to cancel this approval workflow?')) return

  submitting.value = true
  try {
    await ($fetch as any)(`/api/agency/tasks/${props.taskId}/approvals`, {
      method: 'DELETE'
    })
    toast.add({ title: 'Approval cancelled', color: 'success' })
    refresh()
    emit('updated')
  } catch (err: any) {
    toast.add({ title: 'Failed to cancel approval', description: err.data?.message, color: 'error' })
  } finally {
    submitting.value = false
  }
}

// Check if current user can respond to a step
const canRespondToStep = (step: any): boolean => {
  // Don't show actions if already responded
  if (step.response?.status) return false

  // Check if this is the current step (or a previous step that's still pending)
  const approval_val = approval.value
  if (!approval_val) return false

  // Only allow responding to the current step or earlier pending steps
  const currentStepNumber = approval_val.steps.findIndex((s: any) => !s.response?.status) + 1
  return step.stepNumber <= currentStepNumber
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-git-branch" class="w-5 h-5 text-gray-500" />
          <h3 class="font-semibold">Approval Workflow</h3>
        </div>
        <UBadge v-if="approval" :color="getOverallStatusColor(approval.status)" variant="subtle">
          {{ approval.status }}
        </UBadge>
      </div>
    </template>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-8">
      <XfLoader size="sm" />
    </div>

    <!-- No Approval -->
    <div v-else-if="!hasApproval" class="text-center py-8">
      <UIcon name="i-lucide-check-square" class="w-12 h-12 mx-auto mb-4 text-gray-300" />
      <p class="text-gray-500 mb-4">No approval workflow attached</p>
      <UButton
        v-if="availableWorkflows.length > 0"
        label="Start Approval"
        icon="i-lucide-play"
        @click="showStartModal = true"
      />
      <p v-else class="text-xs text-gray-400 mt-2">No approval workflows available</p>
    </div>

    <!-- Active Approval -->
    <div v-else class="space-y-6">
      <!-- Workflow Info -->
      <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-medium">{{ approval.workflowName }}</h4>
          <span class="text-xs text-gray-500">Started {{ formatDate(approval.createdAt) }}</span>
        </div>
        <p v-if="approval.workflowDescription" class="text-sm text-gray-500">
          {{ approval.workflowDescription }}
        </p>
        <div v-if="approval.requestedBy" class="flex items-center gap-2 mt-2 text-sm text-gray-500">
          <UIcon name="i-lucide-user" class="w-4 h-4" />
          <span>Requested by {{ approval.requestedBy.name }}</span>
        </div>
      </div>

      <!-- Progress Bar -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-gray-500">Progress</span>
          <span class="text-sm font-medium">
            {{ approval.progress.completedSteps }} / {{ approval.progress.totalSteps }} steps
          </span>
        </div>
        <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="{
              'bg-emerald-500': approval.status === 'approved',
              'bg-red-500': approval.status === 'rejected',
              'bg-blue-500': ['pending', 'in_progress'].includes(approval.status)
            }"
            :style="{ width: `${(approval.progress.completedSteps / approval.progress.totalSteps) * 100}%` }"
          />
        </div>
      </div>

      <!-- Steps -->
      <div class="space-y-3">
        <div
          v-for="(step, index) in approval.steps"
          :key="step.stepId"
          class="relative"
        >
          <!-- Connection Line -->
          <div
            v-if="index < approval.steps.length - 1"
            class="absolute left-4 top-10 w-0.5 h-full -mb-3"
            :class="step.response?.status ? 'bg-gray-300 dark:bg-gray-600' : 'bg-gray-200 dark:bg-gray-700'"
          />

          <div
            class="flex items-start gap-4 p-4 rounded-lg border transition-colors"
            :class="{
              'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800': step.response?.status === 'approved',
              'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-800': step.response?.status === 'rejected',
              'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800': !step.response?.status
            }"
          >
            <!-- Step Icon -->
            <div
              class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white"
              :class="getStepStatusColor(step)"
            >
              <UIcon :name="getStepIcon(step)" class="w-5 h-5" />
            </div>

            <!-- Step Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <div>
                  <h5 class="font-medium">{{ step.stepName }}</h5>
                  <p class="text-xs text-gray-500">
                    {{ step.approverRole || 'Any approver' }}
                    <span v-if="!step.isRequired" class="text-gray-400">(Optional)</span>
                  </p>
                </div>

                <!-- Actions or Status -->
                <div>
                  <template v-if="step.response?.status">
                    <div class="text-right">
                      <p class="text-sm font-medium" :class="{
                        'text-emerald-600': step.response.status === 'approved',
                        'text-red-600': step.response.status === 'rejected'
                      }">
                        {{ step.response.status.charAt(0).toUpperCase() + step.response.status.slice(1) }}
                      </p>
                      <p class="text-xs text-gray-500">
                        by {{ step.response.responder?.name || 'Unknown' }}
                      </p>
                      <p class="text-xs text-gray-400">
                        {{ formatDate(step.response.respondedAt) }}
                      </p>
                    </div>
                  </template>
                  <template v-else-if="canRespondToStep(step) && approval.status === 'in_progress'">
                    <div class="flex items-center gap-2">
                      <UButton
                        color="success"
                        variant="soft"
                        size="sm"
                        icon="i-lucide-check"
                        @click="openResponseModal(step, 'approved')"
                      >
                        Approve
                      </UButton>
                      <UButton
                        color="error"
                        variant="soft"
                        size="sm"
                        icon="i-lucide-x"
                        @click="openResponseModal(step, 'rejected')"
                      >
                        Reject
                      </UButton>
                    </div>
                  </template>
                  <template v-else>
                    <UBadge variant="subtle" color="neutral">Pending</UBadge>
                  </template>
                </div>
              </div>

              <!-- Response Comment -->
              <div v-if="step.response?.comment" class="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                "{{ step.response.comment }}"
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Completed Status -->
      <div v-if="approval.completedAt" class="p-4 rounded-lg" :class="{
        'bg-emerald-100 dark:bg-emerald-900/30': approval.status === 'approved',
        'bg-red-100 dark:bg-red-900/30': approval.status === 'rejected'
      }">
        <div class="flex items-center gap-2">
          <UIcon
            :name="approval.status === 'approved' ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
            class="w-5 h-5"
            :class="{
              'text-emerald-600': approval.status === 'approved',
              'text-red-600': approval.status === 'rejected'
            }"
          />
          <span class="font-medium" :class="{
            'text-emerald-700 dark:text-emerald-300': approval.status === 'approved',
            'text-red-700 dark:text-red-300': approval.status === 'rejected'
          }">
            {{ approval.status === 'approved' ? 'Workflow Approved' : 'Workflow Rejected' }}
          </span>
        </div>
        <p class="text-sm text-gray-500 mt-1">
          Completed on {{ formatDate(approval.completedAt) }}
        </p>
      </div>

      <!-- Cancel Button -->
      <div v-if="['pending', 'in_progress'].includes(approval.status)" class="flex justify-end">
        <UButton
          variant="ghost"
          color="error"
          size="sm"
          icon="i-lucide-x"
          :loading="submitting"
          @click="cancelApproval"
        >
          Cancel Workflow
        </UButton>
      </div>
    </div>

    <!-- Start Approval Modal -->
    <UModal v-model:open="showStartModal">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="font-semibold">Start Approval Workflow</h3>
          </template>

          <div class="space-y-4">
            <UFormField label="Select Workflow">
              <USelectMenu
                v-model="selectedWorkflow"
                :items="availableWorkflows.map(w => ({ value: w.id, label: w.name, description: w.description }))"
                value-key="value"
                placeholder="Choose a workflow..."
              />
            </UFormField>

            <div v-if="selectedWorkflow" class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p class="text-sm text-gray-500">
                {{ availableWorkflows.find(w => w.id === selectedWorkflow)?.description || 'No description' }}
              </p>
              <p class="text-xs text-gray-400 mt-2">
                {{ availableWorkflows.find(w => w.id === selectedWorkflow)?.stepCount || 0 }} steps
              </p>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showStartModal = false">Cancel</UButton>
              <UButton
                color="primary"
                :loading="submitting"
                @click="startApproval"
              >
                Start Workflow
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Response Modal -->
    <UModal v-model:open="showResponseModal">
      <template #content>
        <UCard v-if="selectedStep">
          <template #header>
            <h3 class="font-semibold">
              {{ responseType === 'approved' ? 'Approve' : 'Reject' }} - {{ selectedStep.stepName }}
            </h3>
          </template>

          <div class="space-y-4">
            <UFormField label="Comment (optional)">
              <UTextarea
                v-model="responseComment"
                :placeholder="responseType === 'approved' ? 'Add any notes about your approval...' : 'Please explain why you are rejecting this step...'"
                :rows="3"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" @click="showResponseModal = false">Cancel</UButton>
              <UButton
                :color="responseType === 'approved' ? 'success' : 'error'"
                :loading="submitting"
                @click="submitResponse"
              >
                {{ responseType === 'approved' ? 'Approve' : 'Reject' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </UCard>
</template>
