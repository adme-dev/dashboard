<script setup lang="ts">
import type { PageStudioPage } from '~~/shared/pageStudio/document'
import { pageStudioDescendantIds, pageStudioPageStatus } from '~~/shared/pageStudio/pages'

const props = defineProps<{
  homepageId: string
  page: PageStudioPage
  pages: PageStudioPage[]
  route: string
}>()

const emit = defineEmits<{
  patch: [patch: Partial<PageStudioPage>]
  setHomepage: []
}>()

const rootValue = '__root__'
const statusItems = [
  { label: 'Draft', value: 'draft' },
  { label: 'Visible', value: 'visible' },
  { label: 'Archived', value: 'archived' }
]
const shellItems = [
  { label: 'Inherit site shell', value: 'inherit' },
  { label: 'Custom on this page', value: 'custom' },
  { label: 'Hidden on this page', value: 'hidden' }
]
const descendants = computed(() => pageStudioDescendantIds(props.pages, props.page.id))
const parentItems = computed(() => [
  { label: 'Top level', value: rootValue },
  ...props.pages
    .filter(page => page.id !== props.page.id && !descendants.value.has(page.id))
    .map(page => ({ label: page.title, value: page.id }))
])
const isHomepage = computed(() => props.page.id === props.homepageId)

function patch(patchValue: Partial<PageStudioPage>) {
  emit('patch', patchValue)
}

function setStatus(value: string) {
  const status = value as 'draft' | 'visible' | 'archived'
  patch({ status, visibility: status === 'visible' ? 'visible' : 'hidden' })
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="font-semibold text-highlighted">
            Page settings
          </h2>
          <p class="mt-1 text-sm text-muted">
            Structure, publishing state, search metadata and site-shell behaviour.
          </p>
        </div>
        <UBadge
          v-if="isHomepage"
          label="Homepage"
          color="success"
          variant="subtle"
        />
      </div>
    </template>

    <div class="@container space-y-5">
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Page title">
          <UInput class="w-full" :model-value="page.title" @update:model-value="patch({ title: String($event) })" />
        </UFormField>
        <UFormField label="Status">
          <USelect
            class="w-full"
            :items="statusItems"
            :model-value="pageStudioPageStatus(page)"
            :disabled="isHomepage"
            @update:model-value="setStatus(String($event))"
          />
        </UFormField>
        <UFormField label="Parent page" help="Moving a page also moves its subpages and changes their routes.">
          <USelect
            class="w-full"
            :items="parentItems"
            :model-value="page.parentId || rootValue"
            :disabled="isHomepage"
            @update:model-value="patch({ parentId: $event === rootValue ? null : String($event) })"
          />
        </UFormField>
        <UFormField label="Route segment" help="Lowercase letters, numbers and hyphens only.">
          <UInput
            class="w-full"
            :model-value="page.slug"
            :disabled="isHomepage"
            placeholder="service-name"
            @update:model-value="patch({ slug: String($event).toLowerCase() })"
          />
        </UFormField>
        <UFormField label="Canonical route" class="@lg:col-span-2">
          <UInput class="w-full font-mono" :model-value="route" disabled />
        </UFormField>
        <UFormField label="Header">
          <USelect
            class="w-full"
            :items="shellItems"
            :model-value="page.headerMode || 'inherit'"
            @update:model-value="patch({ headerMode: String($event) as PageStudioPage['headerMode'] })"
          />
        </UFormField>
        <UFormField label="Footer">
          <USelect
            class="w-full"
            :items="shellItems"
            :model-value="page.footerMode || 'inherit'"
            @update:model-value="patch({ footerMode: String($event) as PageStudioPage['footerMode'] })"
          />
        </UFormField>
      </div>

      <div class="border-t border-default pt-5">
        <h3 class="font-medium text-highlighted">
          Search appearance
        </h3>
        <div class="mt-4 grid grid-cols-1 gap-4">
          <UFormField label="SEO title" :help="`${page.seoTitle.length}/160 characters`">
            <UInput class="w-full" :model-value="page.seoTitle" @update:model-value="patch({ seoTitle: String($event) })" />
          </UFormField>
          <UFormField label="Meta description" :help="`${page.seoDescription.length}/320 characters`">
            <UTextarea
              class="w-full"
              :rows="3"
              :model-value="page.seoDescription"
              @update:model-value="patch({ seoDescription: String($event) })"
            />
          </UFormField>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          The homepage owns <span class="font-mono">/</span> and cannot be archived.
        </p>
        <UButton
          label="Set as homepage"
          icon="i-lucide-house"
          color="neutral"
          variant="outline"
          :disabled="isHomepage"
          @click="emit('setHomepage')"
        />
      </div>
    </template>
  </UCard>
</template>
