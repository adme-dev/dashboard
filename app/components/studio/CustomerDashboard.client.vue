<script setup lang="ts">
import { openCustomerStudio } from '~/utils/pageStudioCustomerLaunch'
import type { CustomerDashboard } from '~~/shared/pageStudio/customerDashboard'

useHead({ title: 'Your website — Page Studio' })
const api = '/api/portal/page-studio/customer'
const { data, error: loadError, refresh } = useFetch<CustomerDashboard>(`${api}/dashboard`, { server: false, immediate: false, timeout: 10000 })
const { data: formsAvailability, error: formsError, refresh: refreshForms } = useFetch<{ available: boolean, siteId: string | null }>(`${api}/website/availability`, { server: false, immediate: false, timeout: 10000 })
const canManageForms = computed(() => !loadError.value && !formsError.value && formsAvailability.value?.available === true && Boolean(formsAvailability.value.siteId))
const busy = ref(false)
const actionError = ref('')
const views: Record<CustomerDashboard['state'], { title: string, description: string, icon: string }> = {
  'recovery-required': { title: 'Continue your website setup', description: 'You’re signed in again. Resume to continue your saved setup with this login. We’ll keep the same website and its progress.', icon: 'i-lucide-play' },
  'setup-required': { title: 'Finish your business setup', description: 'Save your business details before creating your website.', icon: 'i-lucide-notebook-pen' },
  'approval-pending': { title: 'Your workspace is saved', description: 'Preview creation is not available for this workspace yet. Your business details are saved; contact support to arrange access.', icon: 'i-lucide-calendar-clock' },
  'available': { title: 'Create your first website preview', description: 'We’ll prepare your website using your saved business details. You can return to this overview to check progress.', icon: 'i-lucide-panels-top-left' },
  'preparing': { title: 'Creating your preview', description: 'Your setup is saved. Refresh to check progress; closing this tab will not create a second website.', icon: 'i-lucide-loader-circle' },
  'verification-pending': { title: 'Awaiting verification', description: 'Your website has been prepared. It needs a final check before editing can open. Nothing has been published.', icon: 'i-lucide-list-checks' },
  'needs-attention': { title: 'Your setup needs attention', description: 'We’ve kept your existing setup. Contact support so we can check it and help you continue.', icon: 'i-lucide-life-buoy' },
  'unavailable': { title: 'Status is temporarily unavailable', description: 'We could not check your website. Refresh the status in a moment. Your saved setup will be kept.', icon: 'i-lucide-cloud-off' }
}
const view = computed(() => data.value?.canOpenStudio
  ? { title: 'Continue editing your website', description: 'Open Studio to edit your saved draft. Your changes stay private until a separate publishing step.', icon: 'i-lucide-panels-top-left' }
  : data.value ? views[data.value.state] : null)
const steps = computed(() => [
  { label: 'Business details saved', done: true },
  { label: 'Website prepared', done: (data.value?.stage ?? 0) >= 3 },
  { label: 'Content added', done: (data.value?.stage ?? 0) >= 4 },
  { label: 'Preview verified', done: false }
])
async function load() {
  if (busy.value) return
  busy.value = true
  try {
    formsAvailability.value = null
    await refresh()
    if (!loadError.value && data.value) await refreshForms()
    if (loadError.value?.statusCode === 401) await navigateTo('/studio/signup', { replace: true })
    else if (!loadError.value && data.value?.state === 'setup-required') await navigateTo('/studio/onboarding', { replace: true })
  } finally { busy.value = false }
}
onMounted(load)
async function createPreview() {
  if (busy.value || loadError.value || (!data.value?.canCreate && !data.value?.canRetry)) return
  busy.value = true
  actionError.value = ''
  try {
    await $fetch(`${api}/preview`, { method: 'POST', body: {} })
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 401) await navigateTo('/studio/signup', { replace: true })
    actionError.value = 'We could not confirm the last request. Your saved setup has been kept. Check the refreshed status before trying again.'
  } finally {
    busy.value = false
    await load()
  }
}
async function recoverPreview() {
  if (busy.value || loadError.value || data.value?.state !== 'recovery-required' || !data.value.recovery) return
  busy.value = true
  actionError.value = ''
  try {
    await $fetch(`${api}/recover`, { method: 'POST', body: { ...data.value.recovery, recoveryId: crypto.randomUUID() } })
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 401) await navigateTo('/studio/signup', { replace: true })
    actionError.value = 'We could not confirm the last request. Your saved setup has been kept. Check the refreshed status before trying again.'
  } finally {
    busy.value = false
    await load()
  }
}
async function openStudio() {
  if (busy.value || loadError.value || !data.value?.canOpenStudio) return
  busy.value = true
  actionError.value = ''
  try {
    const session = await $fetch<{ token: string, editorOrigin: string, expiresAt: string }>(`${api}/editor`, { method: 'POST', body: {} })
    openCustomerStudio(session)
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 401) await navigateTo('/studio/signup', { replace: true })
    actionError.value = 'We could not open Studio. Your saved draft is safe. Refresh your overview and try again, or contact support.'
  } finally { busy.value = false }
}
async function signOut() {
  if (busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await $fetch(`${api}/logout`, { method: 'POST', body: {} })
    await navigateTo('/studio/signup')
  } catch {
    actionError.value = 'We could not sign you out. Please try again.'
  } finally { busy.value = false }
}
</script>

