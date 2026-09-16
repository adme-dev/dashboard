<script setup lang="ts">
import { comparePageStudioContent, type PageStudioVersionComparison } from '~~/shared/pageStudio/versionComparison'

const props = defineProps<{ siteId: string, versionId: string }>()
const emit = defineEmits<{ reviewed: [] }>()
const toast = useToast()
const open = ref(false), loading = ref(false), deciding = ref(false)
const comparison = ref<PageStudioVersionComparison | null>(null)
const error = ref(''), comment = ref(''), releaseId = ref<string | undefined>()
let requestId = 0
const endpoint = computed(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/versions/${encodeURIComponent(props.versionId)}`)
const diff = computed(() => comparison.value ? comparePageStudioContent(comparison.value.before, comparison.value.after) : null)
const canDecide = computed(() => !loading.value && !deciding.value && !error.value && comparison.value?.version.current && comparison.value.version.status === 'in_review' && diff.value?.complete)
const groups = computed(() => {
  const pageNames = new Map<string, string>()
  for (const manifest of [comparison.value?.before, comparison.value?.after]) {
    if (!manifest || typeof manifest !== 'object' || !('pages' in manifest) || !Array.isArray(manifest.pages)) continue
    for (const page of manifest.pages) {
      if (page && typeof page.id === 'string' && typeof page.title === 'string') pageNames.set(page.id, `${page.title} (${page.route ?? ''})`)
    }
  }
  const result = new Map<string, { label: string, changes: NonNullable<typeof diff.value>['changes'] }>()
  for (const change of diff.value?.changes ?? []) {
    const parts = change.path.split(' › ')
    const key = parts[0] === 'pages' && parts[1] ? pageNames.get(parts[1]) ?? `Page ${parts[1]}` : 'Website settings'
    if (!result.has(key)) result.set(key, { label: key, changes: [] })
    result.get(key)!.changes.push(change)
  }
  return [...result.values()].map(group => ({ ...group, label: `${group.label} (${group.changes.length} changes)` }))
})
function identity(value: PageStudioVersionComparison) {
  return { digest: value.version.digest, checkpointId: value.version.checkpointId, releaseId: value.live?.releaseId ?? null, hostname: value.live?.hostname ?? null }
}
async function readComparison() {
  return $fetch<PageStudioVersionComparison>(`${endpoint.value}/comparison`, { query: releaseId.value ? { releaseId: releaseId.value } : undefined })
}
async function load() {
  const request = ++requestId
  loading.value = true
  error.value = ''
  comparison.value = null
  try {
    const value = await readComparison()
    if (request === requestId && open.value) {
      comparison.value = value
      releaseId.value = value.live?.releaseId
    }
  } catch {
    if (request === requestId) error.value = 'The version could not be compared. Refresh to load current website and release records.'
  } finally {
    if (request === requestId) loading.value = false
  }
}
async function refreshComparison() {
  releaseId.value = undefined
  await load()
}
async function show() {
  comment.value = ''
  releaseId.value = undefined
  open.value = true
  await load()
}
async function decide(decision: 'approved' | 'rejected' | 'returned_to_draft') {
  if (!canDecide.value || !comparison.value) return
  const selected = comparison.value
  deciding.value = true
  try {
    const fresh = await readComparison()
    if (!fresh.version.current || fresh.version.status !== 'in_review'
      || fresh.version.id !== selected.version.id || JSON.stringify(identity(fresh)) !== JSON.stringify(identity(selected))) {
      comparison.value = fresh
      error.value = 'The website changed. Refresh and inspect the comparison again before deciding.'
      return
    }
    await $fetch(`${endpoint.value}/reviews`, { method: 'POST', body: { decision, comment: comment.value.trim() || undefined, expectedComparison: identity(selected) } })
    toast.add({ title: decision === 'approved' ? 'Version approved' : decision === 'rejected' ? 'Version rejected' : 'Version returned to draft', color: 'success' })
    open.value = false
    emit('reviewed')
  } catch {
    error.value = 'The decision was not confirmed. Refresh the review before trying again.'
  } finally { deciding.value = false }
}
watch(open, (value) => {
  if (!value) {
    requestId++
    loading.value = false
  }
})
</script>

<template>
  <UButton
    label="Review changes"
    color="neutral"
    variant="outline"
    size="sm"
    @click="show"
  />
  <USlideover
    v-model:open="open"
    title="Review website changes"
    description="Compare a saved version with the selected live website before recording a decision."
    :ui="{ content: 'sm:max-w-4xl' }"
    :dismissible="!deciding"
  >
    <template #body>
      <div class="@container space-y-5">
        <UAlert
          v-if="error"
          color="error"
          title="Review needs a refresh"
          :description="error"
        />
        <UButton
          v-if="error"
          label="Refresh comparison"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="refreshComparison"
        />
        <div v-if="loading" aria-busy="true" class="space-y-3">
          <USkeleton class="h-24" /><USkeleton class="h-48" />
        </div>
        <template v-else-if="comparison">
          <div class="space-y-2">
            <h2 class="text-lg font-semibold">
              {{ comparison.siteName }}
            </h2>
            <p class="max-w-prose text-sm">
              {{ comparison.version.summary }}
            </p>
            <dl class="grid grid-cols-1 gap-3 text-sm @lg:grid-cols-2">
              <div>
                <dt class="text-muted">
                  Saved version
                </dt><dd class="break-all">
                  {{ comparison.version.id }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Author
                </dt><dd class="break-all">
                  {{ comparison.version.authorRole }}: {{ comparison.version.authorId }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Saved digest
                </dt><dd class="break-all">
                  {{ comparison.version.digest }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Live comparison
                </dt><dd class="break-all">
                  {{ comparison.live?.hostname ?? 'No active production release' }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Saved at
                </dt><dd>{{ new Date(comparison.version.createdAt).toLocaleString('en-AU') }}</dd>
              </div>
              <div v-if="comparison.live">
                <dt class="text-muted">
                  Live digest
                </dt><dd class="break-all">
                  {{ comparison.live.digest }}
                </dd>
              </div>
            </dl>
          </div>
          <UFormField v-if="comparison.releases.length > 1" label="Compare with live website">
            <USelect
              v-model="releaseId"
              class="w-full"
              :items="comparison.releases.map(item => ({ label: item.hostname, value: item.releaseId }))"
              :disabled="deciding"
              @update:model-value="load"
            />
          </UFormField>
          <UAlert
            v-if="!comparison.version.current"
            color="warning"
            title="Historical version"
            description="You can inspect this version. Open the current submitted version to record a decision."
          />
          <UAlert
            v-else-if="comparison.version.status !== 'in_review'"
            color="neutral"
            title="Already decided"
            :description="`This version is ${comparison.version.status.replaceAll('_', ' ')}.`"
          />
          <UAlert
            v-if="!diff?.complete"
            color="warning"
            title="Comparison limit reached"
            description="This comparison is incomplete. A decision cannot be recorded from this view."
          />
          <p v-if="!diff?.changes.length" class="text-sm text-muted">
            No content changes from the selected live version.
          </p>
          <UAccordion :items="groups">
            <template #content="{ item }">
              <div class="space-y-5 pb-4">
                <section v-for="(change, index) in item.changes" :key="index" class="space-y-2">
                  <h3 class="break-words text-sm font-medium">
                    {{ change.path }}
                  </h3>
                  <UBadge :label="change.kind" color="neutral" variant="subtle" />
                  <div class="grid grid-cols-1 gap-3 @lg:grid-cols-2">
                    <div>
                      <p class="mb-1 text-xs text-muted">
                        Live
                      </p><pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-elevated p-3 text-xs">{{ change.before ?? 'Not present' }}</pre>
                    </div>
                    <div>
                      <p class="mb-1 text-xs text-muted">
                        Saved version
                      </p><pre class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-elevated p-3 text-xs">{{ change.after ?? 'Not present' }}</pre>
                    </div>
                  </div>
                </section>
              </div>
            </template>
          </UAccordion>
          <UFormField v-if="comparison.version.current && comparison.version.status === 'in_review'" label="Review comment" hint="Optional">
            <UTextarea
              v-model="comment"
              class="w-full"
              :maxlength="4000"
              :disabled="deciding"
            />
          </UFormField>
          <p class="text-sm text-muted">
            Approval makes this version eligible for publishing. It does not publish the website.
          </p>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap gap-2">
        <UButton
          label="Approve version"
          :disabled="!canDecide"
          :loading="deciding"
          @click="decide('approved')"
        />
        <UButton
          label="Return to draft"
          color="neutral"
          variant="outline"
          :disabled="!canDecide"
          @click="decide('returned_to_draft')"
        />
        <UButton
          label="Reject version"
          color="error"
          variant="ghost"
          :disabled="!canDecide"
          @click="decide('rejected')"
        />
      </div>
    </template>
  </USlideover>
</template>
