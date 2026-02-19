<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'AI Project Generator',
  middleware: ['auth']
})

const toast = useToast()

// Fetch templates
const { data: templatesData, pending: loadingTemplates } = await useFetch('/api/agency/ai/templates')
const templates = computed(() => (templatesData.value as any)?.templates || [])

// Fetch recent sessions
const { data: sessionsData, pending: loadingSessions, refresh: refreshSessions } = await useFetch('/api/agency/ai/generate/sessions', {
  query: { limit: 10 }
})
const recentSessions = computed(() => (sessionsData.value as any)?.sessions || [])

// Fetch clients for project creation
const { data: clientsData } = await useFetch('/api/agency/clients', {
  query: { limit: 100 }
})
const clients = computed(() => ((clientsData.value as any)?.clients || []) as any[])

// Step state
const currentStep = ref(1)
const selectedTemplate = ref<any>(null)
const discoveryAnswers = ref<Record<string, any>>({})
const projectDetails = ref({
  clientId: null as string | null,
  projectName: '',
  description: '',
  startDate: new Date().toISOString().split('T')[0],
  targetBudget: null as number | null
})

// Generated project state
const generating = ref(false)
const generatedProject = ref<any>(null)
const generationSessionId = ref<string | null>(null)

// Select template
const selectTemplate = (template: any) => {
  selectedTemplate.value = template
  discoveryAnswers.value = {}
  currentStep.value = 2
}

// Answer discovery questions
const submitDiscovery = () => {
  // Validate required questions
  const required = selectedTemplate.value.discoveryQuestions?.filter((q: any) => q.required) || []
  const missing = required.filter((q: any) => !discoveryAnswers.value[q.question])

  if (missing.length > 0) {
    toast.add({ title: 'Please answer all required questions', color: 'error' })
    return
  }

  currentStep.value = 3
}

// Generate project
const generateProject = async () => {
  if (!projectDetails.value.clientId || !projectDetails.value.projectName) {
    toast.add({ title: 'Please fill in required fields', color: 'error' })
    return
  }

  generating.value = true
  try {
    const result = await $fetch('/api/agency/ai/generate', {
      method: 'POST',
      body: {
        templateId: selectedTemplate.value.id,
        clientId: projectDetails.value.clientId,
        projectName: projectDetails.value.projectName,
        description: projectDetails.value.description,
        startDate: projectDetails.value.startDate,
        targetBudget: projectDetails.value.targetBudget,
        discoveryAnswers: discoveryAnswers.value
      }
    }) as any

    generatedProject.value = result.generated
    generationSessionId.value = result.sessionId
    currentStep.value = 4
    refreshSessions()
  } catch (err: any) {
    toast.add({
      title: 'Failed to generate project',
      description: err.data?.message || err.message,
      color: 'error'
    })
  } finally {
    generating.value = false
  }
}

// Apply generated project
const applying = ref(false)
const applyProject = async () => {
  if (!generationSessionId.value) return

  applying.value = true
  try {
    const result = await $fetch(`/api/agency/ai/generate/${generationSessionId.value}/apply`, {
      method: 'POST'
    }) as any

    toast.add({
      title: 'Project created',
      description: `Created "${result.project.name}" with ${result.tasksCreated} tasks`,
      color: 'success'
    })
    navigateTo(`/agency/projects/${result.project.id}`)
  } catch (err: any) {
    toast.add({
      title: 'Failed to create project',
      description: err.data?.message || err.message,
      color: 'error'
    })
  } finally {
    applying.value = false
  }
}

// Reset wizard
const resetWizard = () => {
  currentStep.value = 1
  selectedTemplate.value = null
  discoveryAnswers.value = {}
  projectDetails.value = {
    clientId: null,
    projectName: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    targetBudget: null
  }
  generatedProject.value = null
  generationSessionId.value = null
}

