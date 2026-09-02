<script setup lang="ts">
import type { PageStudioDocumentResponse } from '~/types'
import type { PageStudioBlock, PageStudioDocument, PageStudioPage } from '~~/shared/pageStudio/document'

const props = defineProps<{ siteId: string }>()
const toast = useToast()
const ROOT_PAGE = '__root__'

const { data, pending, error, refresh } = useFetch<PageStudioDocumentResponse>(
  `/api/agency/page-studio/sites/${props.siteId}/document`
)
const draft = ref<PageStudioDocument | null>(null)
const revision = ref(0)
const savedSnapshot = ref('')
const selectedPageId = ref<string | null>(null)
const selectedBlockId = ref<string | null>(null)
const device = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const preview = ref(false)
const saving = ref(false)
const addPageOpen = ref(false)
const deletePageOpen = ref(false)
const pageTitleDraft = ref('')
const pageSlugDraft = ref('')
const pageParentDraft = ref(ROOT_PAGE)

watch(data, (next) => {
  if (!next) return
  draft.value = structuredClone(next.document)
  revision.value = next.revision
  savedSnapshot.value = JSON.stringify(next.document)
  selectedPageId.value = next.document.pages[0]?.id ?? null
  selectedBlockId.value = next.document.pages[0]?.blocks[0]?.id ?? null
}, { immediate: true })

const pages = computed(() => draft.value?.pages ?? [])
const selectedPage = computed(() => pages.value.find(page => page.id === selectedPageId.value) ?? null)
const selectedBlock = computed(() => selectedPage.value?.blocks.find(block => block.id === selectedBlockId.value) ?? null)
const dirty = computed(() => Boolean(draft.value) && JSON.stringify(draft.value) !== savedSnapshot.value)
const errorMessage = computed(() => error.value?.statusMessage || error.value?.message || 'Page Studio builder could not be loaded')

const pagePathById = computed(() => {
  const result = new Map<string, string>()
  const byId = new Map(pages.value.map(page => [page.id, page]))
  function resolve(page: PageStudioPage, visited = new Set<string>()): string {
    if (result.has(page.id)) return result.get(page.id)!
    if (!page.parentId || page.slug === '') return page.slug ? `/${page.slug}` : '/'
    if (visited.has(page.id)) return `/${page.slug}`
    visited.add(page.id)
    const parent = byId.get(page.parentId)
    const parentPath = parent ? resolve(parent, visited) : ''
    const path = `${parentPath === '/' ? '' : parentPath}/${page.slug}`
    result.set(page.id, path)
    return path
  }
  for (const page of pages.value) result.set(page.id, resolve(page))
  return result
})

const orderedPages = computed(() => {
  const output: Array<{ page: PageStudioPage, depth: number }> = []
  function append(parentId: string | null, depth: number) {
    pages.value.filter(page => page.parentId === parentId).forEach((page) => {
      output.push({ page, depth })
      append(page.id, depth + 1)
    })
  }
  append(null, 0)
  return output
})