<template>
  <StudioCustomerShell wide :title="data?.businessName || 'Your website'" description="Your website overview. Pick up where you left off.">
    <template #header>
      <div class="flex items-center gap-2">
        <UButton
          to="/support"
          label="Get help"
          color="neutral"
          variant="ghost"
        />
        <UButton
          label="Sign out"
          color="neutral"
          variant="outline"
          :disabled="busy"
          @click="signOut"
        />
      </div>
    </template>
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <UBadge color="neutral" variant="subtle" label="Not published" />
      <UButton
        label="Refresh status"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        :loading="busy"
        @click="load"
      />
    </div>
    <UAlert
      v-if="loadError"
      class="mb-5"
      color="error"
      title="Status could not refresh"
      description="We could not refresh your website. The information below may be out of date. Refresh again before continuing."
      role="alert"
    />
    <UAlert
      v-if="actionError"
      class="mb-5"
      color="warning"
      title="Check your setup"
      :description="actionError"
      role="alert"
    />
    <div
      v-if="!data && busy"
      class="space-y-4"
      aria-busy="true"
      aria-label="Loading your website"
    >
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-48 w-full" />
      <p class="text-sm text-muted" role="status">
        Loading your website…
      </p>
    </div>
    <div v-else-if="data && view" class="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section class="overflow-hidden rounded-xl border border-default bg-elevated/40" aria-labelledby="website-status">
        <div class="border-b border-default p-6 sm:p-8">
          <div class="mb-6 flex size-12 items-center justify-center rounded-lg border border-default bg-default">
            <UIcon :name="view.icon" class="size-6 text-primary" />
          </div>
          <div aria-live="polite" aria-atomic="true">
            <h2 id="website-status" class="text-xl font-semibold tracking-tight text-highlighted sm:text-2xl">
              {{ view.title }}
            </h2>
            <p class="mt-3 max-w-prose leading-7 text-muted">
              {{ view.description }}
            </p>
          </div>
          <UButton
            v-if="data.canOpenStudio"
            class="mt-6"
            label="Open Studio"
            icon="i-lucide-panels-top-left"
            size="lg"
            :loading="busy"
            :disabled="Boolean(loadError)"
            @click="openStudio"
          />
          <UButton
            v-else-if="data.canCreate"
            class="mt-6"
            label="Create preview"
            icon="i-lucide-plus"
            size="lg"
            :loading="busy"
            :disabled="Boolean(loadError)"
            @click="createPreview"
          />
          <UButton
            v-else-if="data.state === 'recovery-required' && data.recovery"
            class="mt-6"
            label="Resume setup"
            icon="i-lucide-play"
            size="lg"
            :loading="busy"
            :disabled="Boolean(loadError)"
            @click="recoverPreview"
          />
          <UButton
            v-else-if="data.canRetry"
            class="mt-6"
            label="Resume setup"
            icon="i-lucide-play"
            size="lg"
            :loading="busy"
            :disabled="Boolean(loadError)"
            @click="createPreview"
          />
          <UButton
            v-else-if="['needs-attention', 'approval-pending'].includes(data.state)"
            class="mt-6"
            to="/support"
            label="Contact support"
            color="neutral"
            variant="outline"
          />
        </div>
        <div v-if="canManageForms" class="flex flex-wrap items-center justify-between gap-3 border-b border-default px-6 py-5 sm:px-8">
          <div>
            <h3 class="text-sm font-medium text-highlighted">
              Website forms
            </h3>
            <p class="mt-1 text-sm text-muted">
              Review form outcomes, team recipients and email template drafts.
            </p>
          </div>
          <UButton
            to="/studio/website"
            label="Manage forms"
            icon="i-lucide-list-checks"
            color="neutral"
            variant="outline"
            :disabled="busy"
          />
        </div>
        <div class="px-6 py-5 sm:px-8">
          <h3 class="text-sm font-medium text-highlighted">
            A private place to get started
          </h3>
          <p class="mt-1 text-sm leading-6 text-muted">
            Creating a preview does not publish your website or take a payment.
          </p>
        </div>
      </section>
      <aside class="space-y-8" aria-label="Website setup details">
        <section aria-labelledby="setup-progress">
          <h2 id="setup-progress" class="font-semibold text-highlighted">
            Setup progress
          </h2>
          <ol class="mt-5 space-y-5">
            <li v-for="step in steps" :key="step.label" class="flex items-start gap-3 text-sm">
              <UIcon :name="step.done ? 'i-lucide-circle-check' : 'i-lucide-circle'" class="mt-0.5 size-5 shrink-0" :class="step.done ? 'text-success' : 'text-dimmed'" />
              <span :class="step.done ? 'text-default' : 'text-muted'">{{ step.label }}<span class="sr-only">{{ step.done ? ': complete' : ': pending' }}</span></span>
            </li>
          </ol>
        </section>
        <section class="border-t border-default pt-6" aria-labelledby="business-details">
          <h2 id="business-details" class="font-semibold text-highlighted">
            Business details
          </h2>
          <dl class="mt-4 space-y-4 text-sm">
            <div>
              <dt class="text-muted">
                Business type
              </dt><dd class="mt-1 break-words">
                {{ data.businessType }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Timezone
              </dt><dd class="mt-1 break-words">
                {{ data.timezone }}
              </dd>
            </div>
          </dl>
        </section>
      </aside>
    </div>
  </StudioCustomerShell>
</template>
