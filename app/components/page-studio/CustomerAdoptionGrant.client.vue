<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { z } from 'zod'
import { CustomerAdoptionPublicViewSchema, type CustomerAdoptionOperatorActionSchema } from '~~/shared/pageStudio/customerAdoptionTransport'

const props = defineProps<{ siteId: string, actorKey: string }>()
const saved = ref<z.infer<typeof CustomerAdoptionPublicViewSchema> | null>(null)
const busy = ref(false), failed = ref(false), copied = ref(false)
const modal = ref<'grant' | 'withdraw' | null>(null)
const modalAction = ref<'grant' | 'withdraw'>('grant')
watch(modal, value => { if (value) modalAction.value = value }, { flush: 'sync' })
let pendingGrant: Extract<z.infer<typeof CustomerAdoptionOperatorActionSchema>, { action: 'grant' }> | null = null
const uncertain = ref(false)
let generation = 0
const endpoint = () => `/api/agency/page-studio/sites/${props.siteId}/adoption-grant`
const selected = computed(() => {
  const value = saved.value?.view
  if (!value || value.action === 'withdraw') return null
  return value.action === 'inspect' ? value.selection : { grantId: value.grant.grantId, revision: value.grant.revision }
})
const setupUrl = computed(() => saved.value?.customerOrigin && selected.value
  ? `${saved.value.customerOrigin}/studio/adoption/${selected.value.grantId}?revision=${selected.value.revision}` : null)
const canGrant = computed(() => !busy.value && !failed.value && !uncertain.value && saved.value?.view.action === 'inspect' && saved.value.view.selection === null)
function accept(raw: unknown) {
  const result = CustomerAdoptionPublicViewSchema.parse(raw)
  if (result.view.siteId !== props.siteId || (result.view.action !== 'inspect' && result.view.grant.siteId !== props.siteId)) throw new Error('Different site')
  return result
}
async function inspect() {
  if (busy.value || !z.string().uuid().safeParse(props.siteId).success) return
  const current = generation
  busy.value = true; failed.value = false; saved.value = null; copied.value = false; modal.value = null
  try {
    const raw = await $fetch<unknown>(endpoint(), { retry: 0, timeout: 120000 })
    if (current !== generation) return
    const value = accept(raw)
    if (value.view.action !== 'inspect') throw new Error('Different action')
    saved.value = value
  } catch { if (current === generation) failed.value = true }
  finally { if (current === generation) busy.value = false }
}
async function run(recheck = false) {
  if (busy.value) return
  const chosen = selected.value
  let request: z.infer<typeof CustomerAdoptionOperatorActionSchema>
  if (recheck) {
    if (!pendingGrant || !uncertain.value) return
    request = pendingGrant
  } else if (modal.value === 'grant' && canGrant.value && saved.value?.view.action === 'inspect') {
    request = { action: 'grant', body: { grantId: crypto.randomUUID(), expectedGrantId: null, expectedRevision: 0,
      sourceDigest: saved.value.view.sourceDigest, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), reason: 'Complete the reviewed existing customer content adoption.' } }
    pendingGrant = request
  } else if (modal.value === 'withdraw' && chosen && !failed.value && !uncertain.value) {
    request = { action: 'withdraw', grantId: chosen.grantId, expectedRevision: chosen.revision }
  } else return
  const current = generation
  busy.value = true; failed.value = false; modal.value = null; copied.value = false
  try {
    const raw = await $fetch<unknown>(endpoint(), { method: 'POST', body: request, retry: 0, timeout: 120000 })
    if (current !== generation) return
    const value = accept(raw), view = value.view
    if (request.action === 'grant') {
      if (view.action !== 'grant' || view.grant.grantId !== request.body.grantId || view.grant.revision !== 1
        || view.grant.sourceDigest !== request.body.sourceDigest || view.grant.expiresAt !== request.body.expiresAt) throw new Error('Different grant')
    } else if (view.action !== 'withdraw' || view.grant.grantId !== request.grantId || view.grant.revision !== request.expectedRevision) throw new Error('Different withdrawal')
    saved.value = value; pendingGrant = null; uncertain.value = false
  } catch {
    if (current === generation) { failed.value = true; saved.value = null; uncertain.value = request.action === 'grant' }
  } finally { if (current === generation) busy.value = false }
}
async function copyLink() {
  if (!setupUrl.value || failed.value || busy.value) return
  const current = generation
  try { await navigator.clipboard.writeText(setupUrl.value); if (current === generation) copied.value = true }
  catch { if (current === generation) copied.value = false }
}
watch(() => [props.siteId, props.actorKey], () => {
  generation++; saved.value = null; pendingGrant = null; busy.value = false; failed.value = false; uncertain.value = false; copied.value = false; modal.value = null
}, { flush: 'sync' })
onBeforeUnmount(() => { generation++; pendingGrant = null; modal.value = null })
</script>

<template>
  <UCard>
    <div class="space-y-5">
      <div>
        <h2 class="text-lg font-semibold text-highlighted">Continue existing customer content setup</h2>
        <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">For a customer's saved website whose preview has expired. Check the source, then allow one hour to finish connecting its existing content. This does not renew the preview or enable publishing.</p>
      </div>
      <UAlert v-if="failed" color="warning" title="Action not confirmed" description="Check the recorded grant or refresh the source. No automatic retry has been made." />
      <UAlert v-if="saved?.view.action === 'grant'" color="info" :title="saved.view.historical ? 'Recorded grant retrieved' : 'Setup grant recorded'" description="The customer must sign in with their own account. Their current access is checked when they open the setup link." />
      <UAlert v-if="saved?.view.action === 'withdraw'" color="neutral" title="Setup grant withdrawn" description="This grant can no longer authorize content setup. Its history is preserved." />
      <div class="flex flex-wrap gap-3">
        <UButton label="Check saved source" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="busy" :disabled="busy" @click="inspect" />
        <UButton v-if="canGrant" label="Allow one hour of setup" @click="modal = 'grant'" />
        <UButton v-if="uncertain" label="Check this grant result" :disabled="busy" @click="run(true)" />
        <UButton v-if="selected && !failed && !uncertain" label="Withdraw setup access" color="neutral" variant="ghost" :disabled="busy" @click="modal = 'withdraw'" />
      </div>
      <div v-if="setupUrl && !failed && !uncertain" class="space-y-2 rounded-lg border border-default p-4">
        <p class="text-sm font-medium text-highlighted">Customer setup link</p>
        <p class="break-all text-sm text-muted">{{ setupUrl }}</p>
        <UButton :label="copied ? 'Link copied' : 'Copy customer link'" icon="i-lucide-copy" color="neutral" variant="outline" size="sm" @click="copyLink" />
      </div>
      <UModal :open="modal !== null" :title="modalAction === 'grant' ? 'Allow one hour of content setup?' : 'Withdraw this setup grant?'" :description="modalAction === 'grant' ? 'Only the original customer can continue the reviewed existing content setup. The saved source and current account access will be checked again.' : 'The customer will no longer be able to use this grant. Saved content and grant history remain unchanged.'" @update:open="value => { if (!value) modal = null }">
        <template #footer>
          <div class="flex w-full flex-wrap justify-end gap-3">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="modal = null" />
            <UButton :label="modalAction === 'grant' ? 'Confirm setup access' : 'Confirm withdrawal'" :disabled="busy" @click="run()" />
          </div>
        </template>
      </UModal>
    </div>
  </UCard>
</template>
