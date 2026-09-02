<script setup lang="ts">
import { PageStudioDocumentSchema, type PageStudioDocument, type PageStudioPage, type PageStudioRedirect } from '~~/shared/pageStudio/document'
import {
  flattenPageStudioPages,
  pageStudioHomepageId,
  pageStudioPageRoute,
  pageStudioPageStatus,
  setPageStudioHomepage,
  uniquePageStudioSlug
} from '~~/shared/pageStudio/pages'

interface DocumentState {
  document: PageStudioDocument
  pageLimit: number
  revision: number
  updatedAt: string | null
}

const props = defineProps<{ siteId: string }>()
const toast = useToast()
const selectedId = ref('')
const draft = ref<PageStudioDocument | null>(null)
const saving = ref(false)

const endpoint = computed(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/document`)
const { data, status, error, refresh } = await useFetch<DocumentState>(endpoint)

function resetDraft(state: DocumentState | null | undefined) {
  if (!state) return
  draft.value = structuredClone(state.document)
  const homepageId = pageStudioHomepageId(state.document)
  if (!selectedId.value || !state.document.pages.some(page => page.id === selectedId.value)) selectedId.value = homepageId
}

watch(data, resetDraft, { immediate: true })

const flatPages = computed(() => draft.value ? flattenPageStudioPages(draft.value) : [])
const selectedPage = computed(() => draft.value?.pages.find(page => page.id === selectedId.value) || null)
const homepageId = computed(() => draft.value ? pageStudioHomepageId(draft.value) : '')
const selectedRoute = computed(() => draft.value && selectedPage.value
  ? pageStudioPageRoute(draft.value.pages, selectedPage.value.id)
  : '/')
const validation = computed(() => draft.value ? PageStudioDocumentSchema.safeParse(draft.value) : null)
const valid = computed(() => Boolean(validation.value?.success))
const dirty = computed(() => Boolean(draft.value && data.value && JSON.stringify(draft.value) !== JSON.stringify(data.value.document)))
const atLimit = computed(() => (draft.value?.pages.length || 0) >= (data.value?.pageLimit || 0))

function depthClass(depth: number) {
  return ['pl-3', 'pl-7', 'pl-11', 'pl-15', 'pl-19'][Math.min(depth, 4)]
}

function selectPage(id: string) {
  selectedId.value = id
}

function addPage(parentId: string | null = null) {
  if (!draft.value || atLimit.value) {
    toast.add({ title: 'Page limit reached', description: `This site allows ${data.value?.pageLimit || 0} pages.`, color: 'warning' })
    return
  }
  const id = crypto.randomUUID()
  const page: PageStudioPage = {
    id,
    parentId,
    title: 'Untitled page',
    slug: uniquePageStudioSlug(draft.value.pages, parentId, 'untitled-page'),
    visibility: 'hidden',
    status: 'draft',
    headerMode: 'inherit',
    footerMode: 'inherit',
    seoTitle: '',
    seoDescription: '',
    blocks: []
  }
  draft.value = { ...draft.value, pages: [...draft.value.pages, page] }
  selectedId.value = id
}

function duplicateSelected() {
  if (!draft.value || !selectedPage.value || atLimit.value) {
    if (atLimit.value) toast.add({ title: 'Page limit reached', description: `This site allows ${data.value?.pageLimit || 0} pages.`, color: 'warning' })
    return
  }
  const source = selectedPage.value
  const id = crypto.randomUUID()
  const page: PageStudioPage = {
    ...structuredClone(source),
    id,
    title: `${source.title} copy`,
    slug: uniquePageStudioSlug(draft.value.pages, source.parentId, `${source.slug || source.title}-copy`),
    visibility: 'hidden',
    status: 'draft',
    blocks: source.blocks.map(block => ({ ...structuredClone(block), id: crypto.randomUUID() }))
  }
  draft.value = { ...draft.value, pages: [...draft.value.pages, page] }
  selectedId.value = id
}

function patchSelected(patch: Partial<PageStudioPage>) {
  if (!draft.value || !selectedPage.value) return
  draft.value = {
    ...draft.value,
    pages: draft.value.pages.map(page => page.id === selectedPage.value?.id ? { ...page, ...patch } : page)
  }
}

function makeHomepage() {
  if (!draft.value || !selectedPage.value) return
  draft.value = setPageStudioHomepage(draft.value, selectedPage.value.id)
}

function updateRedirects(redirects: PageStudioRedirect[]) {
  if (draft.value) draft.value = { ...draft.value, redirects }
}

async function saveDraft() {
  if (!draft.value || !data.value || !valid.value || saving.value) return
  saving.value = true
  try {
    const saved = await $fetch<DocumentState>(endpoint.value, {
      method: 'PUT',
      body: { expectedRevision: data.value.revision, document: draft.value }
    })
    data.value = saved
    resetDraft(saved)
    toast.add({ title: 'Pages saved', description: `Draft revision ${saved.revision} is ready for Studio.`, color: 'success' })
  } catch (saveError: unknown) {
    const failure = saveError as { data?: { statusMessage?: string, message?: string } }
    toast.add({
      title: 'Pages were not saved',
      description: failure.data?.statusMessage || failure.data?.message || 'Refresh the draft and try again.',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

async function reloadDraft() {
  await refresh()
  resetDraft(data.value)
}
</script>

<template>
  <div class="space-y-4 pt-5">
    <UAlert
      v-if="error"
      title="Pages could not be loaded"
      description="Refresh the draft. If this continues, inspect Page Studio access and audit logs."
      color="error"
      icon="i-lucide-circle-alert"
    />
    <div
      v-else-if="status === 'pending'"
      class="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]"
      aria-busy="true"
      aria-label="Loading pages"
    >
      <USkeleton class="h-96 w-full" />
      <USkeleton class="h-96 w-full" />
    </div>
    <template v-else-if="draft">
      <div class="flex flex-col gap-3 border-b border-default pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="font-semibold text-highlighted">
            Website pages
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ draft.pages.length }} of {{ data?.pageLimit }} pages, draft revision {{ data?.revision }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Reload"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :disabled="saving"
            @click="reloadDraft"
          />
          <UButton
            :to="`/agency/page-studio/${siteId}/edit`"
            label="Open in Studio"
            icon="i-lucide-panel-top-open"
            color="neutral"
            variant="outline"
          />
          <UButton
            label="Save pages"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!dirty || !valid"
            @click="saveDraft"
          />
        </div>
      </div>

      <UAlert
        v-if="dirty && !valid"
        title="Resolve page settings before saving"
        :description="validation && !validation.success ? validation.error.issues[0]?.message : 'The page document is invalid.'"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
      />

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <UCard class="self-start">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">
                  Page tree
                </h2>
                <p class="mt-1 text-xs text-muted">
                  Select a page to manage it.
                </p>
              </div>
              <UButton
                icon="i-lucide-plus"
                aria-label="Add page"
                color="neutral"
                variant="ghost"
                :disabled="atLimit"
                @click="addPage(null)"
              />
            </div>
          </template>

          <nav aria-label="Website page hierarchy" class="-mx-2 space-y-1">
            <UButton
              v-for="item in flatPages"
              :key="item.page.id"
              :label="item.page.title"
              :icon="item.page.id === homepageId ? 'i-lucide-house' : item.depth ? 'i-lucide-corner-down-right' : 'i-lucide-file'"
              color="neutral"
              :variant="item.page.id === selectedId ? 'soft' : 'ghost'"
              block
              :class="['justify-start', depthClass(item.depth)]"
              @click="selectPage(item.page.id)"
            >
              <template #trailing>
                <span class="ml-auto size-2 rounded-full" :class="pageStudioPageStatus(item.page) === 'visible' ? 'bg-emerald-500' : pageStudioPageStatus(item.page) === 'archived' ? 'bg-neutral-400' : 'bg-amber-500'" />
              </template>
            </UButton>
          </nav>

          <template #footer>
            <div class="grid grid-cols-1 gap-2">
              <UButton
                label="Add top-level page"
                icon="i-lucide-file-plus-2"
                color="neutral"
                variant="outline"
                block
                :disabled="atLimit"
                @click="addPage(null)"
              />
              <UButton
                label="Add subpage"
                icon="i-lucide-list-tree"
                color="neutral"
                variant="outline"
                block
                :disabled="!selectedPage || atLimit"
                @click="addPage(selectedPage?.id || null)"
              />
              <UButton
                label="Duplicate selected"
                icon="i-lucide-copy"
                color="neutral"
                variant="outline"
                block
                :disabled="!selectedPage || atLimit"
                @click="duplicateSelected"
              />
            </div>
          </template>
        </UCard>

        <PageStudioPageSettingsPanel
          v-if="selectedPage"
          :page="selectedPage"
          :pages="draft.pages"
          :route="selectedRoute"
          :homepage-id="homepageId"
          @patch="patchSelected"
          @set-homepage="makeHomepage"
        />
      </div>

      <PageStudioRedirectManager :redirects="draft.redirects || []" @update="updateRedirects" />
    </template>
  </div>
</template>
