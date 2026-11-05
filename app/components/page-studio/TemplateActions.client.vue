<script setup lang="ts">
import type { z } from 'zod'
import { StoredTemplateCopyAttemptSchema, TemplateCopyRecoverySchema, type TemplateCopyAttempt } from '~~/shared/pageStudio/templateCopyRecovery'
import { openCustomerStudio } from '~/utils/pageStudioCustomerLaunch'
import { PageStudioTemplatePreviewSchema, PageStudioTemplateUseSchema, type PageStudioTemplateCard } from '~~/shared/pageStudio/templateCatalogue'

const props = defineProps<{ endpoint: '/api/portal/page-studio/templates' | '/api/portal/page-studio/customer/templates' }>()
const emit = defineEmits<{ changed: [] }>()
const selected = ref<PageStudioTemplateCard | null>(null)
const mode = ref<'preview' | 'use' | null>(null)
const busy = ref(false)
const message = ref('')
const previewUrl = ref<string | null>(null)
const width = ref<393 | 1440>(1440)
const canEmbed = ref(false)
onMounted(() => {
  canEmbed.value = window.location.origin === 'https://app.xeroflow.io'
})
const name = ref('')
const route = ref('')
const pendingTemplate = ref<PageStudioTemplateCard | null>(null)
const attempt = ref<TemplateCopyAttempt | null>(null)
const recoveryScope = ref<string | null>(null)
const recoveryReady = ref(false)
const storageKey = (scope: string) => `xf-template-copy-v1:${scope}`
let recoveryGeneration = 0
function forgetAttempt() { if (recoveryScope.value) localStorage.removeItem(storageKey(recoveryScope.value)) }
function persistAttempt(pending: TemplateCopyAttempt) {
  if (!recoveryScope.value) throw new Error('Copy account is not verified')
  const value = StoredTemplateCopyAttemptSchema.parse({ recoveryScope: recoveryScope.value, attempt: pending })
  const encoded = JSON.stringify(value)
  localStorage.setItem(storageKey(value.recoveryScope), encoded)
  if (localStorage.getItem(storageKey(value.recoveryScope)) !== encoded) throw new Error('Copy recovery could not be stored')
}
async function recoverCopies() {
  const current = ++recoveryGeneration
  recoveryReady.value = false
  const state = TemplateCopyRecoverySchema.parse(await $fetch(`${props.endpoint}/copies`))
  if (current !== recoveryGeneration) throw new Error('Copy account changed')
  if (recoveryScope.value !== state.recoveryScope) {
    attempt.value = null; pendingTemplate.value = null; receipt.value = null; selected.value = null
  }
  recoveryScope.value = state.recoveryScope
  const raw = localStorage.getItem(storageKey(state.recoveryScope))
  if (raw) {
    if (raw.length > 4096) throw new Error('Copy recovery is invalid')
    const saved = StoredTemplateCopyAttemptSchema.parse(JSON.parse(raw))
    if (saved.recoveryScope !== state.recoveryScope) throw new Error('Copy account changed')
    attempt.value = Object.freeze(saved.attempt)
  }
  const known = attempt.value && state.items.find(item => item.attempt.requestId === attempt.value?.requestId)
  if (known && JSON.stringify(known.attempt) !== JSON.stringify(attempt.value)) throw new Error('The saved copy request changed')
  const completed = attempt.value && state.items.find(item => item.attempt.requestId === attempt.value?.requestId && item.status === 'ready')
  if (completed) {
    receipt.value = { requestId: completed.attempt.requestId, versionId: completed.attempt.versionId, siteId: completed.siteId, status: 'ready' }
    forgetAttempt(); attempt.value = null; pendingTemplate.value = null
  }
  if (!attempt.value) {
    const completed = requestId && state.items.find(item => item.attempt.requestId === requestId && item.status === 'ready')
    if (completed) { receipt.value = { requestId: completed.attempt.requestId, versionId: completed.attempt.versionId, siteId: completed.siteId, status: 'ready' }; mode.value = 'use'; message.value = ''; emit('changed'); return }
    const pending = state.items.find(item => item.status === 'preparing')
    if (pending) { attempt.value = Object.freeze(pending.attempt); persistAttempt(pending.attempt); receipt.value = null }
  }
  recoveryReady.value = true
  return state
}
onMounted(() => { void recoverCopies().catch(() => { message.value = 'Copy recovery could not be checked. Refresh before starting or resuming a copy.' }) })
const receipt = ref<z.infer<typeof PageStudioTemplateUseSchema> | null>(null)
const open = computed({
  get: () => mode.value !== null,
  set: (value: boolean) => {
    if (!value && !busy.value) mode.value = null
  }
})
const destination = computed(() => receipt.value?.status === 'ready'
  ? props.endpoint.includes('/customer/') ? '/studio/dashboard' : `/studio/sites/${receipt.value.siteId}`
  : null)