const parentOptions = computed(() => [
  { label: 'Top level', value: ROOT_PAGE },
  ...orderedPages.value.map(({ page, depth }) => ({ label: `${'  '.repeat(depth)}${page.title}`, value: page.id }))
])
const alignmentOptions = [{ label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' }]
const backgroundOptions = [
  { label: 'Canvas', value: 'canvas' },
  { label: 'Muted', value: 'muted' },
  { label: 'Brand', value: 'brand' },
  { label: 'Dark', value: 'dark' }
]
const visibilityOptions = [{ label: 'Visible', value: 'visible' }, { label: 'Hidden', value: 'hidden' }]
const addSectionItems = [
  { label: 'Hero', icon: 'i-lucide-panel-top', onSelect: () => addBlock('hero') },
  { label: 'Text', icon: 'i-lucide-align-left', onSelect: () => addBlock('text') },
  { label: 'Image', icon: 'i-lucide-image', onSelect: () => addBlock('image') },
  { label: 'Call to action', icon: 'i-lucide-mouse-pointer-click', onSelect: () => addBlock('cta') }
]

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

function selectPage(page: PageStudioPage) {
  selectedPageId.value = page.id
  selectedBlockId.value = page.blocks[0]?.id ?? null
}

function openAddPage() {
  pageTitleDraft.value = ''
  pageSlugDraft.value = ''
  pageParentDraft.value = selectedPage.value?.id ?? ROOT_PAGE
  addPageOpen.value = true
}

function addPage() {
  if (!draft.value || !pageTitleDraft.value.trim()) return
  if (pages.value.length >= (data.value?.pageLimit ?? 0)) {
    toast.add({ title: 'Page limit reached', description: `This subscription allows ${data.value?.pageLimit ?? 0} pages.`, color: 'warning' })
    return
  }
  const slug = slugify(pageSlugDraft.value || pageTitleDraft.value)
  if (!slug) {
    toast.add({ title: 'Add a page slug', color: 'warning' })
    return
  }
  const parentId = pageParentDraft.value === ROOT_PAGE ? null : pageParentDraft.value
  if (pages.value.some(page => page.parentId === parentId && page.slug === slug)) {
    toast.add({ title: 'That page path already exists', color: 'warning' })
    return
  }
  const page: PageStudioPage = {
    id: crypto.randomUUID(),
    parentId,
    title: pageTitleDraft.value.trim(),
    slug,
    visibility: 'visible',
    seoTitle: pageTitleDraft.value.trim(),
    seoDescription: '',
    blocks: [newBlock('hero')]
  }
  draft.value.pages.push(page)
  selectPage(page)
  addPageOpen.value = false
}

function deletePage() {
  if (!draft.value || !selectedPage.value || selectedPage.value.slug === '') return
  const removed = selectedPage.value
  for (const page of draft.value.pages) {
    if (page.parentId === removed.id) page.parentId = removed.parentId
  }
  draft.value.pages = draft.value.pages.filter(page => page.id !== removed.id)
  selectPage(draft.value.pages[0]!)
  deletePageOpen.value = false
}

function newBlock(type: PageStudioBlock['type']): PageStudioBlock {
  const copy = {
    hero: { eyebrow: 'Introducing', heading: 'A clear page headline', body: 'Explain the value in one concise paragraph.', buttonLabel: 'Get started', background: 'dark' as const },
    text: { eyebrow: 'Our approach', heading: 'Tell the story', body: 'Add useful detail that helps visitors understand what comes next.', buttonLabel: '', background: 'canvas' as const },
    image: { eyebrow: '', heading: 'Image caption', body: 'Add context for this image.', buttonLabel: '', background: 'canvas' as const },
    cta: { eyebrow: '', heading: 'Ready to get started?', body: 'Give visitors one clear next step.', buttonLabel: 'Contact us', background: 'brand' as const }
  }[type]
  return {
    id: crypto.randomUUID(), type, ...copy, buttonHref: copy.buttonLabel ? '#contact' : '',
    imageUrl: '', imageAlt: '', alignment: type === 'cta' ? 'center' : 'left'
  }
}

function addBlock(type: PageStudioBlock['type']) {
  if (!selectedPage.value) return
  const block = newBlock(type)
  selectedPage.value.blocks.push(block)
  selectedBlockId.value = block.id
}

function duplicateBlock() {
  if (!selectedPage.value || !selectedBlock.value) return
  const index = selectedPage.value.blocks.findIndex(block => block.id === selectedBlock.value!.id)
  const copy = { ...structuredClone(selectedBlock.value), id: crypto.randomUUID() }
  selectedPage.value.blocks.splice(index + 1, 0, copy)
  selectedBlockId.value = copy.id
}

function removeBlock() {
  if (!selectedPage.value || !selectedBlock.value) return
  const index = selectedPage.value.blocks.findIndex(block => block.id === selectedBlock.value!.id)
  selectedPage.value.blocks.splice(index, 1)
  selectedBlockId.value = selectedPage.value.blocks[Math.min(index, selectedPage.value.blocks.length - 1)]?.id ?? null
}

function moveBlock(direction: -1 | 1) {
  if (!selectedPage.value || !selectedBlock.value) return
  const blocks = selectedPage.value.blocks
  const from = blocks.findIndex(block => block.id === selectedBlock.value!.id)
  const to = from + direction
  if (to < 0 || to >= blocks.length) return
  const [block] = blocks.splice(from, 1)
  blocks.splice(to, 0, block!)
}

async function save() {
  if (!draft.value || !dirty.value || saving.value) return
  saving.value = true
  try {
    const response = await $fetch<PageStudioDocumentResponse>(`/api/agency/page-studio/sites/${props.siteId}/document`, {
      method: 'PUT',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: { expectedRevision: revision.value, document: draft.value }
    })
    draft.value = structuredClone(response.document)
    revision.value = response.revision
    savedSnapshot.value = JSON.stringify(response.document)
    toast.add({ title: 'Draft saved', description: `Revision ${response.revision}`, color: 'success' })
  } catch (saveError: any) {
    toast.add({ title: 'Draft was not saved', description: saveError?.data?.message || saveError?.statusMessage || 'Try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-default">
    <header class="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-default px-3 py-2 sm:px-4">
      <div class="flex min-w-0 items-center gap-3">
        <UButton to="/agency/page-studio" icon="i-lucide-arrow-left" color="neutral" variant="ghost" aria-label="Back to Page Studio" />
        <div class="min-w-0">
          <div class="flex items-center gap-2"><h1 class="truncate text-sm font-semibold text-highlighted sm:text-base">{{ data?.site.name || 'Page Studio Builder' }}</h1><UBadge color="warning" variant="subtle">Draft</UBadge></div>
          <p class="truncate font-mono text-[11px] text-muted">{{ selectedPage ? pagePathById.get(selectedPage.id) : '/' }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="hidden items-center rounded-md border border-default bg-elevated p-0.5 sm:flex">
          <UButton v-for="option in [{ id: 'desktop', icon: 'i-lucide-monitor' }, { id: 'tablet', icon: 'i-lucide-tablet' }, { id: 'mobile', icon: 'i-lucide-smartphone' }]" :key="option.id" :icon="option.icon" size="xs" color="neutral" :variant="device === option.id ? 'solid' : 'ghost'" :aria-label="`${option.id} preview`" @click="device = option.id as typeof device" />
        </div>
        <UButton :label="preview ? 'Edit' : 'Preview'" :icon="preview ? 'i-lucide-pencil' : 'i-lucide-eye'" color="neutral" variant="outline" @click="preview = !preview" />
        <UButton label="Save draft" icon="i-lucide-cloud-upload" :loading="saving" :disabled="!dirty" @click="save" />
      </div>
    </header>

    <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" title="Builder unavailable" :description="errorMessage" class="m-4"><template #actions><UButton label="Try again" color="error" variant="soft" @click="refresh" /></template></UAlert>
    <div v-else-if="pending || !draft || !selectedPage" class="grid flex-1 place-items-center"><div class="space-y-3 text-center"><UIcon name="i-lucide-loader-circle" class="mx-auto size-6 animate-spin text-muted" /><p class="text-sm text-muted">Opening builder...</p></div></div>

    <div v-else class="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[15rem_minmax(0,1fr)_20rem] lg:overflow-hidden">
      <aside v-if="!preview" class="border-b border-default bg-elevated/30 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div class="flex items-center justify-between px-3 py-3"><div><h2 class="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Pages</h2><p class="mt-1 text-[11px] text-muted">{{ pages.length }} of {{ data.pageLimit }}</p></div><UButton icon="i-lucide-plus" size="xs" label="Add" @click="openAddPage" /></div>
        <nav class="space-y-1 px-2 pb-3" aria-label="Website pages">
          <UButton v-for="entry in orderedPages" :key="entry.page.id" color="neutral" :variant="selectedPageId === entry.page.id ? 'soft' : 'ghost'" class="w-full justify-start" :style="{ paddingLeft: `${0.5 + entry.depth * 0.85}rem` }" @click="selectPage(entry.page)">
            <UIcon :name="entry.page.slug === '' ? 'i-lucide-house' : 'i-lucide-file'" class="size-4 shrink-0" /><span class="min-w-0 flex-1 truncate text-left">{{ entry.page.title }}</span><UIcon v-if="entry.page.visibility === 'hidden'" name="i-lucide-eye-off" class="size-3.5 shrink-0 text-muted" />
          </UButton>
        </nav>
      </aside>

      <main class="flex min-h-[38rem] min-w-0 flex-col lg:min-h-0">
        <div v-if="!preview" class="flex min-h-12 items-center justify-between gap-3 border-b border-default px-3">
          <div class="min-w-0"><p class="truncate text-sm font-medium text-highlighted">{{ selectedPage.title }}</p><p class="truncate font-mono text-[11px] text-muted">{{ pagePathById.get(selectedPage.id) }}</p></div>
          <UDropdownMenu :items="addSectionItems"><UButton label="Add section" icon="i-lucide-plus" size="sm" color="neutral" variant="outline" /></UDropdownMenu>
        </div>
        <PageStudioBuilderCanvas class="min-h-0 flex-1" :device="device" :page="selectedPage" :preview="preview" :selected-block-id="selectedBlockId" @select="selectedBlockId = $event" />
      </main>

      <aside v-if="!preview" class="border-t border-default bg-default lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div class="border-b border-default px-4 py-3"><h2 class="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Inspector</h2></div>
        <div class="space-y-5 p-4 @container">
          <section class="space-y-4">
            <div class="flex items-center justify-between"><h3 class="text-sm font-semibold text-highlighted">Page</h3><UButton v-if="selectedPage.slug !== ''" icon="i-lucide-trash-2" color="error" variant="ghost" size="xs" aria-label="Delete page" @click="deletePageOpen = true" /></div>
            <UFormField label="Page title"><UInput v-model="selectedPage.title" class="w-full" /></UFormField>
            <UFormField v-if="selectedPage.slug !== ''" label="Slug" :help="pagePathById.get(selectedPage.id)"><UInput v-model="selectedPage.slug" class="w-full" /></UFormField>
            <UFormField label="Visibility"><USelect v-model="selectedPage.visibility" :items="visibilityOptions" value-key="value" class="w-full" /></UFormField>
            <UFormField label="SEO title"><UInput v-model="selectedPage.seoTitle" class="w-full" /></UFormField>
            <UFormField label="SEO description"><UTextarea v-model="selectedPage.seoDescription" :rows="3" class="w-full" /></UFormField>
          </section>

          <section v-if="selectedBlock" class="space-y-4 border-t border-default pt-5">
            <div class="flex items-center justify-between gap-2"><div><h3 class="text-sm font-semibold capitalize text-highlighted">{{ selectedBlock.type }} section</h3><p class="text-[11px] text-muted">Content and presentation</p></div><div class="flex"><UButton icon="i-lucide-arrow-up" size="xs" color="neutral" variant="ghost" aria-label="Move section up" @click="moveBlock(-1)" /><UButton icon="i-lucide-arrow-down" size="xs" color="neutral" variant="ghost" aria-label="Move section down" @click="moveBlock(1)" /><UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" aria-label="Duplicate section" @click="duplicateBlock" /><UButton icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" aria-label="Delete section" @click="removeBlock" /></div></div>
            <UFormField v-if="selectedBlock.type !== 'image' && selectedBlock.type !== 'cta'" label="Eyebrow"><UInput v-model="selectedBlock.eyebrow" class="w-full" /></UFormField>
            <UFormField label="Heading"><UInput v-model="selectedBlock.heading" class="w-full" /></UFormField>
            <UFormField label="Body"><UTextarea v-model="selectedBlock.body" :rows="5" class="w-full" /></UFormField>
            <template v-if="selectedBlock.type === 'image'">
              <UFormField label="Image URL"><UInput v-model="selectedBlock.imageUrl" class="w-full" placeholder="https://..." /></UFormField>
              <UFormField label="Alternative text"><UInput v-model="selectedBlock.imageAlt" class="w-full" /></UFormField>
            </template>
            <template v-if="selectedBlock.type === 'hero' || selectedBlock.type === 'cta'">
              <UFormField label="Button label"><UInput v-model="selectedBlock.buttonLabel" class="w-full" /></UFormField>
              <UFormField label="Button link"><UInput v-model="selectedBlock.buttonHref" class="w-full" placeholder="/contact" /></UFormField>
            </template>
            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField label="Alignment"><USelect v-model="selectedBlock.alignment" :items="alignmentOptions" value-key="value" class="w-full" /></UFormField>
              <UFormField label="Background"><USelect v-model="selectedBlock.background" :items="backgroundOptions" value-key="value" class="w-full" /></UFormField>
            </div>
          </section>
        </div>
      </aside>
    </div>

    <UModal v-model:open="addPageOpen">
      <template #content><div class="space-y-5 p-6"><div><h2 class="text-lg font-semibold text-highlighted">Add page</h2><p class="mt-1 text-sm text-muted">Create a top-level page or nest it beneath another page.</p></div><div class="grid grid-cols-1 gap-4 @container"><UFormField label="Page title"><UInput v-model="pageTitleDraft" autofocus class="w-full" @blur="pageSlugDraft ||= slugify(pageTitleDraft)" /></UFormField><UFormField label="Slug"><UInput v-model="pageSlugDraft" class="w-full" placeholder="about-us" /></UFormField><UFormField label="Parent page"><USelect v-model="pageParentDraft" :items="parentOptions" value-key="value" class="w-full" /></UFormField></div><div class="flex justify-end gap-2"><UButton label="Cancel" color="neutral" variant="ghost" @click="addPageOpen = false" /><UButton label="Add page" icon="i-lucide-plus" :disabled="!pageTitleDraft.trim()" @click="addPage" /></div></div></template>
    </UModal>

    <UModal v-model:open="deletePageOpen">
      <template #content><div class="space-y-5 p-6"><div><h2 class="text-lg font-semibold text-highlighted">Delete {{ selectedPage?.title }}?</h2><p class="mt-2 text-sm leading-6 text-muted">The page will be removed from this draft. Any child pages will move up one level. Save the draft to make this change durable.</p></div><div class="flex justify-end gap-2"><UButton label="Cancel" color="neutral" variant="ghost" @click="deletePageOpen = false" /><UButton label="Delete page" icon="i-lucide-trash-2" color="error" @click="deletePage" /></div></div></template>
    </UModal>
  </div>
</template>
