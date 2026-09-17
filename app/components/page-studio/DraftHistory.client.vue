<script setup lang="ts">
import { PageStudioHistoryMutationSchema, type PageStudioHistoryItem, type PageStudioHistoryMutation, type PageStudioHistoryReceipt, type PageStudioHistoryState } from '~~/shared/pageStudio/draftHistory'

const props = defineProps<{
  siteId: string
  audience: 'agency' | 'portal'
}>()
const emit = defineEmits<{ changed: [] }>()
const kind = ref<'drafts' | 'versions'>('drafts')
const cursor = ref<string | null>(null)
const endpoint = computed(() => `/api/${props.audience}/page-studio/sites/${props.siteId}/history`)
const { data, error, pending, refresh } = await useFetch<PageStudioHistoryState>(endpoint, {
  query: computed(() => ({ kind: kind.value, ...(cursor.value ? { cursor: cursor.value } : {}) }))
})
const toast = useToast()
const { launchPageStudio } = usePageStudioLauncher()
const dialog = ref<'restore' | 'name' | null>(null)
const dialogOpen = computed({ get: () => dialog.value !== null, set: (value) => {
  if (!value && !saving.value)
    dialog.value = null
} })
const selected = ref<PageStudioHistoryItem | null>(null)
const base = ref<string | null>(null)
const name = ref('')
const operation = ref<PageStudioHistoryMutation | null>(null)
const saving = ref(false)
const problem = ref<'uncertain' | 'conflict' | 'denied' | null>(null)
const launching = ref(false)
const message = ref('')
const changed = computed(() => Boolean(base.value && data.value?.currentCheckpointId !== base.value))
const canConfirm = computed(() => !saving.value && !pending.value && !error.value && data.value?.canEdit
  && !problem.value && !changed.value && Boolean(base.value)
  && (dialog.value === 'restore' || (name.value.trim().length > 0 && name.value.trim().length <= 120)))
watch(() => [props.siteId, props.audience], () => {
  dialog.value = null
  operation.value = null
  cursor.value = null
  message.value = ''
})
function choose(next: 'drafts' | 'versions') {
  if (!saving.value) {
    cursor.value = null
    kind.value = next
  }
}
function open(action: 'name' | 'restore', item?: PageStudioHistoryItem) {
  if (!data.value?.canEdit || !data.value.currentCheckpointId || error.value || pending.value || saving.value)
    return
  dialog.value = action
  selected.value = item ?? null
  base.value = data.value.currentCheckpointId
  name.value = ''
  operation.value = null
  problem.value = null
}
function date(value: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value))
}
async function save(retry = false) {
  if (saving.value || (!retry && !canConfirm.value))
    return
  if (!retry) {
    const parsed = PageStudioHistoryMutationSchema.safeParse(dialog.value === 'restore'
      ? { action: 'restore', checkpointId: selected.value?.checkpointId, expectedCheckpointId: base.value, requestId: crypto.randomUUID() }
      : { action: 'name', name: name.value, expectedCheckpointId: base.value, requestId: crypto.randomUUID() })
    if (!parsed.success)
      return
    operation.value = parsed.data
  }
  if (!operation.value || error.value || !data.value?.canEdit)
    return
  const command = operation.value
  const target = endpoint.value
  saving.value = true
  try {
    const result = await $fetch<PageStudioHistoryReceipt>(target, { method: 'POST', body: command })
    if (endpoint.value !== target)
      return
    message.value = result.isCurrent
      ? command.action === 'restore' ? 'Earlier draft restored. Reopen Studio to continue editing it.' : 'Named version saved. It remains a draft until reviewed and published.'
      : 'Your request was saved, and a newer draft now exists. History shows the latest saved work.'
    dialog.value = null
    operation.value = null
    problem.value = null
    toast.add({ title: 'Draft history updated', description: message.value, color: 'success' })
    emit('changed')
    await refresh()
  } catch (cause) {
    const status = (cause as {
      statusCode?: number
      status?: number
    })?.statusCode ?? (cause as {
      status?: number
    })?.status
    problem.value = status === 409 ? 'conflict' : status === 401 || status === 403 ? 'denied' : 'uncertain'
  } finally {
    saving.value = false
  }
}
async function reload() {
  dialog.value = null
  operation.value = null
  problem.value = null
  cursor.value = null
  await refresh()
}
async function launch() {
  launching.value = true
  try {
    await launchPageStudio(props.siteId, props.audience)
  } catch {
    toast.add({ title: 'Studio could not open', description: 'Try opening Studio again.', color: 'error' })
  } finally {
    launching.value = false
  }
}
</script>

