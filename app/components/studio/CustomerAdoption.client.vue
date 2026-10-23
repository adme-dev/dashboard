<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { z } from 'zod'
import { CustomerAdoptionGrantReferenceSchema, type CustomerAdoptionSetupRequestSchema } from '~~/shared/pageStudio/customerAdoptionGrant'
import { CustomerCmsAdoptionStatusSchema } from '~~/shared/pageStudio/customerCmsSetup'

const props = defineProps<{ grantId: string, revision: number }>()
const Status = z.object({ resumeRequired: z.boolean(), adoption: CustomerCmsAdoptionStatusSchema.nullable() }).strict()
const saved = ref<z.infer<typeof Status> | null>(null)
const busy = ref(false), failed = ref(false), confirm = ref(false)
let generation = 0
const reference = computed(() => CustomerAdoptionGrantReferenceSchema.safeParse({ grantId: props.grantId, revision: props.revision }))
const endpoint = () => `/api/portal/page-studio/customer/cms-adoption/${props.grantId}`
function response(raw: unknown) {
  const value = z.object({ grant: CustomerAdoptionGrantReferenceSchema, result: z.unknown() }).strict().parse(raw)
  if (value.grant.grantId !== props.grantId || value.grant.revision !== props.revision) throw new Error('Different grant')
  return value.result
}
async function refresh() {
  if (busy.value || !reference.value.success) return
  const current = generation
  busy.value = true; failed.value = false; saved.value = null; confirm.value = false
  try {
    const raw = await $fetch<unknown>(endpoint(), { query: { revision: props.revision }, retry: 0, timeout: 120000 })
    if (current === generation) saved.value = Status.parse(response(raw))
  } catch { if (current === generation) failed.value = true }
  finally { if (current === generation) busy.value = false }
}
const next = computed<z.infer<typeof CustomerAdoptionSetupRequestSchema> | null>(() => {
  if (!reference.value.success || !saved.value || failed.value) return null
  const grant = reference.value.data
  if (saved.value.resumeRequired) return { operation: 'resume', grant }
  const adoption = saved.value.adoption
  if (!adoption || adoption.phase === 'managed') return null
  if (adoption.recoveryRequired) return null // Recovery is constructed at confirmation, with a new explicit ID.
  if (adoption.phase === 'idle') return { operation: 'adoption', grant, request: { action: 'start' } }
  if (!adoption.adoptionId) return null
  return { operation: 'adoption', grant, request: { action: 'advance', adoptionId: adoption.adoptionId, expectedProgressDigest: adoption.progressDigest } }
})
const canRecover = computed(() => !failed.value && reference.value.success && Boolean(saved.value?.adoption?.recoveryRequired && saved.value.adoption.adoptionId))
const label = computed(() => saved.value?.resumeRequired ? 'Connect this sign-in' : canRecover.value ? 'Recover saved setup' : saved.value?.adoption?.phase === 'idle' ? 'Prepare my content' : 'Continue content setup')
async function proceed() {
  if (!confirm.value || busy.value || failed.value || !reference.value.success) return
  const adoption = saved.value?.adoption
  const body = canRecover.value && adoption?.adoptionId
    ? { operation: 'adoption' as const, grant: reference.value.data, request: { action: 'recover' as const, adoptionId: adoption.adoptionId, recoveryId: crypto.randomUUID(), expectedRecoveryId: adoption.recoveryId } }
    : next.value
  if (!body) return
  const current = generation
  busy.value = true; confirm.value = false
  try {
    const raw = await $fetch<unknown>(endpoint(), { method: 'POST', body, retry: 0, timeout: 120000 })
    if (current !== generation) return
    const result = response(raw)
    if (body.operation === 'resume') {
      z.object({ resumed: z.literal(true) }).strict().parse(result)
      saved.value = null
    } else {
      const value = CustomerCmsAdoptionStatusSchema.parse(result)
      if (body.request.action !== 'start' && value.adoptionId !== body.request.adoptionId) throw new Error('Different adoption')
      if (body.request.action === 'recover' && value.recoveryId !== body.request.recoveryId) throw new Error('Different recovery')
      saved.value = { resumeRequired: false, adoption: value }
    }
  } catch { if (current === generation) { failed.value = true; saved.value = null } }
  finally { if (current === generation) busy.value = false }
  if (current === generation && !failed.value && body.operation === 'resume') await refresh()
}
watch(() => [props.grantId, props.revision], () => {
  generation++; saved.value = null; busy.value = false; failed.value = false; confirm.value = false
  void refresh()
}, { immediate: true, flush: 'sync' })
// Native sign-in can change in another tab. Discard visible authority and late
// replies whenever this document loses focus or is restored; require a fresh read.
function invalidateSessionView() {
  generation++; saved.value = null; busy.value = false; failed.value = false; confirm.value = false
}
function pageRestored(event: PageTransitionEvent) { if (event.persisted) invalidateSessionView() }
function visibilityChanged() { if (document.visibilityState === 'hidden') invalidateSessionView() }
onMounted(() => {
  window.addEventListener('blur', invalidateSessionView)
  window.addEventListener('pageshow', pageRestored)
  document.addEventListener('visibilitychange', visibilityChanged)
})
onBeforeUnmount(() => {
  invalidateSessionView()
  window.removeEventListener('blur', invalidateSessionView)
  window.removeEventListener('pageshow', pageRestored)
  document.removeEventListener('visibilitychange', visibilityChanged)
})
</script>

