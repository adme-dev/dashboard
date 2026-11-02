<script setup lang="ts">
import { computed, ref } from 'vue'
import { EDM_STARTER_TEMPLATES, buildStarterTemplateDocument } from '~~/app/utils/edmPresets'
import { figflowTemplateCapability, figflowComposerQuery } from '~~/app/utils/edmFigflowLibrary'
import { markTemplateClientCopy, templateCopyName } from '~~/app/utils/edmTemplateProvenance'
import { filterTemplateLibrary, type TemplateLibraryRow } from '~~/app/utils/edmTemplateLibrary'

type Row = TemplateLibraryRow & { capability: ReturnType<typeof figflowTemplateCapability>, starter?: string }
const saved = ref<TemplateLibraryRow[]>([])
const clients = ref<Array<{ id: string, name: string }>>([])
const canUseShared = ref(false)
const loading = ref(false)
const error = ref('')
const search = ref('')
const client = ref('all')
const view = ref('templates')
const category = ref('all')
let generation = 0
async function refresh() {
  const current = ++generation
  loading.value = true
  error.value = ''
  // Never leave a previous authorized list visible after a failed refresh.
  saved.value = []
  clients.value = []
  canUseShared.value = false
  try {
    const [library, scope] = await Promise.all([
      $fetch<{ items: TemplateLibraryRow[] }>('/api/email/templates'),
      $fetch<{ clients: Array<{ id: string, name: string }>, canUseSharedTemplates: boolean }>('/api/email/template-clients')
    ])
    if (current !== generation) return
    saved.value = library.items
    clients.value = scope.clients
    canUseShared.value = scope.canUseSharedTemplates === true
  } catch {
    if (current === generation) error.value = 'Email templates could not load. Retry to check your current access.'
  } finally {
    if (current === generation) loading.value = false
  }
}
void refresh()
const clientName = (id?: string | null) => id ? clients.value.find(c => c.id === id)?.name || 'Client template' : 'Shared default'
const scopeOptions = computed(() => [
  { label: 'All clients', value: 'all' },
  ...(canUseShared.value ? [{ label: 'Shared defaults', value: 'shared' }] : []),
  ...clients.value.map(c => ({ label: c.name, value: c.id }))
])
const destinations = computed(() => scopeOptions.value.filter(o => o.value !== 'all'))
const categories = computed(() => [
  { label: 'All categories', value: 'all' },
  ...Array.from(new Set(saved.value.map(row => row.folder_name?.trim()).filter((s): s is string => !!s))).sort().map(s => ({ label: s, value: `category:${s}` }))
])
const savedRows = computed<Row[]>(() => saved.value.map(row => ({ ...row, client_name: clientName(row.client_id), capability: figflowTemplateCapability(row.body_source) })))
// Build once: generated block identities do not change during filtering/render.
const starters: Row[] = EDM_STARTER_TEMPLATES.map((starter) => {
  const document = buildStarterTemplateDocument(starter.id)
  return { id: `starter:${starter.id}`, starter: starter.id, name: starter.name, subject: starter.subject, preview_text: starter.previewText, body_source: document, capability: figflowTemplateCapability(document), folder_name: starter.industry || 'General' }
})
const rows = computed(() => {
  if (loading.value || error.value) return []
  if (view.value === 'starters') return starters.filter(row => [row.name, row.folder_name, row.subject].some(s => s?.toLowerCase().includes(search.value.trim().toLowerCase())))
  return filterTemplateLibrary(savedRows.value, { view: view.value, client: client.value, search: search.value })
    .filter(row => view.value !== 'templates' || row.template_kind !== 'draft')
    .filter(row => category.value === 'all' || `category:${row.folder_name?.trim()}` === category.value)
})
const selected = ref<Row | null>(null)
const draftName = ref('')
const destination = ref<string | undefined>()
const creating = ref(false)
const createError = ref('')
const uncertain = ref(false)
function select(row: Row) {
  selected.value = row
  draftName.value = `${templateCopyName(row.name).slice(0, 170)} (design draft)`
  const preferred = client.value !== 'all' ? client.value : row.client_id || (canUseShared.value ? 'shared' : undefined)
  destination.value = destinations.value.some(o => o.value === preferred) ? preferred : undefined
  createError.value = ''
}
function composerLink(row: Row) {
  const query = new URLSearchParams(row.starter ? { starter: row.starter } : { copy: row.id })
  query.set('workspace', 'figflow')
  if (client.value !== 'all' && client.value !== 'shared') query.set('client', client.value)
  return `/agency/email/compose?${query}`
}
async function createDraft() {
  const row = selected.value
  if (!row || creating.value || uncertain.value || !draftName.value.trim() || !destinations.value.some(o => o.value === destination.value)) return
  creating.value = true
  createError.value = ''
  let submitted = false
  let confirmedId: string | null = null
  try {
    // Re-read an existing template under current server scope immediately before
    // copying. A preview/list snapshot is not the source of a library mutation.
    const template = row.starter ? row : (await $fetch<{ template: TemplateLibraryRow }>(`/api/email/templates/${row.id}`)).template
    const capability = figflowTemplateCapability(template.body_source)
    if (!capability.canOpen) throw new Error('This template currently supports composer editing only. Open a copy in the composer instead.')
    submitted = true
    const result = await $fetch<{ template: { id: string } }>('/api/email/templates', {
      method: 'POST', body: {
        name: draftName.value.trim(), template_kind: 'draft',
        client_id: destination.value === 'shared' ? null : destination.value,
        subject: template.subject || null, preview_text: template.preview_text || null,
        folder_name: template.folder_name || null,
        body_source: row.starter ? capability.document : markTemplateClientCopy(capability.document, row.id)
      }
    })
    confirmedId = result.template.id
    await navigateTo({ path: '/agency/email/compose', query: figflowComposerQuery(confirmedId) })
  } catch (failure) {
    const cause = failure as { statusCode?: number, status?: number, message?: string }
    const status = cause.statusCode ?? cause.status
    // A transport/server failure can follow a committed create. Do not offer a
    // blind retry that might make a second draft; the library is the recovery UI.
    uncertain.value = !!confirmedId || (submitted && !(status && status >= 400 && status < 500))
    createError.value = confirmedId
      ? 'Your draft was saved, but could not open. Find it in Drafts before trying again.'
      : uncertain.value
        ? 'The draft save was not confirmed. Check Drafts before creating another copy.'
        : submitted
          ? 'The draft could not be created. Check the selected client and your design access.'
          : cause.message || 'This template could not be read. Refresh the library and try again.'
  } finally { creating.value = false }
}
function checkDrafts() {
  selected.value = null
  view.value = 'drafts'
  search.value = ''
  category.value = 'all'
  client.value = 'all'
  void refresh()
}
</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-4 border-b border-default px-5 py-5 sm:px-8">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">
        Email templates
      </h1><p class="mt-1 max-w-2xl text-sm text-muted">
        Choose a starting point for FigFlow. Save an independent design draft and review changes before applying them.
      </p>
    </div>
    <UButton
      label="Email Marketing"
      to="/agency/email?tab=templates"
      target="_blank"
      icon="i-lucide-external-link"
      color="neutral"
      variant="ghost"
    />
  </header>
  <div class="@container space-y-4 border-b border-default px-5 py-4 sm:px-8">
    <div class="grid grid-cols-1 gap-4 @lg:grid-cols-3">
      <UFormField label="Search templates">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Name, subject or category"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Client">
        <USelect
          v-model="client"
          :items="scopeOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <UFormField v-if="view !== 'starters'" label="Category">
        <USelect
          v-model="category"
          :items="categories"
          value-key="value"
          class="w-full"
        />
      </UFormField>
    </div>
    <UTabs v-model="view" :content="false" :items="[{ label: 'Templates', value: 'templates' }, { label: 'Drafts', value: 'drafts' }, { label: 'Starters', value: 'starters' }]" />
  </div>
  <main class="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
    <p v-if="loading" role="status" class="text-muted">
      Loading your email library…
    </p>
    <UAlert
      v-else-if="error"
      color="error"
      :title="error"
      :actions="[{ label: 'Retry', onClick: refresh }]"
    />
    <template v-else>
      <div class="mb-5 flex items-center justify-between gap-3">
        <p class="text-sm text-muted">
          {{ rows.length }} {{ view === 'drafts' ? 'drafts' : 'templates' }}
        </p><UButton
          label="Refresh"
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          @click="refresh"
        />
      </div>
      <UAlert
        v-if="uncertain"
        class="mb-5"
        color="warning"
        title="Check for the saved draft before creating another copy"
        description="A previous save was not confirmed. Draft creation is blocked for this browser visit to avoid duplicates. Reopen a saved draft, or check the library before starting a new visit."
      />
      <UCard v-if="!rows.length" class="text-center">
        <h2 class="font-semibold">
          No matching {{ view === 'drafts' ? 'drafts' : 'templates' }}
        </h2><p class="mt-2 text-sm text-muted">
          Try another client or search, or choose a starter template.
        </p><UButton label="Browse starters" class="mt-4" @click="view = 'starters'; search = ''" />
      </UCard>
      <div v-else class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <article v-for="row in rows" :key="row.id" class="flex flex-col overflow-hidden rounded-lg border border-default bg-default">
          <div class="pointer-events-none h-72 overflow-hidden bg-elevated/40" aria-hidden="true">
            <img
              v-if="row.starter"
              :src="`/email/template-previews/${row.starter}.jpeg?v=20261029-oem3`"
              alt=""
              loading="lazy"
              class="w-full"
            >
            <EmailBuilderEdmDocumentThumbnail
              v-else-if="row.capability.document"
              :document="row.capability.document"
              :width="320"
              :max-height="288"
            />
            <div v-else class="flex h-full items-center justify-center text-sm text-muted">
              Preview unavailable
            </div>
          </div>
          <div class="flex flex-1 flex-col gap-3 border-t border-default p-4">
            <div class="flex flex-wrap gap-1.5">
              <UBadge :label="row.starter ? 'Starter' : clientName(row.client_id)" color="neutral" variant="subtle" /><UBadge :label="row.capability.label" :color="row.capability.canOpen ? 'primary' : 'warning'" variant="subtle" />
            </div>
            <h2 class="font-semibold">
              {{ row.name }}
            </h2>
            <p class="line-clamp-2 text-sm text-muted">
              {{ row.subject || 'No subject' }}
            </p>
            <p class="text-xs text-muted">
              {{ row.capability.canOpen ? 'Edit supported text, images and buttons. Layout and other sections stay locked.' : 'HTML and locked sections are preserved. Editable FigFlow conversion is not available yet.' }}
            </p>
            <div class="mt-auto flex flex-wrap gap-2 pt-2">
              <UButton
                v-if="row.capability.canOpen"
                :label="row.template_kind === 'draft' ? 'Open saved draft' : 'Use in FigFlow'"
                icon="i-lucide-pen-tool"
                :disabled="creating || (uncertain && row.template_kind !== 'draft')"
                :to="row.template_kind === 'draft' ? { path: '/agency/email/compose', query: figflowComposerQuery(row.id) } : undefined"
                @click="row.template_kind !== 'draft' && select(row)"
              />
              <UButton
                :to="composerLink(row)"
                label="Open composer copy"
                color="neutral"
                variant="outline"
              />
            </div>
          </div>
        </article>
      </div>
    </template>
  </main>
  <UModal
    :open="!!selected"
    title="Create design draft"
    :dismissible="!creating"
    :close="!creating"
    @update:open="value => { if (!value && !creating) selected = null }"
  >
    <template #content>
      <div class="@container space-y-5 p-6">
        <div>
          <h2 class="text-lg font-semibold">
            Create design draft
          </h2><p class="mt-1 text-sm text-muted">
            Start from {{ selected?.name }}. The library original stays unchanged.
          </p>
        </div>
        <UFormField label="Draft name" required>
          <UInput
            v-model="draftName"
            :maxlength="200"
            :disabled="creating || uncertain"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Client" required>
          <USelect
            v-model="destination"
            :items="destinations"
            value-key="value"
            placeholder="Choose a client"
            :disabled="creating || uncertain"
            class="w-full"
          />
        </UFormField>
        <UAlert v-if="createError" :title="createError" color="error" />
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="creating"
            @click="selected = null"
          /><UButton v-if="uncertain" label="Check Drafts" @click="checkDrafts" /><UButton
            v-else
            label="Create draft and open FigFlow"
            :loading="creating"
            :disabled="!draftName.trim() || !destination || creating"
            @click="createDraft"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
