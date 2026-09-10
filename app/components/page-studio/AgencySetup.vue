<script setup lang="ts">
interface SetupProposal {
  revision: number
  status: 'proposed' | 'accepted' | 'rejected'
  source: 'template' | 'chat'
  brief: string | null
  plan: { pages?: string[], modules?: string[], missingFacts?: string[] }
}
interface SetupState {
  supported: boolean
  serviceAvailable: boolean
  proposal: SetupProposal | null
  provisioning: { phase: string, updatedAt: string } | null
}
type SetupAction = 'accepted' | 'rejected' | 'provision'
const props = defineProps<{ siteId: string }>()
const { canWrite, hasPermission } = useAuth()
const canEdit = computed(() => canWrite.value && hasPermission('PAGE_STUDIO_EDIT'))
const canApprove = computed(() => canWrite.value && hasPermission('PAGE_STUDIO_APPROVE'))
const toast = useToast()
const saving = ref(false)
const editing = ref(false)
const message = ref<string | null>(null)
const form = reactive({ setupSource: 'template' as 'template' | 'chat', setupBrief: '' })
const approaches = [{ label: 'Use the starter template', value: 'template' }, { label: 'Use a website brief', value: 'chat' }]
const confirmation = ref<{ action: SetupAction, revision: number, siteId: string } | null>(null)
const confirmationOpen = computed({ get: () => Boolean(confirmation.value), set: (open: boolean) => {
  if (!open && !saving.value) confirmation.value = null
} })
const { data, pending, error, refresh } = useFetch<SetupState>(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/setup-proposal`, { server: false })
const proposal = computed(() => data.value?.proposal)
const job = computed(() => data.value?.provisioning)
const blocked = computed(() => saving.value || pending.value || Boolean(error.value))
const phaseText = computed(() => ({
  'requested': 'Waiting for processing', 'validated': 'Preparing website resources',
  'resources-created': 'Preparing the website', 'site-seeded': 'Saving business content',
  'content-seeded': 'Saving initial pages', 'complete': 'Initial content saved', 'failed': 'Setup needs attention'
}[job.value?.phase ?? ''] ?? 'Checking setup progress'))
const confirmLabel = computed(() => confirmation.value?.action === 'provision' ? 'Start setup' : confirmation.value?.action === 'accepted' ? 'Confirm approval' : 'Confirm rejection')

function revise() {
  if (!canEdit.value || blocked.value || proposal.value?.status === 'accepted') return
  form.setupSource = proposal.value?.source ?? 'template'
  form.setupBrief = proposal.value?.brief ?? ''
  editing.value = true
  message.value = null
}
function cancelChanges() {
  if (!saving.value) editing.value = false
}
function failure(error: unknown) {
  const candidate = error as { data?: { statusMessage?: string } }
  message.value = candidate?.data?.statusMessage || 'The setup could not be updated. Refresh its status before trying again.'
}
async function saveProposal() {
  if (!canEdit.value || blocked.value || proposal.value?.status === 'accepted') return
  message.value = null
  if (form.setupSource === 'chat' && !form.setupBrief.trim()) {
    message.value = 'Enter a website brief before creating the proposal.'
    return
  }
  saving.value = true
  try {
    await $fetch(`/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/setup-proposal`, {
      method: 'POST', body: { expectedRevision: proposal.value?.revision ?? 0, setupSource: form.setupSource, setupBrief: form.setupBrief.trim() }
    })
    editing.value = false
    await refresh()
    toast.add({ title: 'Setup proposal saved', description: 'Review its pages, features and missing information before approval.', color: 'success' })
  } catch (error) {
    failure(error)
  } finally {
    saving.value = false
  }
}
function ask(action: SetupAction) {
  if (!proposal.value || blocked.value) return
  if (action === 'provision' ? !canEdit.value || !data.value?.serviceAvailable || Boolean(job.value) || proposal.value.status !== 'accepted' : !canApprove.value || proposal.value.status !== 'proposed') return
  confirmation.value = { action, revision: proposal.value.revision, siteId: props.siteId }
}
async function confirmAction() {
  const intent = confirmation.value
  if (!intent || blocked.value) return
  message.value = null
  if (intent.siteId !== props.siteId || intent.revision !== proposal.value?.revision) {
    message.value = 'The setup proposal changed. Refresh and review the current revision.'
    confirmation.value = null
    return
  }
  if (intent.action === 'provision' ? !canEdit.value || !data.value?.serviceAvailable || Boolean(job.value) || proposal.value.status !== 'accepted' : !canApprove.value || proposal.value.status !== 'proposed') return
  saving.value = true
  try {
    if (intent.action === 'provision') {
      await $fetch(`/api/agency/page-studio/sites/${encodeURIComponent(intent.siteId)}/provision`, { method: 'POST', body: { expectedRevision: intent.revision } })
    } else {
      await $fetch(`/api/agency/page-studio/setup-proposals/${encodeURIComponent(intent.siteId)}/decision`, { method: 'POST', body: { decision: intent.action, expectedRevision: intent.revision } })
    }
    confirmation.value = null
    await refresh()
    toast.add({ title: intent.action === 'provision' ? 'Website setup requested' : `Setup ${intent.action}`, color: 'success' })
  } catch (error) {
    failure(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UCard v-if="data?.supported !== false" class="@container min-w-0" data-testid="agency-website-setup">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold text-highlighted">
            Website setup
          </h2>
          <p class="mt-1 max-w-prose text-sm text-muted">
            Prepare the website’s pages and business content from a reviewed plan.
          </p>
        </div>
        <UButton
          label="Refresh setup"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="pending"
          :disabled="saving"
          @click="refresh()"
        />
      </div>
    </template>
    <div class="space-y-5">
      <UAlert
        v-if="error"
        title="Setup could not be loaded"
        description="Refresh setup to try again. Your saved proposal has not been changed."
        color="error"
      />
      <UAlert v-else-if="pending && !data" title="Loading website setup" color="neutral" />
      <template v-else-if="data">
        <UAlert v-if="message" :title="message" color="error" />
        <div v-if="proposal" class="space-y-4">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge :label="proposal.status === 'accepted' ? 'Approved' : proposal.status === 'rejected' ? 'Changes requested' : 'Awaiting review'" :color="proposal.status === 'accepted' ? 'success' : 'warning'" variant="subtle" />
            <span class="text-sm text-muted">Revision {{ proposal.revision }}</span>
          </div>
          <dl class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <div>
              <dt class="text-sm font-medium text-highlighted">
                Pages
              </dt><dd class="mt-1 break-words text-sm text-muted">
                {{ proposal.plan.pages?.join(', ') || 'No pages recorded' }}
              </dd>
            </div>
            <div>
              <dt class="text-sm font-medium text-highlighted">
                Features
              </dt><dd class="mt-1 break-words text-sm text-muted">
                {{ proposal.plan.modules?.map(value => value.replaceAll('-', ' ')).join(', ') || 'No features recorded' }}
              </dd>
            </div>
          </dl>
          <div v-if="proposal.plan.missingFacts?.length">
            <h3 class="text-sm font-medium text-highlighted">
              Details to confirm before launch
            </h3>
            <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              <li v-for="fact in proposal.plan.missingFacts" :key="fact">
                {{ fact }}
              </li>
            </ul>
          </div>
          <p v-if="proposal.brief" class="max-w-prose whitespace-pre-wrap break-words text-sm text-muted">
            {{ proposal.brief }}
          </p>
        </div>
        <div v-if="canEdit && (!proposal || editing)" class="grid grid-cols-1 gap-4">
          <UFormField label="Setup approach">
            <USelect
              v-model="form.setupSource"
              :items="approaches"
              class="w-full"
              :disabled="blocked"
            />
          </UFormField>
          <UFormField label="Website brief" :description="form.setupSource === 'chat' ? 'Describe the business, pages and features needed.' : 'Optional: add requirements for the starter template.'" :required="form.setupSource === 'chat'">
            <UTextarea
              v-model="form.setupBrief"
              class="w-full"
              :rows="4"
              :maxlength="4000"
              :disabled="blocked"
              placeholder="Describe the client’s website requirements and confirmed business details."
            />
          </UFormField>
          <div class="flex flex-wrap gap-2">
            <UButton
              :label="proposal ? 'Save revised proposal' : 'Create setup proposal'"
              :loading="saving"
              :disabled="blocked"
              @click="saveProposal"
            />
            <UButton
              v-if="editing"
              label="Cancel changes"
              color="neutral"
              variant="ghost"
              :disabled="saving"
              @click="cancelChanges"
            />
          </div>
        </div>
        <p v-else-if="!proposal" class="text-sm text-muted">
          A team member with website editing access can prepare the setup proposal.
        </p>
        <div v-if="proposal && !editing" class="flex flex-wrap gap-2">
          <UButton
            v-if="canApprove && proposal.status === 'proposed'"
            label="Approve setup"
            :disabled="blocked"
            @click="ask('accepted')"
          />
          <UButton
            v-if="canApprove && proposal.status === 'proposed'"
            label="Request changes"
            color="neutral"
            variant="outline"
            :disabled="blocked"
            @click="ask('rejected')"
          />
          <UButton
            v-if="canEdit && proposal.status !== 'accepted'"
            label="Revise proposal"
            color="neutral"
            variant="outline"
            :disabled="blocked"
            @click="revise"
          />
          <UButton
            v-if="canEdit && proposal.status === 'accepted' && !job"
            label="Prepare website"
            :disabled="blocked || !data.serviceAvailable"
            @click="ask('provision')"
          />
        </div>
        <UAlert
          v-if="proposal?.status === 'accepted' && !data.serviceAvailable"
          title="Website setup is unavailable"
          description="Contact your administrator to connect the website setup service."
          color="warning"
        />
        <UAlert
          v-if="job"
          :title="phaseText"
          :color="job.phase === 'failed' ? 'error' : job.phase === 'complete' ? 'success' : 'info'"
          :description="job.phase === 'failed' ? 'An administrator needs to inspect this setup before it can continue.' : job.phase === 'complete' ? 'The initial content is saved. Studio access and publishing are managed separately.' : 'Refresh setup to see the latest progress.'"
        />
      </template>
    </div>
  </UCard>
  <UModal
    v-model:open="confirmationOpen"
    :title="confirmation?.action === 'provision' ? 'Prepare this website?' : 'Review website setup'"
    description="Confirm the saved setup revision before continuing."
    :dismissible="!saving"
    :close="!saving"
    :transition="false"
    scrollable
  >
    <template #body>
      <p class="text-sm leading-6 text-muted">
        {{ confirmation?.action === 'provision' ? 'Create the draft pages and business content from the approved plan.' : confirmation?.action === 'accepted' ? 'Approve this plan for website preparation. Confirm the listed missing business details before launch.' : 'Return this plan for changes before website preparation.' }}
        This action does not publish the website.
      </p>
      <p class="mt-3 text-sm font-medium">
        Revision {{ confirmation?.revision }}
      </p>
      <UAlert
        v-if="message"
        class="mt-4"
        :title="message"
        color="error"
      />
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="outline"
          :disabled="saving"
          @click="confirmation = null"
        />
        <UButton
          :label="confirmLabel"
          :loading="saving"
          :disabled="blocked"
          @click="confirmAction"
        />
      </div>
    </template>
  </UModal>
</template>
