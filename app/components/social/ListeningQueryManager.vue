<script setup lang="ts">
// Slice 4a — listening query manager. Mirrors ReportSchedulesManager (3c-2): USlideover with a
// list + an editor form (UFormField, term chips, delete-via-UModal). No native dialogs.
import { useSocialListening, type ListeningQuery, type ListeningQueryInput } from '~/composables/useSocialListening'

const props = defineProps<{ open: boolean; clientId: string | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const toast = useToast()
const clientIdRef = computed(() => props.clientId)
const { queries, loadQueries, createQuery, updateQuery, removeQuery } = useSocialListening(clientIdRef)

const localOpen = computed({ get: () => props.open, set: (v: boolean) => emit('update:open', v) })

const categoryOptions = [
  { label: 'Brand', value: 'brand' },
  { label: 'Competitor', value: 'competitor' },
  { label: 'Product', value: 'product' },
  { label: 'Campaign', value: 'campaign' },
]
const sourceOptions = [
  { label: 'Reddit', value: 'reddit' },
  { label: 'News / RSS', value: 'news' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Bluesky', value: 'bluesky' },
  { label: 'Mastodon', value: 'mastodon' },
  { label: 'Hacker News', value: 'hackernews' },
  { label: 'Lemmy', value: 'lemmy' },
]

type Mode = 'list' | 'edit'
const mode = ref<Mode>('list')
const editingId = ref<string | null>(null)
const form = reactive<ListeningQueryInput>({ name: '', includeTerms: [], excludeTerms: [], sources: [], category: 'brand', enabled: true })
const includeRaw = ref('')
const excludeRaw = ref('')
const parseTerms = (raw: string) => [...new Set(raw.split(/[\n,]+/).map(t => t.trim()).filter(Boolean))]
const includeTerms = computed(() => parseTerms(includeRaw.value))
const excludeTerms = computed(() => parseTerms(excludeRaw.value))
const saving = ref(false)
const pendingDelete = ref<ListeningQuery | null>(null)
const deleting = ref(false)

function startCreate() {
  editingId.value = null
  form.name = ''; form.category = 'brand'; form.sources = []; form.enabled = true
  includeRaw.value = ''; excludeRaw.value = ''
  mode.value = 'edit'
}
function startEdit(q: ListeningQuery) {
  editingId.value = q.id
  form.name = q.name; form.category = q.category ?? 'brand'; form.sources = [...(q.sources ?? [])]; form.enabled = q.enabled
  includeRaw.value = (q.include_terms ?? []).join(', ')
  excludeRaw.value = (q.exclude_terms ?? []).join(', ')
  mode.value = 'edit'
}
function backToList() { mode.value = 'list'; editingId.value = null }

async function save() {
  if (!form.name.trim()) { toast.add({ title: 'Name required', color: 'error' }); return }
  if (!includeTerms.value.length) { toast.add({ title: 'Add at least one include term', color: 'error' }); return }
  saving.value = true
  const payload: ListeningQueryInput = { ...form, includeTerms: includeTerms.value, excludeTerms: excludeTerms.value }
  try {
    if (editingId.value) await updateQuery(editingId.value, payload)
    else await createQuery(payload)
    toast.add({ title: editingId.value ? 'Query updated' : 'Query created', color: 'success' })
    backToList()
  } catch { toast.add({ title: 'Could not save query', color: 'error' }) }
  finally { saving.value = false }
}
async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try { await removeQuery(pendingDelete.value.id); toast.add({ title: 'Query deleted', color: 'success' }); pendingDelete.value = null }
  catch { toast.add({ title: 'Could not delete query', color: 'error' }) }
  finally { deleting.value = false }
}

watch(() => [props.open, props.clientId], ([isOpen]) => { if (isOpen) { backToList(); loadQueries() } })
</script>

<template>
  <USlideover v-model:open="localOpen" title="Listening queries" description="Keywords this client is monitored for">
    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-lucide-radar"
          color="neutral"
          variant="subtle"
          title="External sources activate later"
          description="Queries are saved now. Off-property sources (Reddit, News, YouTube, Bluesky, Mastodon, Hacker News, Lemmy) start collecting once an operator enables them; owned mentions from your inbox show immediately."
        />

        <template v-if="mode === 'list'">
          <div v-if="queries.length" class="space-y-2">
            <div v-for="q in queries" :key="q.id" class="rounded-lg border border-default bg-default p-3 flex items-start gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="font-medium truncate">{{ q.name }}</p>
                  <UBadge v-if="q.category" color="primary" variant="subtle" size="xs">{{ q.category }}</UBadge>
                  <UBadge v-if="!q.enabled" color="neutral" variant="subtle" size="xs">Paused</UBadge>
                </div>
                <p class="text-xs text-muted mt-0.5 truncate">{{ (q.include_terms ?? []).join(', ') || 'no terms' }}</p>
                <p class="text-xs text-muted mt-1">{{ (q.sources ?? []).length }} external source(s)</p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" aria-label="Edit" @click="startEdit(q)" />
                <UButton icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete" @click="pendingDelete = q" />
              </div>
            </div>
          </div>
          <div v-else class="rounded-lg border border-dashed border-default p-6 text-center">
            <UIcon name="i-lucide-radar" class="text-muted size-6 mx-auto" />
            <p class="text-sm text-muted mt-2">No listening queries yet.</p>
          </div>
        </template>

        <template v-else>
          <UFormField label="Name" required>
            <UInput v-model="form.name" placeholder="e.g. ACME brand mentions" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Category">
              <USelectMenu v-model="form.category" :items="categoryOptions" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="External sources">
              <USelectMenu v-model="form.sources" :items="sourceOptions" value-key="value" multiple class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Include terms" help="Match if any of these appear. Separate with commas or new lines." required>
            <UTextarea v-model="includeRaw" :rows="2" placeholder="acme, acme widget, @acme" class="w-full" />
          </UFormField>
          <div v-if="includeTerms.length" class="flex flex-wrap gap-1.5 -mt-2">
            <UBadge v-for="t in includeTerms" :key="t" color="primary" variant="subtle" size="sm">{{ t }}</UBadge>
          </div>
          <UFormField label="Exclude terms" help="Drop hits containing any of these (noise control).">
            <UTextarea v-model="excludeRaw" :rows="2" placeholder="stock, acme corp legal" class="w-full" />
          </UFormField>
          <div v-if="excludeTerms.length" class="flex flex-wrap gap-1.5 -mt-2">
            <UBadge v-for="t in excludeTerms" :key="t" color="neutral" variant="subtle" size="sm">{{ t }}</UBadge>
          </div>
          <UFormField label="Enabled" help="Paused queries are skipped by the collector.">
            <USwitch v-model="form.enabled" />
          </UFormField>
        </template>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex items-center justify-end w-full gap-2">
        <template v-if="mode === 'list'">
          <UButton variant="ghost" color="neutral" label="Close" @click="close" />
          <UButton icon="i-lucide-plus" color="primary" label="New query" :disabled="!clientId" @click="startCreate" />
        </template>
        <template v-else>
          <UButton variant="ghost" color="neutral" label="Cancel" @click="backToList" />
          <UButton color="primary" label="Save" :loading="saving" @click="save" />
        </template>
      </div>
    </template>
  </USlideover>

  <UModal :open="!!pendingDelete" title="Delete query" @update:open="(v: boolean) => { if (!v) pendingDelete = null }">
    <template #body>
      <p class="text-sm">Delete <span class="font-medium">{{ pendingDelete?.name }}</span>? This can't be undone.</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" color="neutral" label="Cancel" @click="pendingDelete = null" />
        <UButton color="error" label="Delete" :loading="deleting" @click="confirmDelete" />
      </div>
    </template>
  </UModal>
</template>
