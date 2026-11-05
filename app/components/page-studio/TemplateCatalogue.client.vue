<script setup lang="ts">
import type { PageStudioTemplateCard, PageStudioTemplateList } from '~~/shared/pageStudio/templateCatalogue'

const props = defineProps<{ endpoint: '/api/portal/page-studio/templates' | '/api/portal/page-studio/customer/templates' }>()
const actions = ref<{ showPreview: (item: PageStudioTemplateCard) => void, showUse: (item: PageStudioTemplateCard) => void } | null>(null)
const cursor = ref<string | undefined>()
const { data, pending, error, refresh } = await useFetch<PageStudioTemplateList>(() => props.endpoint, {
  query: computed(() => ({ ...(cursor.value ? { cursor: cursor.value } : {}), limit: 20 })),
  default: () => ({ items: [], nextCursor: null })
})
</script>

<template>
  <section class="space-y-6" aria-label="Templates">
    <div>
      <h1 class="text-3xl font-semibold tracking-tight text-highlighted">
        Templates
      </h1>
      <p class="mt-3 text-muted">
        Website designs available to your account. Preview a saved version or create your own independent copy when available.
      </p>
    </div>
    <template v-if="error">
      <UAlert color="error" title="Templates could not be loaded" description="Refresh to check your account’s template access." />
      <UButton
        label="Try again"
        color="neutral"
        variant="outline"
        @click="refresh()"
      />
    </template>
    <div
      v-else-if="pending"
      aria-label="Loading templates"
      aria-busy="true"
      class="space-y-4"
    >
      <USkeleton v-for="n in 3" :key="n" class="h-32 w-full rounded-lg" />
    </div>
    <template v-else>
      <UCard v-if="!data?.items.length">
        <p class="py-6 text-muted">
          No templates are available to this account yet.
        </p>
      </UCard>
      <ul v-else class="divide-y divide-default border-y border-default">
        <li v-for="item in data.items" :key="item.versionId" class="space-y-4 py-6">
          <div>
            <h2 class="text-xl font-medium text-highlighted">
              {{ item.name }}
            </h2>
            <p class="mt-2 text-sm text-muted">
              Automotive · {{ item.canPreview ? 'Preview available' : 'Preparing' }}
            </p>
          </div>
          <p v-if="item.unavailableReason" class="text-sm text-muted">
            {{ item.unavailableReason }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton
              label="Preview"
              :disabled="!item.canPreview"
              color="neutral"
              variant="outline"
              @click="actions?.showPreview(item)"
            />
            <UButton label="Use template" :disabled="!item.canUse" @click="actions?.showUse(item)" />
          </div>
        </li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="cursor"
          label="First page"
          color="neutral"
          variant="outline"
          @click="cursor = undefined"
        />
        <UButton
          v-if="data?.nextCursor"
          label="Next page"
          color="neutral"
          variant="outline"
          @click="cursor = data.nextCursor"
        />
        <UButton
          label="Refresh templates"
          color="neutral"
          variant="ghost"
          @click="refresh()"
        />
      </div>
    </template>
    <PageStudioTemplateActions ref="actions" :endpoint="endpoint" @changed="refresh()" />
  </section>
</template>
