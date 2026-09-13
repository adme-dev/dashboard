<script setup lang="ts">
interface SetupState {
  name: string
  supported: boolean
  canEdit: boolean
  serviceAvailable: boolean
  proposal: null | { revision: number, status: 'proposed' | 'accepted' | 'rejected', source: 'template' | 'chat', brief: string | null, plan: { pages?: string[], modules?: string[], missingFacts?: string[] } }
  provisioning: { phase: string, updatedAt: string } | null
}
const props = defineProps<{ siteId: string }>()
const toast = useToast()
const saving = ref(false)
const editing = ref(false)
const editRevision = ref(0)
const brief = ref('')
const failure = ref<string | null>(null)
const { data, pending, error, refresh } = useFetch<SetupState>(() => `/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/setup-proposal`, { server: false })
const blocked = computed(() => saving.value || pending.value || Boolean(error.value))
const editable = computed(() => data.value?.supported && data.value.canEdit && data.value.proposal?.status !== 'accepted')
const status = computed(() => {
  if (data.value?.provisioning?.phase === 'complete') return 'Initial website content saved'
  if (data.value?.provisioning?.phase === 'failed') return 'Setup needs attention'
  if (data.value?.provisioning) return 'Website setup in progress'
  if (data.value?.proposal?.status === 'accepted') return 'Plan approved'
  if (data.value?.proposal?.status === 'rejected') return 'Changes requested'
  return data.value?.proposal ? 'Awaiting review' : 'Prepare your website plan'
})
function edit() {
  if (!editable.value || blocked.value) return
  brief.value = data.value?.proposal?.brief ?? ''
  editRevision.value = data.value?.proposal?.revision ?? 0
  failure.value = null
  editing.value = true
}
async function save() {
  if (!editable.value || blocked.value) return
  if (editRevision.value !== (data.value?.proposal?.revision ?? 0)) {
    failure.value = 'The website plan changed. Copy your details, cancel changes and review the current plan before editing again.'
    return
  }
  saving.value = true
  failure.value = null
  try {
    await $fetch(`/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/setup-proposal`, {
      method: 'POST',
      body: { expectedRevision: editRevision.value, setupSource: brief.value.trim() ? 'chat' : 'template', setupBrief: brief.value.trim() }
    })
    editing.value = false
    await refresh()
    toast.add({ title: 'Website plan submitted', description: 'Your agency can now review the pages, features and business details.', color: 'success' })
  } catch {
    failure.value = 'The plan could not be saved. Your details remain here. Refresh the status and check the current revision before trying again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6" data-testid="portal-website-setup">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold text-highlighted">
          {{ data?.name || 'Website' }} setup
        </h1>
        <p class="mt-2 max-w-prose text-sm text-muted">
          Review your website plan and provide the business details needed before launch.
        </p>
      </div>
      <UButton
        label="Back to websites"
        to="/portal/page-studio"
        color="neutral"
        variant="outline"
      />
    </div>
    <UAlert
      v-if="error"
      title="Setup could not be loaded"
      description="Refresh the status or contact your agency to check website access."
      color="error"
    />
    <UAlert v-else-if="pending && !data" title="Loading website setup" color="neutral" />
    <template v-else-if="data">
      <UAlert
        v-if="!data.supported"
        title="This website uses a different setup process"
        description="Contact your agency to update its business details."
        color="info"
      />
      <UCard v-else class="@container">
        <div class="space-y-5">
          <div>
            <h2 class="font-semibold text-highlighted">
              {{ status }}
            </h2>
            <p v-if="data.proposal" class="mt-1 text-sm text-muted">
              Revision {{ data.proposal.revision }}
            </p>
          </div>
          <template v-if="data.proposal">
            <dl class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <div>
                <dt class="text-sm font-medium">
                  Pages
                </dt><dd class="mt-1 break-words text-sm text-muted">
                  {{ data.proposal.plan.pages?.join(', ') || 'No pages recorded' }}
                </dd>
              </div>
              <div>
                <dt class="text-sm font-medium">
                  Features
                </dt><dd class="mt-1 break-words text-sm text-muted">
                  {{ data.proposal.plan.modules?.map(value => value.replaceAll('-', ' ')).join(', ') || 'No features recorded' }}
                </dd>
              </div>
            </dl>
            <div v-if="data.proposal.plan.missingFacts?.length">
              <h3 class="text-sm font-medium">
                Details to confirm before launch
              </h3>
              <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                <li v-for="fact in data.proposal.plan.missingFacts" :key="fact">
                  {{ fact }}
                </li>
              </ul>
            </div>
            <p v-if="data.proposal.brief && !editing" class="whitespace-pre-wrap break-words text-sm text-muted">
              {{ data.proposal.brief }}
            </p>
          </template>
          <UAlert v-if="failure" :title="failure" color="error" />
          <template v-if="editable && (editing || !data.proposal)">
            <UFormField label="Business details" description="Include confirmed services, prices, hours, locations, contact details and policies. Leave unknown facts for review.">
              <UTextarea
                v-model="brief"
                class="w-full"
                :rows="6"
                :maxlength="4000"
                :disabled="saving"
              />
            </UFormField>
            <div class="flex flex-wrap justify-end gap-3">
              <UButton
                v-if="data.proposal"
                label="Cancel changes"
                color="neutral"
                variant="outline"
                :disabled="saving"
                @click="editing = false"
              />
              <UButton
                label="Submit plan for review"
                :loading="saving"
                :disabled="blocked"
                @click="save"
              />
            </div>
          </template>
          <UButton
            v-else-if="editable"
            label="Update business details"
            color="neutral"
            variant="outline"
            :disabled="blocked"
            @click="edit"
          />
          <p v-if="data.proposal?.status === 'accepted' && !data.provisioning" class="text-sm text-muted">
            Your plan is approved. Your agency will confirm when website setup can start.
          </p>
          <p v-else-if="data.proposal?.status === 'accepted'" class="text-sm text-muted">
            Contact your agency if the approved plan needs to change. Publishing follows a separate review.
          </p>
          <p v-else class="text-sm text-muted">
            Your agency reviews the plan before setup begins. Submitting details does not publish your website.
          </p>
        </div>
      </UCard>
    </template>
    <div class="flex justify-end">
      <UButton
        label="Refresh status"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="pending"
        :disabled="saving"
        @click="refresh()"
      />
    </div>
  </section>
</template>