let generation = 0
async function showUse(item: PageStudioTemplateCard) {
  if (!item.canUse || busy.value) return
  busy.value = true
  try { await recoverCopies() } catch { message.value = 'Copy recovery could not be checked. Refresh before starting another copy.'; mode.value = 'use'; return } finally { busy.value = false }
  // An uncertain request must be reconciled before selecting another version.
  if (attempt.value && attempt.value.versionId !== item.versionId) {
    selected.value = pendingTemplate.value
    name.value = attempt.value.name; route.value = attempt.value.route
    message.value = 'Check the previous copy request before choosing another template.'
    mode.value = 'use'
    return
  }
  if (!attempt.value) receipt.value = null
  selected.value = item
  name.value = attempt.value?.name ?? `${item.name} copy`
  route.value = attempt.value?.route ?? ''
  message.value = ''
  mode.value = 'use'
}
async function showPreview(item: PageStudioTemplateCard) {
  if (!item.canPreview || busy.value) return
  selected.value = item
  mode.value = 'preview'
  width.value = 1440
  previewUrl.value = null
  message.value = ''
  busy.value = true
  const current = ++generation
  try {
    const response = PageStudioTemplatePreviewSchema.parse(await $fetch(`${props.endpoint}/${encodeURIComponent(item.versionId)}/preview`, { method: 'POST', body: {} }))
    const expected = `https://template-${item.versionId.replaceAll('-', '').toLowerCase()}.xeroflow.io/`
    if (response.versionId !== item.versionId || response.url !== expected) throw new Error('Invalid preview')
    if (generation === current) previewUrl.value = response.url
  } catch {
    if (generation === current) message.value = 'This saved preview could not be opened. Refresh the catalogue and try again.'
  } finally {
    if (generation === current) busy.value = false
  }
}
async function useTemplate() {
  if (busy.value || (!selected.value?.canUse && !attempt.value)) return
  const template = selected.value
  const originalRequest = attempt.value?.requestId
  const originalScope = recoveryScope.value
  busy.value = true
  try { await recoverCopies(); if (!originalScope || recoveryScope.value !== originalScope) throw new Error('Copy account changed') } catch { message.value = 'The copy account changed or recovery is unavailable. Reload before continuing.'; return } finally { busy.value = false }
  if (!recoveryReady.value) return
  if (originalRequest && receipt.value?.requestId === originalRequest && receipt.value.status === 'ready') { emit('changed'); return }
  const cleanName = name.value.trim()
  const cleanRoute = route.value.trim().toLowerCase()
  if (!attempt.value && (!cleanName || cleanName.length > 160 || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(cleanRoute))) {
    message.value = 'Enter a website name and a route using letters, numbers and hyphens.'
    return
  }
  if (!attempt.value && !template?.canUse) return
  const pending = attempt.value ?? Object.freeze({ versionId: template!.versionId, requestId: crypto.randomUUID(), name: cleanName, route: cleanRoute })
  try { persistAttempt(pending) } catch { message.value = 'Browser recovery storage is unavailable. No copy request was sent. Enable storage and retry.'; return }
  attempt.value = pending
  pendingTemplate.value ??= template
  busy.value = true
  message.value = ''
  try {
    const result = PageStudioTemplateUseSchema.parse(await $fetch(`${props.endpoint}/${encodeURIComponent(pending.versionId)}/use`, {
      method: 'POST', headers: { 'x-page-studio-copy-scope': recoveryScope.value! }, body: { requestId: pending.requestId, name: pending.name, route: pending.route }
    }))
    if (result.requestId !== pending.requestId || result.versionId !== pending.versionId) throw new Error('Copy identity changed')
    receipt.value = result
    if (result.status === 'ready') {
      forgetAttempt()
      attempt.value = null
      pendingTemplate.value = null
      emit('changed')
    }
  } catch {
    message.value = 'The copy could not be confirmed. Its original request is saved for recovery. Resume the same request after refreshing; do not start another copy.'
  } finally { busy.value = false }
}
async function openCopy() {
  if (busy.value || receipt.value?.status !== 'ready' || !props.endpoint.includes('/customer/')) return
  busy.value = true
  message.value = ''
  try {
    const session = await $fetch<{ token: string, editorOrigin: string, expiresAt: string }>(`/api/portal/page-studio/customer/sites/${receipt.value.siteId}/template-editor`, { method: 'POST', body: {} })
    openCustomerStudio(session)
  } catch {
    message.value = 'Your copy is saved. Its editor could not open yet; retry to check current access and editor readiness.'
  } finally { busy.value = false }
}
function close() {
  if (!busy.value) mode.value = null
}
function confirmLeaving() {
  return !attempt.value || window.confirm('This copy has not been confirmed yet. Stay on this page to check the same request before starting another copy. Leave anyway?')
}
onBeforeRouteLeave(confirmLeaving)
onBeforeRouteUpdate(confirmLeaving)
onBeforeUnmount(() => {
  generation++
})
async function resumeCopy(requestId?: string) {
  if (busy.value) return
  busy.value = true
  try {
    const state = await recoverCopies()
    const completed = requestId && state.items.find(item => item.attempt.requestId === requestId && item.status === 'ready')
    if (completed) { receipt.value = { requestId: completed.attempt.requestId, versionId: completed.attempt.versionId, siteId: completed.siteId, status: 'ready' }; mode.value = 'use'; message.value = ''; emit('changed'); return }
    const pending = state.items.find(item => item.status === 'preparing' && (!requestId || item.attempt.requestId === requestId))
    if (pending && (!attempt.value || attempt.value.requestId === pending.attempt.requestId)) { attempt.value = Object.freeze(pending.attempt); persistAttempt(pending.attempt); receipt.value = null }
    if (!attempt.value) { message.value = receipt.value?.status === 'ready' ? '' : 'No unfinished copy was found for this account.'; mode.value = 'use'; return }
    name.value = attempt.value.name; route.value = attempt.value.route; selected.value = null; mode.value = 'use'; message.value = 'Resume the saved request with its original website name and route.'
  } catch { message.value = 'Recovery could not be checked for this account. Refresh and try again.'; mode.value = 'use' } finally { busy.value = false }
}
defineExpose({ showPreview, showUse, resumeCopy })
</script>

