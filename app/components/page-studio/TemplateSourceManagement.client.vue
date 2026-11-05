<script setup lang="ts">
import { z } from 'zod'
import { PageStudioStagingStateSchema } from '~~/shared/pageStudio/staging'

const Sources = z.object({ items: z.array(z.object({ siteId: z.string().uuid(), slug: z.string().min(1).max(80), name: z.string().min(1).max(160) }).strict()).max(50) }).strict()
const Registration = z.object({ templateId: z.string().uuid(), versionId: z.string().uuid(), format: z.enum(['code-pages', 'typed']), replayed: z.boolean() }).strict()
const { canWrite, hasPermission } = useAuth()
const allowed = computed(() => canWrite.value && hasPermission('PAGE_STUDIO_PUBLISH'))
const { data, status, error, refresh } = await useAsyncData('agency-template-sources', async () => Sources.parse(await $fetch('/api/agency/page-studio/templates/sources')))
const busy = ref(false)
const message = ref('')
const selected = ref<z.infer<typeof Sources>['items'][number] | null>(null)
const snapshot = ref<NonNullable<z.infer<typeof PageStudioStagingStateSchema>['active']> | null>(null)
const versionId = ref<string | null>(null)
const previewUrl = ref<string | null>(null)
const Availability = z.object({ versionId: z.string().uuid(), available: z.boolean(), withdrawn: z.boolean(), previewPublished: z.boolean(), replayed: z.boolean() }).strict()
const availability = ref<z.infer<typeof Availability> | null>(null)
const availabilityAttempt = ref<{ requestId: string, expectedAvailable: boolean, available: boolean } | null>(null)
async function loadAvailability() {
  if (!versionId.value) return
  const selectedVersion = versionId.value
  const result = Availability.parse(await $fetch(`/api/agency/page-studio/templates/${selectedVersion}/availability`))
  if (result.versionId !== selectedVersion) throw new Error('Unexpected availability receipt')
  if (versionId.value === selectedVersion) availability.value = result
}
async function changeAvailability() {
  if (!allowed.value || busy.value || !versionId.value || !availability.value?.previewPublished) return
  availabilityAttempt.value ??= { requestId: crypto.randomUUID(), expectedAvailable: availability.value.available, available: !availability.value.available }
  busy.value = true
  message.value = ''
  try {
    const result = Availability.parse(await $fetch(`/api/agency/page-studio/templates/${versionId.value}/availability`, { method: 'POST', body: availabilityAttempt.value }))
    if (result.versionId !== versionId.value) throw new Error('Unexpected availability receipt')
    availability.value = result
    availabilityAttempt.value = null
  } catch {
    message.value = 'Catalogue availability was not confirmed. Retry the same request or reload its status.'
  } finally { busy.value = false }
}
async function refreshAvailability() {
  if (busy.value) return
  busy.value = true
  try {
    await loadAvailability()
  } catch {
    message.value = 'Catalogue availability could not be loaded.'
  } finally { busy.value = false }
}
let sequence = 0
async function select(source: z.infer<typeof Sources>['items'][number]) {
  if (busy.value) return
  const attempt = ++sequence
  selected.value = source
  snapshot.value = null
  versionId.value = null
  previewUrl.value = null
  availability.value = null
  availabilityAttempt.value = null
  message.value = ''
  busy.value = true
  try {
    const state = PageStudioStagingStateSchema.parse(await $fetch(`/api/agency/page-studio/sites/${source.siteId}/staging`))
    if (attempt !== sequence) return
    if (state.siteId !== source.siteId || !state.active || !state.canManage) throw new Error('Prepare an available website preview before registering this template.')
    snapshot.value = state.active
  } catch (cause) {
    if (attempt === sequence) message.value = cause instanceof Error ? cause.message : 'Could not load this template source.'
  } finally { if (attempt === sequence) busy.value = false }
}
async function register() {
  if (!allowed.value || busy.value || !selected.value || !snapshot.value) return
  busy.value = true
  message.value = ''
  try {
    const result = Registration.parse(await $fetch('/api/agency/page-studio/templates', { method: 'POST', body: {
      sourceSiteId: selected.value.siteId, sourceCheckpointId: snapshot.value.checkpointId,
      expectedDigest: snapshot.value.digest, slug: selected.value.slug, name: selected.value.name
    } }))
    versionId.value = result.versionId
    await loadAvailability()
  } catch {
    message.value = 'Registration was not confirmed. Retry to recover the same saved version.'
  } finally { busy.value = false }
}
async function publish() {
  if (!allowed.value || busy.value || !versionId.value || !snapshot.value) return
  busy.value = true
  message.value = ''
  try {
    const result = z.object({ versionId: z.string().uuid(), url: z.string().url() }).strict().parse(await $fetch(`/api/agency/page-studio/templates/${versionId.value}/publish-preview`, { method: 'POST', body: { snapshotId: snapshot.value.id } }))
    const expected = `https://template-${versionId.value.replaceAll('-', '')}.xeroflow.io/`
    if (result.versionId !== versionId.value || result.url !== expected) throw new Error('Unexpected preview receipt')
    previewUrl.value = result.url
    await loadAvailability()
  } catch {
    message.value = 'Public preview publication was not confirmed. Retry after the preview service is ready.'
  } finally { busy.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <UAlert title="Curated automotive templates" description="Only approved template sources appear here. Register the selected saved preview, then publish its permanent public preview. Visitors with the link can see the published template." icon="i-lucide-layout-template" />
    <UAlert v-if="!allowed" color="warning" title="Publishing permission is required to manage templates." />
    <p v-if="status === 'pending'" role="status">
      Loading approved sources…
    </p>
    <UAlert v-else-if="error" color="error" title="Approved template sources could not be loaded.">
      <template #actions>
        <UButton label="Retry" variant="outline" @click="refresh()" />
      </template>
    </UAlert>
    <p v-else-if="!data?.items.length">
      No template sources have been approved for this account.
    </p>
    <div v-else class="flex flex-wrap gap-2">
      <UButton
        v-for="source in data.items"
        :key="source.siteId"
        :label="source.name"
        :variant="selected?.siteId === source.siteId ? 'solid' : 'outline'"
        :disabled="busy"
        @click="select(source)"
      />
    </div>
    <UCard v-if="selected">
      <template #header>
        <h2 class="font-semibold">
          {{ selected.name }}
        </h2>
      </template>
      <div class="space-y-4">
        <p v-if="busy" role="status">
          Working…
        </p>
        <UAlert v-if="message" color="warning" :title="message" />
        <p v-if="snapshot" class="text-sm text-muted">
          Selected saved preview: {{ new Date(snapshot.deployedAt).toLocaleString() }}. Later source edits do not change this version.
        </p>
        <UButton
          v-if="!snapshot"
          label="Reload source preview"
          :disabled="busy"
          @click="select(selected)"
        />
        <UButton
          v-if="snapshot && !versionId"
          label="Register template version"
          :disabled="!allowed || busy"
          :loading="busy"
          @click="register"
        />
        <template v-if="versionId && !previewUrl && !availability?.withdrawn">
          <p>Version registered. Its public preview has not been confirmed.</p>
          <UButton
            label="Publish public template preview"
            :disabled="!allowed || busy"
            :loading="busy"
            @click="publish"
          />
        </template>
        <UCard v-if="versionId">
          <div class="space-y-3">
            <p>{{ availability?.available ? 'Available to signed-in Page Studio accounts. Creating a copy requires an eligible plan and capacity.' : 'Not available in the shared Page Studio catalogue.' }}</p>
            <p class="text-sm text-muted">
              Withdrawing disables new selections and this version’s public preview. Existing independent copies remain available.
            </p>
            <UButton
              v-if="availability?.previewPublished"
              :label="availabilityAttempt ? 'Retry availability change' : availability.available ? 'Withdraw from Page Studio templates' : 'Make available in Page Studio templates'"
              :disabled="!allowed || busy"
              @click="changeAvailability"
            />
            <p v-else class="text-sm text-muted">
              A confirmed public template preview is required first.
            </p>
            <UButton
              label="Refresh catalogue status"
              variant="ghost"
              :disabled="busy"
              @click="refreshAvailability"
            />
          </div>
        </UCard>
        <template v-if="previewUrl && !availability?.withdrawn">
          <UAlert color="success" title="Public template preview published" />
          <UButton
            :to="previewUrl"
            target="_blank"
            rel="noopener noreferrer"
            label="Open shareable preview"
            icon="i-lucide-external-link"
          />
          <p class="break-all text-sm">
            {{ previewUrl }}
          </p>
        </template>
      </div>
    </UCard>
  </div>
</template>
