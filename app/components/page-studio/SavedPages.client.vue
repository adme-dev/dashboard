<script setup lang="ts">
import type { PageStudioSavedPages } from '~~/shared/pageStudio/savedPages'

defineProps<{
  saved: PageStudioSavedPages
  pageLimit: number
  updatedAt: string | null
  launching: boolean
  canLaunch: boolean
}>()
defineEmits<{ reload: [], edit: [] }>()

const labels = { public: 'Visible page', hidden: 'Hidden page', draft: 'Draft page', archived: 'Archived page' }
function savedTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
</script>

<template>
  <section class="min-w-0 space-y-4" aria-label="Saved website pages">
    <div class="flex flex-col gap-3 border-b border-default pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="font-semibold text-highlighted">
          Website pages
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ saved.pages.length }} of {{ pageLimit }} pages
        </p>
        <p v-if="updatedAt" class="mt-1 text-xs text-muted">
          Saved {{ savedTime(updatedAt) }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Reload"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          @click="$emit('reload')"
        />
        <UButton
          label="Edit website in Studio"
          icon="i-lucide-panel-top-open"
          :loading="launching"
          :disabled="!canLaunch"
          @click="$emit('edit')"
        />
      </div>
    </div>
    <p class="max-w-3xl text-sm leading-6 text-muted">
      These are your saved website pages. Open Studio to add pages, edit content and create forms. Saving changes keeps them in your draft until you publish an approved release.
    </p>
    <ul class="divide-y divide-default rounded-lg border border-default" aria-label="Saved page list">
      <li v-for="page in saved.pages" :key="page.id" class="min-w-0 space-y-3 p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="break-words font-medium text-highlighted">
              {{ page.title }}
            </h3>
            <p class="mt-1 break-all text-sm text-muted">
              {{ page.route }}
            </p>
          </div>
          <UBadge color="neutral" variant="subtle">
            {{ labels[page.visibility] }}
          </UBadge>
        </div>
        <dl class="grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div class="min-w-0">
            <dt class="text-xs text-muted">
              SEO title
            </dt>
            <dd class="mt-1 break-words text-highlighted">
              {{ page.seo.title || 'Not set' }}
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-muted">
              Forms
            </dt>
            <dd class="mt-1 text-highlighted">
              {{ page.forms.length }} {{ page.forms.length === 1 ? 'form' : 'forms' }}
            </dd>
          </div>
          <div v-if="page.seo.description" class="min-w-0 sm:col-span-2">
            <dt class="text-xs text-muted">
              Meta description
            </dt>
            <dd class="mt-1 break-words text-highlighted">
              {{ page.seo.description }}
            </dd>
          </div>
        </dl>
      </li>
    </ul>
  </section>
</template>
