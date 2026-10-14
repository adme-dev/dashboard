<script setup lang="ts">
import type { PageStudioLaunchState } from '~~/shared/pageStudio/launchReadiness'

const props = defineProps<{ siteId: string }>()
const { data, error, status, refresh } = await useFetch<PageStudioLaunchState>(
  () => `/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/launch-state`
)
const state = computed(() => !error.value && data.value?.siteId === props.siteId ? data.value : null)
</script>

<template>
  <section class="space-y-5 border-b border-default pb-8" aria-label="Website launch status">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-xl font-medium tracking-tight text-highlighted">
          Your website launch
        </h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Check your saved content and publication before connecting your domain below.
        </p>
      </div>
      <UButton
        label="Refresh status"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </header>
    <UAlert
      v-if="error || (!state && status !== 'pending')"
      color="warning"
      title="Launch status unavailable"
      description="Refresh to check your current access and website status. Your live website has not been changed."
    />
    <div
      v-else-if="!state"
      aria-label="Loading launch status"
      aria-busy="true"
      class="space-y-3"
    >
      <USkeleton class="h-14 w-full" /><USkeleton class="h-14 w-full" />
    </div>
    <template v-else>
      <dl class="divide-y divide-default border-t border-default">
        <div class="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="font-medium text-highlighted">
            Saved website
          </dt>
          <dd class="text-sm leading-6 text-muted">
            {{ state.content.status === 'ready' ? `${state.content.publicPages} visitor pages saved` : state.content.status === 'required' ? 'Save at least one visitor page in Page Studio.' : 'Saved content could not be checked. Refresh to try again.' }}
          </dd>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="font-medium text-highlighted">
            Approval
          </dt>
          <dd class="text-sm leading-6 text-muted">
            {{ state.content.status === 'unavailable' ? 'Approval could not be checked. Refresh to try again.' : state.approvedVersionId ? 'Current version approved' : 'The current saved version still needs review and approval.' }}
          </dd>
        </div>
        <div class="grid gap-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt class="font-medium text-highlighted">
            Publication
          </dt>
          <dd class="space-y-2 text-sm leading-6 text-muted">
            <template v-if="state.activeReleases.length">
              <p v-for="release in state.activeReleases" :key="release.id + release.hostname" class="break-all">
                <UBadge
                  label="Publication recorded"
                  color="success"
                  variant="subtle"
                  class="mr-2"
                />
                {{ release.hostname }}
              </p>
              <p>A publication is recorded for these domains. Check domain and HTTPS readiness below. Saved changes may still need publishing.</p>
            </template>
            <p v-else>
              No publication recorded. Approval and domain verification do not publish the website.
            </p>
          </dd>
        </div>
      </dl>
      <p v-if="state.content.publicForms" class="text-sm leading-6 text-muted">
        Your saved pages include enquiry forms. Confirm a test enquiry and notification delivery before launch.
      </p>
    </template>
  </section>
</template>