<template>
  <section class="min-w-0 space-y-5 py-5">
    <UAlert
      v-if="error"
      color="error"
      title="Draft history could not be loaded"
      description="Refresh to check your access and load saved drafts."
    />
    <template v-else>
      <header class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-2xl">
          <h2 class="text-lg font-semibold text-highlighted">
            Draft history
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ data?.siteName }}: return to saved work or name a version before making changes.
          </p>
          <p class="mt-2 text-sm text-muted">
            Only changes saved to your website draft appear here. Finish saving in Studio before restoring an earlier draft.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="data?.canEdit"
            label="Save named version"
            icon="i-lucide-bookmark"
            :disabled="!data.currentCheckpointId || pending || saving"
            @click="open('name')"
          />
          <UButton
            v-if="data?.canEdit"
            label="Open Studio"
            color="neutral"
            variant="outline"
            :loading="launching"
            @click="launch"
          />
        </div>
      </header>
      <UAlert v-if="message" color="success" :title="message" />
      <p v-if="data && !data.canEdit" class="text-sm text-muted">
        Read-only access
      </p>
      <div class="flex flex-wrap gap-2" aria-label="History view">
        <UButton
          label="Saved drafts"
          :variant="kind === 'drafts' ? 'solid' : 'outline'"
          color="neutral"
          :disabled="saving"
          @click="choose('drafts')"
        />
        <UButton
          label="Named versions"
          :variant="kind === 'versions' ? 'solid' : 'outline'"
          color="neutral"
          :disabled="saving"
          @click="choose('versions')"
        />
      </div>
      <p v-if="pending" role="status" class="text-sm text-muted">
        Loading saved work…
      </p>
      <div v-else-if="data?.items.length" class="divide-y divide-default border-y border-default">
        <article v-for="item in data.items" :key="item.id" class="flex flex-wrap items-center justify-between gap-3 py-4">
          <div class="min-w-0 space-y-1">
            <h3 class="break-words font-medium text-highlighted">
              {{ item.name || 'Saved draft' }}
            </h3>
            <p class="text-sm text-muted">
              {{ date(item.createdAt) }}
            </p>
            <div class="flex flex-wrap gap-2">
              <UBadge v-if="item.checkpointId === data.currentCheckpointId" color="primary" variant="subtle">
                Current draft
              </UBadge>
              <UBadge v-if="kind === 'versions'" color="neutral" variant="subtle">
                {{ item.status.replaceAll('_', ' ') }}
              </UBadge>
            </div>
          </div>
          <UButton
            v-if="data.canEdit && item.checkpointId !== data.currentCheckpointId"
            label="Restore"
            icon="i-lucide-history"
            color="neutral"
            variant="outline"
            :disabled="saving || !data.currentCheckpointId"
            @click="open('restore', item)"
          />
        </article>
      </div>
      <p v-else class="text-sm text-muted">
        {{ kind === 'drafts' ? 'No saved drafts yet. Open Studio and save your first changes.' : 'No versions yet. Save a named version to mark a point you want to return to.' }}
      </p>
      <div class="flex flex-wrap justify-between gap-2">
        <UButton
          v-if="cursor"
          label="Latest"
          color="neutral"
          variant="outline"
          :disabled="pending || saving"
          @click="cursor = null"
        />
        <UButton
          v-if="data?.nextCursor"
          label="Older saved work"
          color="neutral"
          variant="outline"
          :disabled="pending || saving"
          @click="cursor = data.nextCursor"
        />
      </div>
    </template>
    <UButton
      label="Refresh history"
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="ghost"
      :disabled="saving || dialogOpen"
      :loading="pending"
      @click="reload"
    />
    <UModal
      v-model:open="dialogOpen"
      :dismissible="!saving"
      :title="dialog === 'restore' ? 'Restore earlier draft' : 'Save named version'"
      :description="dialog === 'restore' ? 'This creates a new draft from the selected saved work. Your current saved draft stays in history. Your live website stays as it is.' : 'Name the currently saved draft so you can find it later. This does not publish it.'"
    >
      <template #body>
        <div class="space-y-4">
          <template v-if="!error && data?.canEdit">
            <p v-if="dialog === 'restore' && selected" class="text-sm text-muted">
              {{ selected.name || 'Saved draft' }} — {{ date(selected.createdAt) }}
            </p>
            <UFormField v-else label="Version name" help="For example, Before homepage redesign">
              <UInput
                v-model="name"
                class="w-full"
                :maxlength="120"
                :disabled="saving || Boolean(operation)"
              />
            </UFormField>
          </template>
          <UAlert
            v-if="problem === 'uncertain'"
            color="warning"
            title="The save could not be confirmed"
            description="Retry the same request to check its result safely."
          />
          <UAlert
            v-else-if="problem === 'conflict' || changed"
            color="warning"
            title="The saved draft changed"
            description="Close this dialog and refresh history before selecting a draft again."
          />
          <UAlert
            v-if="problem === 'denied' || error || !data?.canEdit"
            color="error"
            title="Editing access is unavailable"
            description="Refresh history to check your access."
          />
        </div>
      </template>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            label="Close"
            color="neutral"
            variant="outline"
            :disabled="saving"
            @click="dialog = null"
          />
          <UButton
            v-if="problem === 'uncertain' && !error && data?.canEdit"
            label="Retry same request"
            :loading="saving"
            @click="save(true)"
          />
          <UButton
            v-else-if="!problem"
            :label="dialog === 'restore' ? 'Restore as new draft' : 'Save version'"
            :disabled="!canConfirm"
            :loading="saving"
            @click="save()"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
