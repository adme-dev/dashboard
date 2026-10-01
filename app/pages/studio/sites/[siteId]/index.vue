<script setup lang="ts">
import { standaloneWorkspacePages, type StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'

definePageMeta({ layout: 'studio', middleware: 'studio-auth' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId))
const section = ref('overview')
const localPreview = import.meta.dev
const { data, pending, error, refresh } = await useFetch<StandaloneSiteWorkspace>(
  () => `/api/portal/page-studio/sites/${encodeURIComponent(siteId.value)}/workspace`
)
useHead({ title: () => `${data.value?.document.site.name ?? 'Website'} | CMS` })
const pages = computed(() => data.value ? standaloneWorkspacePages(data.value.document) : [])
const forms = computed(() => pages.value.flatMap(page => page.forms.map(form => ({ ...form, page: page.title, route: page.route }))))
const { editorOrigin, launchPageStudio } = usePageStudioLauncher()
const launching = ref(false)
const toast = useToast()
const canLaunch = computed(() => Boolean(data.value?.canEdit && editorOrigin.value))
const sections = [
  { value: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' },
  { value: 'pages', label: 'Pages & SEO', icon: 'i-lucide-files' },
  { value: 'media', label: 'Media library', icon: 'i-lucide-images' },
  { value: 'forms', label: 'Forms & enquiries', icon: 'i-lucide-inbox' }
]
const stats = computed(() => [
  { label: 'Saved pages', value: pages.value.length, section: 'pages', icon: 'i-lucide-files' },
  { label: 'Media assets', value: data.value?.assets.length ?? 0, section: 'media', icon: 'i-lucide-images' },
  { label: 'Forms on pages', value: forms.value.length, section: 'forms', icon: 'i-lucide-inbox' }
])
async function openStudio() {
  if (!canLaunch.value || launching.value) return
  launching.value = true
  try {
    await launchPageStudio(siteId.value, 'portal')
  } catch {
    toast.add({ title: 'Studio could not open', description: 'Check your editing access and allow pop-ups, then try again.', color: 'error' })
  } finally {
    launching.value = false
  }
}
</script>

<template>
  <section class="space-y-5">
    <UButton
      to="/studio/sites"
      label="All websites"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="link"
      class="p-0"
    />
    <UAlert
      v-if="error"
      color="error"
      title="Website unavailable"
      description="Refresh to try again, or return to your websites to check your access."
    >
      <template #actions>
        <UButton
          label="Try again"
          color="neutral"
          variant="outline"
          @click="refresh()"
        />
      </template>
    </UAlert>
    <div
      v-else-if="pending && !data"
      class="space-y-4"
      aria-label="Loading website"
      aria-busy="true"
    >
      <USkeleton class="h-20 w-full" /><USkeleton class="h-72 w-full" />
    </div>
    <template v-else-if="data">
      <header class="flex flex-wrap items-start justify-between gap-4 py-2">
        <div class="max-w-2xl">
          <UBadge
            v-if="localPreview"
            label="Local preview"
            color="neutral"
            variant="subtle"
            class="mb-3"
          />
          <h1 class="break-words text-2xl font-semibold tracking-tight text-highlighted">
            {{ data.document.site.name }}
          </h1>
          <p class="mt-2 text-sm leading-6 text-muted">
            Website content and enquiries
          </p>
        </div>
        <UButton
          label="Open Page Studio"
          icon="i-lucide-panel-top-open"
          color="neutral"
          :disabled="!canLaunch"
          :loading="launching"
          @click="openStudio"
        />
      </header>
      <div class="grid min-w-0 overflow-hidden rounded-xl border border-default md:grid-cols-[192px_minmax(0,1fr)]">
        <nav aria-label="Website management" class="flex flex-wrap content-start gap-1 border-b border-default bg-muted/30 p-3 md:flex-col md:border-b-0 md:border-r">
          <UButton
            v-for="item in sections"
            :key="item.value"
            :label="item.label"
            :icon="item.icon"
            color="neutral"
            :variant="section === item.value ? 'soft' : 'ghost'"
            :aria-current="section === item.value ? 'page' : undefined"
            class="justify-start"
            @click="section = item.value"
          />
          <div class="hidden border-t border-default my-3 md:block" />
          <UButton
            :to="`/studio/sites/${siteId}/content`"
            label="Content collections"
            icon="i-lucide-library"
            color="neutral"
            variant="ghost"
            class="justify-start"
          />
          <UButton
            :to="`/studio/sites/${siteId}/history`"
            label="Draft history"
            icon="i-lucide-history"
            color="neutral"
            variant="ghost"
            class="justify-start"
          />
        </nav>
        <div class="min-w-0 space-y-6 p-4 sm:p-6">
          <template v-if="section === 'overview'">
            <div>
              <h2 class="text-xl font-semibold text-highlighted">
                Website overview
              </h2>
              <p class="mt-2 text-sm leading-6 text-muted">
                A snapshot of the pages and media saved to this website. Saved content may differ from your published website.
              </p>
            </div>
            <div class="grid divide-y divide-default border-y border-default sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div v-for="stat in stats" :key="stat.label" class="px-4 py-5 first:pl-0">
                <p class="text-2xl font-semibold tabular-nums tracking-tight text-highlighted">
                  {{ stat.value }}
                </p>
                <UButton
                  :label="stat.label"
                  color="neutral"
                  variant="link"
                  class="mt-2 p-0 text-xs"
                  @click="section = stat.section"
                />
              </div>
            </div>
            <UCard>
              <h3 class="font-semibold text-highlighted">
                Quick access
              </h3>
              <div class="mt-5 divide-y divide-default">
                <div class="flex flex-wrap items-center justify-between gap-4 pb-5">
                  <div>
                    <p class="font-medium text-highlighted">
                      Review website enquiries
                    </p><p class="mt-1 text-sm text-muted">
                      Find the details submitted through your website forms.
                    </p>
                  </div>
                  <UButton
                    label="View forms"
                    color="neutral"
                    variant="outline"
                    @click="section = 'forms'"
                  />
                </div>
                <div class="flex flex-wrap items-center justify-between gap-4 pt-5">
                  <div>
                    <p class="font-medium text-highlighted">
                      Check pages and search details
                    </p><p class="mt-1 text-sm text-muted">
                      Review page routes, SEO titles, and descriptions.
                    </p>
                  </div>
                  <UButton
                    label="View pages"
                    color="neutral"
                    variant="outline"
                    @click="section = 'pages'"
                  />
                </div>
              </div>
            </UCard>
            <UAlert
              v-if="!editorOrigin"
              color="neutral"
              icon="i-lucide-info"
              title="Page Studio is not connected in this environment"
              description="You can review saved content here. Visual editing becomes available when the editor connection is configured."
            />
            <UAlert
              v-else-if="!data.canEdit"
              color="neutral"
              icon="i-lucide-eye"
              title="You have viewing access"
              description="Ask your website owner for editing access to make changes in Page Studio."
            />
          </template>
          <template v-else-if="section === 'pages'">
            <PageStudioCustomerPageBrowser
              :pages="pages"
              :updated-at="data.document.updatedAt"
              :can-edit="canLaunch"
              :launching="launching"
              @refresh="refresh()"
              @edit="openStudio"
            />
          </template>
          <template v-else-if="section === 'media'">
            <PageStudioCustomerMediaBrowser :site-id="siteId" :assets="data.assets" />
          </template>
          <template v-else-if="section === 'forms'">
            <div>
              <h2 class="text-xl font-semibold text-highlighted">
                Forms & enquiries
              </h2><p class="mt-2 text-sm leading-6 text-muted">
                {{ forms.length }} forms in your saved pages. Enquiries below come from submitted website forms.
              </p>
            </div>
            <UAccordion v-if="forms.length" :items="[{ label: 'Where your forms appear', icon: 'i-lucide-map-pin', slot: 'forms' }]">
              <template #forms>
                <ul class="divide-y divide-default">
                  <li v-for="form in forms" :key="`${form.route}:${form.id}`" class="py-3">
                    <p class="font-medium text-highlighted">
                      {{ form.page }}
                    </p><p class="mt-1 break-all text-sm text-muted">
                      {{ form.route }}
                    </p>
                  </li>
                </ul>
              </template>
            </UAccordion>
            <PageStudioFormSubmissionsWorkspace :key="siteId" :site-id="siteId" audience="portal" />
          </template>
        </div>
      </div>
    </template>
  </section>
</template>