// Format currency
const formatCurrency = (value: number) => {
  if (!value) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

// Format date
const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

// Question input type
const getInputType = (type: string) => {
  switch (type) {
    case 'number': return 'number'
    case 'date': return 'date'
    default: return 'text'
  }
}

// Session status color
const getSessionStatusColor = (status: string): 'neutral' | 'info' | 'success' | 'error' => {
  switch (status) {
    case 'draft': return 'neutral'
    case 'generated': return 'info'
    case 'applied': return 'success'
    case 'failed': return 'error'
    default: return 'neutral'
  }
}
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="AI Project Generator">
        <template #right>
          <UButton
            v-if="currentStep > 1"
            variant="ghost"
            icon="i-lucide-arrow-left"
            label="Start Over"
            @click="resetWizard"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Step Indicator -->
        <div class="flex items-center justify-center gap-4 mb-8">
          <div
            v-for="step in 4"
            :key="step"
            class="flex items-center gap-2"
          >
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center font-medium transition-colors"
              :class="[
                currentStep >= step
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
              ]"
            >
              {{ step }}
            </div>
            <span
              class="text-sm hidden sm:inline"
              :class="currentStep >= step ? 'text-primary-600 font-medium' : 'text-gray-400'"
            >
              {{ ['Select Template', 'Discovery', 'Project Details', 'Review'][step - 1] }}
            </span>
            <UIcon
              v-if="step < 4"
              name="i-lucide-chevron-right"
              class="w-5 h-5 text-gray-300"
            />
          </div>
        </div>

        <!-- Step 1: Select Template -->
        <div v-if="currentStep === 1">
          <h2 class="text-xl font-semibold mb-4">Choose a Project Template</h2>
          <p class="text-gray-500 mb-6">
            Select a template to generate your project structure with AI assistance.
          </p>

          <div v-if="loadingTemplates" class="flex items-center justify-center py-12">
            <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
          </div>

          <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <UCard
              v-for="template in templates"
              :key="template.id"
              class="cursor-pointer hover:shadow-md hover:border-primary-500 transition-all"
              @click="selectTemplate(template)"
            >
              <div class="flex flex-col h-full">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <h3 class="font-semibold text-lg">{{ template.name }}</h3>
                    <UBadge v-if="template.category" variant="subtle" color="neutral" class="mt-1">
                      {{ template.category }}
                    </UBadge>
                  </div>
                  <UBadge v-if="template.isSystem" variant="subtle" color="primary" size="xs">
                    System
                  </UBadge>
                </div>

                <p v-if="template.description" class="text-sm text-gray-500 mb-4 line-clamp-2">
                  {{ template.description }}
                </p>

                <div class="grid grid-cols-2 gap-3 mt-auto">
                  <div>
                    <p class="text-xs text-gray-400">Duration</p>
                    <p class="font-medium">{{ template.estimatedDuration || '—' }} days</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-400">Budget</p>
                    <p class="font-medium">
                      {{ formatCurrency(template.estimatedBudget?.min) }} - {{ formatCurrency(template.estimatedBudget?.max) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-400">Phases</p>
                    <p class="font-medium">{{ template.phases?.length || 0 }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-gray-400">Team Size</p>
                    <p class="font-medium">{{ template.recommendedTeamSize || '—' }}</p>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <!-- Recent Sessions -->
          <div v-if="recentSessions.length > 0" class="mt-12">
            <h3 class="text-lg font-semibold mb-4">Recent AI Sessions</h3>
            <div class="space-y-2">
              <UCard
                v-for="session in recentSessions"
                :key="session.id"
                class="flex items-center justify-between p-4"
              >
                <div>
                  <p class="font-medium">{{ session.projectName || 'Untitled' }}</p>
                  <p class="text-sm text-gray-500">
                    {{ session.templateName }} · {{ formatDate(session.createdAt) }}
                  </p>
                </div>
                <div class="flex items-center gap-3">
                  <UBadge :color="getSessionStatusColor(session.status)" variant="subtle">
                    {{ session.status }}
                  </UBadge>
                  <UButton
                    v-if="session.status === 'generated'"
                    size="xs"
                    label="Continue"
                    @click="generationSessionId = session.id; currentStep = 4"
                  />
                </div>
              </UCard>
            </div>
          </div>
        </div>

        <!-- Step 2: Discovery Questions -->
        <div v-if="currentStep === 2 && selectedTemplate">
          <h2 class="text-xl font-semibold mb-2">{{ selectedTemplate.name }}</h2>
          <p class="text-gray-500 mb-6">
            Answer these questions to help AI tailor the project to your needs.
          </p>

          <UCard class="max-w-2xl mx-auto">
            <div class="space-y-6">
              <div
                v-for="(question, idx) in selectedTemplate.discoveryQuestions"
                :key="idx"
              >
                <UFormField
                  :label="question.question"
                  :required="question.required"
                >
                  <template v-if="question.type === 'boolean'">
                    <div class="flex items-center gap-4">
                      <URadio
                        :model-value="discoveryAnswers[question.question] === true"
                        label="Yes"
                        @update:model-value="discoveryAnswers[question.question] = true"
                      />
                      <URadio
                        :model-value="discoveryAnswers[question.question] === false"
                        label="No"
                        @update:model-value="discoveryAnswers[question.question] = false"
                      />
                    </div>
                  </template>
                  <template v-else-if="question.type === 'select' && question.options">
                    <USelectMenu
                      v-model="discoveryAnswers[question.question]"
                      :items="question.options.map((o: string) => ({ label: o, value: o }))"
                      placeholder="Select an option"
                      value-key="value"
                    />
                  </template>
                  <template v-else>
                    <UInput
                      v-model="discoveryAnswers[question.question]"
                      :type="getInputType(question.type)"
                      placeholder="Enter your answer..."
                    />
                  </template>
                </UFormField>
              </div>

              <div v-if="!selectedTemplate.discoveryQuestions?.length" class="text-center py-8 text-gray-500">
                No discovery questions for this template. Click Continue to proceed.
              </div>
            </div>

            <template #footer>
              <div class="flex justify-between">
                <UButton variant="ghost" label="Back" @click="currentStep = 1" />
                <UButton color="primary" label="Continue" @click="submitDiscovery" />
              </div>
            </template>
          </UCard>
        </div>

        <!-- Step 3: Project Details -->
        <div v-if="currentStep === 3 && selectedTemplate">
          <h2 class="text-xl font-semibold mb-2">Project Details</h2>
          <p class="text-gray-500 mb-6">
            Provide the project details to generate your AI-powered project plan.
          </p>

          <UCard class="max-w-2xl mx-auto">
            <div class="space-y-4">
              <UFormField label="Client" required>
                <USelectMenu
                  v-model="projectDetails.clientId"
                  :items="clients.map(c => ({ label: c.name, value: c.id }))"
                  placeholder="Select client"
                  value-key="value"
                />
              </UFormField>

              <UFormField label="Project Name" required>
                <UInput v-model="projectDetails.projectName" placeholder="Enter project name" />
              </UFormField>

              <UFormField label="Description">
                <UTextarea
                  v-model="projectDetails.description"
                  placeholder="Brief project description..."
                  :rows="3"
                />
              </UFormField>

              <div class="grid grid-cols-2 gap-4">
                <UFormField label="Start Date">
                  <UInput v-model="projectDetails.startDate" type="date" />
                </UFormField>

                <UFormField label="Target Budget">
                  <UInput
                    v-model.number="projectDetails.targetBudget"
                    type="number"
                    :placeholder="`${formatCurrency(selectedTemplate.estimatedBudget?.min)} - ${formatCurrency(selectedTemplate.estimatedBudget?.max)}`"
                  />
                </UFormField>
              </div>
            </div>

            <template #footer>
              <div class="flex justify-between">
                <UButton variant="ghost" label="Back" @click="currentStep = 2" />
                <UButton
                  color="primary"
                  label="Generate Project"
                  icon="i-lucide-sparkles"
                  :loading="generating"
                  @click="generateProject"
                />
              </div>
            </template>
          </UCard>
        </div>

        <!-- Step 4: Review Generated Project -->
        <div v-if="currentStep === 4 && generatedProject">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-xl font-semibold">Review Generated Project</h2>
              <p class="text-gray-500">
                AI has generated a project plan based on your inputs. Review and apply.
              </p>
            </div>
            <UButton
              color="primary"
              size="lg"
              label="Create Project"
              icon="i-lucide-check"
              :loading="applying"
              @click="applyProject"
            />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Project Overview -->
            <UCard class="lg:col-span-2">
              <template #header>
                <h3 class="font-semibold">Project Overview</h3>
              </template>
              <dl class="grid grid-cols-2 gap-4">
                <div>
                  <dt class="text-sm text-gray-500">Name</dt>
                  <dd class="font-medium">{{ generatedProject.projectName }}</dd>
                </div>
                <div>
                  <dt class="text-sm text-gray-500">Duration</dt>
                  <dd class="font-medium">{{ generatedProject.estimatedDuration }} days</dd>
                </div>
                <div>
                  <dt class="text-sm text-gray-500">Estimated Budget</dt>
                  <dd class="font-medium">{{ formatCurrency(generatedProject.estimatedBudget) }}</dd>
                </div>
                <div>
                  <dt class="text-sm text-gray-500">Total Hours</dt>
                  <dd class="font-medium">{{ generatedProject.estimatedHours }}h</dd>
                </div>
              </dl>
            </UCard>

            <!-- Summary -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Summary</h3>
              </template>
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-gray-500">Phases</span>
                  <span class="font-medium">{{ generatedProject.phases?.length || 0 }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Tasks</span>
                  <span class="font-medium">{{ generatedProject.tasks?.length || 0 }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-500">Team Size</span>
                  <span class="font-medium">{{ generatedProject.recommendedTeamSize || '—' }}</span>
                </div>
              </div>
            </UCard>

            <!-- Phases -->
            <UCard class="lg:col-span-3">
              <template #header>
                <h3 class="font-semibold">Project Phases</h3>
              </template>
              <div class="space-y-4">
                <div
                  v-for="(phase, idx) in generatedProject.phases"
                  :key="idx"
                  class="p-4 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div class="flex items-center justify-between mb-2">
                    <h4 class="font-medium">{{ phase.name }}</h4>
                    <span class="text-sm text-gray-500">{{ phase.durationDays }} days</span>
                  </div>
                  <div v-if="phase.deliverables?.length" class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="deliverable in phase.deliverables"
                      :key="deliverable"
                      variant="subtle"
                      size="xs"
                    >
                      {{ deliverable }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Tasks Preview -->
            <UCard class="lg:col-span-3">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Generated Tasks</h3>
                  <span class="text-sm text-gray-500">{{ generatedProject.tasks?.length || 0 }} tasks</span>
                </div>
              </template>
              <div class="space-y-2 max-h-96 overflow-y-auto">
                <div
                  v-for="(task, idx) in generatedProject.tasks"
                  :key="idx"
                  class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div>
                    <p class="font-medium">{{ task.name }}</p>
                    <p class="text-sm text-gray-500">
                      {{ task.phase }}
                      <span v-if="task.estimatedHours"> · {{ task.estimatedHours }}h</span>
                    </p>
                  </div>
                  <div v-if="task.requiredSkills?.length" class="flex gap-1">
                    <UBadge
                      v-for="skill in task.requiredSkills.slice(0, 2)"
                      :key="skill"
                      variant="subtle"
                      color="neutral"
                      size="xs"
                    >
                      {{ skill }}
                    </UBadge>
                    <UBadge v-if="task.requiredSkills.length > 2" variant="subtle" color="neutral" size="xs">
                      +{{ task.requiredSkills.length - 2 }}
                    </UBadge>
                  </div>
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>
