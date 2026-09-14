<script setup lang="ts">
interface Submission {
  fields: Record<string, string>
  formName?: string
  formId: string
  id: string
  isTest: boolean
  pageRoute: string
  submittedAt: string
}

const props = defineProps<{ siteId: string }>()
const endpoint = computed(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/forms/submissions`)
const { data, status, error, refresh, clear } = await useFetch<{ submissions: Submission[] }>(endpoint, { watch: false })
const submissions = computed(() => data.value?.submissions ?? [])
const mode = ref('all')
const selectedId = ref<string | null>(null)
const modes = [
  { label: 'All submissions', value: 'all' },
  { label: 'Live only', value: 'live' },
  { label: 'Test only', value: 'test' }
]
const filtered = computed(() => submissions.value.filter(submission =>
  mode.value === 'all' || submission.isTest === (mode.value === 'test')
))
const selected = computed(() => status.value === 'success' && !error.value
  ? filtered.value.find(submission => submission.id === selectedId.value)
  : undefined)
const detailsOpen = computed({
  get: () => Boolean(selected.value),
  set: (open: boolean) => {
    if (!open) selectedId.value = null
  }
})
// Own the site transition so clearing old data cannot cancel an automatic fetch.
watch(() => props.siteId, async () => {
  selectedId.value = null
  mode.value = 'all'
  clear()
  await refresh()
}, { flush: 'sync' })
watch(mode, () => {
  selectedId.value = null
})
function submittedDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
const columns = [
  { accessorKey: 'name', header: 'Contact' },
  { accessorKey: 'form', header: 'Form / page' },
  { accessorKey: 'contact', header: 'Contact details' },
  { accessorKey: 'submitted', header: 'Submitted' },
  { accessorKey: 'mode', header: 'Mode' },
  { id: 'details', header: 'Details' }
]
const rows = computed(() => filtered.value.map(submission => ({
  id: submission.id,
  name: submission.fields.full_name || submission.fields.name || 'Unnamed contact',
  form: `${submission.formName || submission.formId} · ${submission.pageRoute || '/'}`,
  contact: submission.fields.email || submission.fields.phone || submission.fields.phone_number || 'Not provided',
  submitted: submittedDate(submission.submittedAt),
  mode: submission.isTest ? 'Test' : 'Live'
})))

function openSubmission(id: unknown) {
  if (typeof id === 'string') selectedId.value = id
}

async function refreshSubmissions() {
  selectedId.value = null
  await refresh()
}
</script>

<template>
  <UCard class="mt-5" :ui="{ body: '!p-0' }">
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 class="font-semibold text-highlighted">
            Form submissions
          </h2>
          <p class="mt-1 text-sm text-muted">
            Review website enquiries and their submitted details.
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          label="Refresh"
          color="neutral"
          variant="outline"
          :loading="status === 'pending'"
          @click="refreshSubmissions"
        />
      </div>
    </template>
    <div class="flex flex-wrap items-end gap-3 border-b border-default p-5">
      <UFormField label="Submission type" class="w-full sm:w-52">
        <USelect v-model="mode" :items="modes" class="w-full" />
      </UFormField>
      <p class="text-sm text-muted" role="status">
        {{ filtered.length }} of {{ submissions.length }} loaded submissions
      </p>
    </div>
    <div v-if="status === 'pending'" class="space-y-3 p-5" aria-busy="true">
      <USkeleton class="h-12" /><USkeleton class="h-36" />
    </div>
    <UAlert
      v-else-if="error"
      class="m-5"
      color="error"
      title="Unable to load submissions"
    />
    <UTable
      v-else-if="rows.length"
      :columns="columns"
      :data="rows"
      class="w-full overflow-x-auto"
    >
      <template #details-cell="{ row }">
        <UButton
          label="View details"
          :aria-label="`View submission from ${row.original.name}`"
          color="neutral"
          variant="ghost"
          @click="openSubmission(row.original.id)"
        />
      </template>
    </UTable>
    <div v-else class="p-10 text-center">
      <UIcon name="i-lucide-inbox" class="mx-auto size-8 text-muted" />
      <h3 class="mt-3 font-medium text-highlighted">
        {{ submissions.length ? 'No matching submissions' : 'No submissions yet' }}
      </h3>
      <p class="mt-1 text-sm text-muted">
        {{ submissions.length ? 'Choose another submission type to see more results.' : 'Live and test form activity will appear here.' }}
      </p>
    </div>
  </UCard>
  <USlideover
    v-model:open="detailsOpen"
    title="Submission details"
    description="The values received from this website form."
    :ui="{ body: 'min-h-0 overflow-y-auto' }"
  >
    <template #body>
      <div v-if="selected" class="min-w-0 space-y-6">
        <UBadge :color="selected.isTest ? 'warning' : 'neutral'" variant="subtle">
          {{ selected.isTest ? 'Test submission' : 'Live submission' }}
        </UBadge>
        <dl class="space-y-4 text-sm">
          <div
            v-for="(value, label) in {
              'Receipt': selected.id,
              'Form': selected.formName || selected.formId,
              'Form ID': selected.formId,
              'Page': selected.pageRoute || '/',
              'Submitted': submittedDate(selected.submittedAt)
            }"
            :key="label"
          >
            <dt class="font-medium text-highlighted">
              {{ label }}
            </dt>
            <dd class="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted">
              {{ value }}
            </dd>
          </div>
        </dl>
        <section aria-label="Submitted fields" class="border-t border-default pt-5">
          <h3 class="font-semibold text-highlighted">
            Submitted fields
          </h3>
          <dl class="mt-4 space-y-4 text-sm">
            <div v-for="(value, field) in selected.fields" :key="field">
              <dt class="font-medium break-words [overflow-wrap:anywhere] text-highlighted">
                {{ field }}
              </dt>
              <dd class="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted">
                {{ value === '' || value == null ? 'Not provided' : value }}
              </dd>
            </div>
          </dl>
          <p v-if="!Object.keys(selected.fields).length" class="mt-3 text-sm text-muted">
            No fields were recorded.
          </p>
        </section>
      </div>
    </template>
  </USlideover>
</template>