<template>
  <main class="min-h-svh bg-default px-4 py-8 text-default sm:px-8 sm:py-14">
    <div class="mx-auto max-w-2xl space-y-6">
      <UButton to="/studio/dashboard" label="Your website" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
      <header class="space-y-3">
        <p class="text-sm font-medium text-muted">Your saved website</p>
        <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">Finish connecting your content</h1>
        <p class="max-w-xl leading-7 text-muted">Continue with the website you already prepared. Each step keeps your saved progress. Publishing is a separate action.</p>
      </header>
      <UAlert v-if="!reference.success" title="This setup link is incomplete" description="Ask your account manager for the complete content setup link." color="warning" />
      <UAlert v-else-if="failed" title="Check your setup access" description="We could not confirm the last step. Sign in to your website account, then refresh. Your account manager can check whether this setup access is still available." color="warning" />
      <UCard v-if="reference.success">
        <div class="space-y-5" :aria-busy="busy">
          <div class="flex items-start gap-3">
            <UIcon :name="saved?.adoption?.phase === 'managed' ? 'i-lucide-circle-check' : 'i-lucide-folder-check'" class="mt-1 size-6 shrink-0 text-primary" />
            <div>
              <h2 class="text-lg font-semibold text-highlighted">{{ saved?.adoption?.phase === 'managed' ? 'Your content is connected' : 'Continue your saved setup' }}</h2>
              <p class="mt-1 text-sm leading-6 text-muted">{{ busy ? 'Checking your saved progress…' : saved?.resumeRequired ? 'Connect this sign-in before continuing the content setup.' : saved?.adoption?.phase === 'managed' ? 'Return to your website overview for the next available steps.' : !saved ? 'Refresh to check your current sign-in and saved progress.' : 'Use the next step below. Refresh checks progress without starting work.' }}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-3">
            <UButton v-if="next || canRecover" :label="label" :disabled="busy || failed" @click="confirm = true" />
            <UButton label="Refresh setup" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="busy" :disabled="busy" @click="refresh" />
            <UButton v-if="failed" to="/studio/signup" label="Sign in" color="neutral" variant="ghost" />
          </div>
        </div>
      </UCard>
      <UModal v-model:open="confirm" title="Continue your content setup?" description="This uses your current sign-in to continue the existing website. It does not publish your site or create another website.">
        <template #footer>
          <div class="flex w-full flex-wrap justify-end gap-3">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="confirm = false" />
            <UButton label="Continue this step" :disabled="busy || failed || (!next && !canRecover)" @click="proceed" />
          </div>
        </template>
      </UModal>
    </div>
  </main>
</template>