<template>
  <UAlert v-if="attempt && !open" color="warning" title="Unfinished website copy" description="Resume the saved request before starting another copy.">
    <template #actions><UButton label="Resume copy" :disabled="busy" @click="resumeCopy()" /></template>
  </UAlert>
  <UModal
    v-model:open="open"
    :title="mode === 'preview' ? `${selected?.name ?? 'Template'} preview` : 'Use template'"
    :description="mode === 'preview' ? 'Review this saved version before creating your own website.' : 'Create an independent website from the selected saved version.'"
    :dismissible="!busy"
    :ui="{ content: mode === 'preview' ? 'sm:max-w-[min(96vw,1500px)]' : 'sm:max-w-xl' }"
    scrollable
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="message"
          color="warning"
          title="Check this request"
          :description="message"
        />
        <template v-if="mode === 'preview'">
          <div v-if="canEmbed" class="flex flex-wrap gap-2" aria-label="Preview viewport">
            <UButton
              label="Desktop"
              :aria-pressed="width === 1440"
              color="neutral"
              :variant="width === 1440 ? 'solid' : 'outline'"
              @click="width = 1440"
            />
            <UButton
              label="Mobile"
              :aria-pressed="width === 393"
              color="neutral"
              :variant="width === 393 ? 'solid' : 'outline'"
              @click="width = 393"
            />
          </div>
          <p v-if="busy" role="status">
            Loading saved preview…
          </p>
          <div v-if="previewUrl && canEmbed" class="overflow-auto rounded-lg border border-default bg-elevated p-2">
            <iframe
              :key="previewUrl"
              :src="previewUrl"
              :style="{ width: `${width}px` }"
              class="mx-auto block h-[70vh] max-w-none border-0 bg-white"
              sandbox="allow-scripts"
              referrerpolicy="no-referrer"
              :title="`${selected?.name} saved template preview`"
            />
          </div>
          <UAlert
            v-if="previewUrl && !canEmbed"
            color="neutral"
            title="Open this preview in a new tab"
            description="Embedded desktop and mobile previews are available in the hosted Page Studio account. Use the shareable preview link below in this environment."
          />
          <p v-if="previewUrl && canEmbed" class="text-sm text-muted">
            Forms are disabled in preview. Scroll horizontally if the desktop viewport is wider than your screen.
          </p>
        </template>
        <template v-else-if="receipt?.status === 'ready'">
          <UAlert color="success" title="Website copy saved" description="Your copy has its own saved content. The template remains unchanged. Editing and publishing availability are checked in your website workspace." />
        </template>
        <template v-else>
          <p class="text-sm text-muted">
            {{ selected?.name }} · The selected saved version will be copied. This does not publish your website.
          </p>
          <UFormField label="Website name" required>
            <UInput
              v-model="name"
              class="w-full"
              maxlength="160"
              :disabled="busy || !!attempt"
            />
          </UFormField>
          <UFormField label="Website route" help="Use letters, numbers and hyphens." required>
            <UInput
              v-model="route"
              class="w-full"
              maxlength="63"
              :disabled="busy || !!attempt"
            />
          </UFormField>
          <p v-if="receipt?.status === 'preparing'" role="status">
            Your copy is being prepared. Check the same request to confirm when it is saved.
          </p>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          label="Close"
          color="neutral"
          variant="ghost"
          :disabled="busy"
          @click="close"
        />
        <UButton
          v-if="mode === 'preview' && previewUrl"
          label="Open shareable preview"
          :to="previewUrl"
          target="_blank"
          rel="noopener noreferrer"
          color="neutral"
          variant="outline"
        />
        <UButton
          v-if="mode === 'preview' && selected?.canUse"
          label="Use template"
          :disabled="busy"
          @click="showUse(selected)"
        />
        <UButton v-if="mode === 'use' && receipt?.status === 'ready' && endpoint.includes('/customer/')" label="Open copy" :loading="busy" @click="openCopy" />
        <UButton v-if="mode === 'use' && destination" :label="endpoint.includes('/customer/') ? 'View my websites' : 'Open website workspace'" :to="destination" />
        <UButton
          v-else-if="mode === 'use'"
          :label="attempt ? 'Resume copy' : 'Create website copy'"
          :loading="busy"
          :disabled="!recoveryReady || (!selected?.canUse && !attempt)"
          @click="useTemplate"
        />
      </div>
    </template>
  </UModal>
</template>
