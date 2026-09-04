<script setup lang="ts">
interface Submission {
  fields: Record<string, string>
  formId: string
  id: string
  isTest: boolean
  pageRoute: string
  submittedAt: string
}

const props = defineProps<{ siteId: string }>()
const endpoint = computed(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/forms/submissions`)
const { data, status, error, refresh } = await useFetch<{ submissions: Submission[] }>(endpoint)
const submissions = computed(() => data.value?.submissions ?? [])
const columns = [
  { accessorKey: 'name', header: 'Contact' },
  { accessorKey: 'form', header: 'Form / page' },
  { accessorKey: 'contact', header: 'Contact details' },
  { accessorKey: 'submitted', header: 'Submitted' },
  { accessorKey: 'mode', header: 'Mode' }
]
const rows = computed(() => submissions.value.map(submission => ({
  name: submission.fields.full_name || submission.fields.name || 'Unnamed contact',
  form: `${submission.formId} · ${submission.pageRoute || '/'}`,
  contact: submission.fields.email || submission.fields.phone || submission.fields.phone_number || 'Not provided',
  submitted: new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submission.submittedAt)),
  mode: submission.isTest ? 'Synthetic' : 'Live'
})))

async function refreshSubmissions() {
  await refresh()
}
</script>

<template>
  <UCard class="mt-5" :ui="{ body: '!p-0' }">
    <template #header>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-semibold text-highlighted">
            Form submissions
          </h2>
          <p class="mt-1 text-sm text-muted">
            Release-authorized submissions routed into XeroFlow Leads with consent and idempotency controls.
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
      class="w-full"
    />
    <div v-else class="p-10 text-center">
      <UIcon name="i-lucide-inbox" class="mx-auto size-8 text-muted" />
      <h3 class="mt-3 font-medium text-highlighted">
        No submissions yet
      </h3>
      <p class="mt-1 text-sm text-muted">
        Live and synthetic form activity will appear here.
      </p>
    </div>
  </UCard>
</template>
