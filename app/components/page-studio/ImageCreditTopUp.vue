<script setup lang="ts">
interface Pack { id: string, version: string, credits: number, amountMinor: number, currency: string }
interface Receipt { intentId: string, pack: Pack, status: string, createdAt: string, compensatedCredits: number, disputeStatus: string | null }
const props = defineProps<{ siteId: string }>()
const emit = defineEmits<{ settled: [] }>()
const route = useRoute()
const endpoint = computed(() => `/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/images`)
const { data, error, pending, refresh } = await useFetch<{ available: boolean, canPurchase: boolean, mode: string, packs: Pack[], purchases?: Receipt[] }>(() => `${endpoint.value}/billing`)
const selected = ref<string>()
const busy = ref(false)
let mounted = true
onBeforeUnmount(() => {
  mounted = false
})
const notice = ref('')
const receipt = ref<Receipt | null>(null)
const saved = ref<{ intentId: string, packId: string, packVersion: string } | null>(null)
const receiptFailed = ref(false)
const returned = ref(typeof route.query.purchase === 'string' && route.query.site === props.siteId && /^[0-9a-f-]{36}$/i.test(route.query.purchase) ? route.query.purchase : null)
const cancelled = computed(() => returned.value && route.query.payment === 'cancelled')
const key = computed(() => `studio-image-purchase:${props.siteId}`)
const pack = computed(() => data.value?.packs.find(item => item.id === selected.value))
const options = computed(() => (data.value?.packs ?? []).map(item => ({ label: `${item.credits.toLocaleString()} credits · ${money(item)}`, value: item.id })))
function money(value: Pack) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: value.currency }).format(value.amountMinor / 100)
}
function remember() {
  try {
    sessionStorage.setItem(key.value, JSON.stringify(saved.value))
  } catch { /* In-memory intent still survives retries in this view. */ }
}
async function checkPayment(id = receipt.value?.intentId ?? saved.value?.intentId ?? returned.value, notify = true) {
  if (!id || busy.value) return
  busy.value = true
  receiptFailed.value = false
  try {
    const current = await $fetch<Receipt>(`${endpoint.value}/receipt`, { query: { intentId: id } })
    if (!mounted) return
    receipt.value = current
    if (receipt.value.status === 'confirmed') {
      notice.value = 'Payment confirmed. Your credit activity includes this purchase.'
      if (saved.value?.intentId === id) {
        saved.value = null
        try {
          sessionStorage.removeItem(key.value)
        } catch { /* Optional local recovery. */ }
      }
      if (notify) emit('settled')
    } else notice.value = 'Payment is not confirmed yet. Check again before starting another purchase.'
    await refresh()
  } catch {
    receipt.value = null
    receiptFailed.value = true
    notice.value = 'Payment status could not be checked. Refresh your access and try again.'
  } finally { busy.value = false }
}
async function checkout() {
  if (busy.value || !data.value?.available || !data.value.canPurchase || (!saved.value && !pack.value)) return
  busy.value = true
  receiptFailed.value = false
  if (!saved.value && pack.value) {
    saved.value = { intentId: crypto.randomUUID(), packId: pack.value.id, packVersion: pack.value.version }
    remember()
  }
  try {
    const result = await $fetch<{ intentId: string, status: string, checkoutUrl?: string }>(`${endpoint.value}/checkout`, { method: 'POST', body: saved.value })
    if (!mounted) return
    if (result.status === 'checkout' && result.checkoutUrl) {
      const url = new URL(result.checkoutUrl)
      if (url.origin !== 'https://checkout.stripe.com' || !url.pathname.startsWith('/c/pay/cs_test_') || url.username || url.password) throw new Error('Invalid checkout destination')
      await navigateTo(url.href, { external: true })
    } else {
      notice.value = result.status === 'expired'
        ? 'This checkout can no longer be resumed. Check its payment status before starting another purchase.'
        : 'Check payment status to see whether these credits have arrived.'
    }
  } catch {
    notice.value = 'Checkout could not be confirmed. Retry this same purchase or check its payment status.'
  } finally { busy.value = false }
}
function startAnother() {
  // Explicit action only, after the saved one-hour provider expiry. Never inferred
  // from a redirect or a network error; a delayed payment can still settle.
  if (!receipt.value || (saved.value && saved.value.intentId !== receipt.value.intentId) || (receipt.value.status !== 'confirmed' && Date.now() - new Date(receipt.value.createdAt).getTime() < 3_600_000)) return
  saved.value = null
  receipt.value = null
  returned.value = null
  notice.value = ''
  try {
    sessionStorage.removeItem(key.value)
  } catch { /* Optional local recovery. */ }
}
const mayStartAnother = computed(() => receipt.value && (!saved.value || saved.value.intentId === receipt.value.intentId) && (receipt.value.status === 'confirmed' || Date.now() - new Date(receipt.value.createdAt).getTime() >= 3_600_000))
onMounted(() => {
  try {
    const value = JSON.parse(sessionStorage.getItem(key.value) ?? 'null')
    if (value && /^[0-9a-f-]{36}$/i.test(value.intentId) && typeof value.packId === 'string' && value.packId.length <= 80 && typeof value.packVersion === 'string' && value.packVersion.length <= 80) saved.value = value
  } catch { /* Storage is optional. */ }
  if (returned.value || saved.value) void checkPayment(returned.value ?? saved.value?.intentId, false)
})
</script>

<template>
  <section class="@container space-y-4 border-t border-default pt-6" aria-label="Add image credits" :aria-busy="busy || pending">
    <div class="flex flex-wrap items-center gap-3">
      <h2 class="text-lg font-semibold text-highlighted">
        Add image credits
      </h2>
      <UBadge
        v-if="data?.available"
        label="Test payments only"
        color="warning"
        variant="subtle"
      />
    </div>
    <UAlert
      v-if="error"
      title="Billing could not be loaded"
      description="Refresh to check your current billing access."
      color="error"
    />
    <USkeleton v-else-if="pending" class="h-24 w-full" />
    <template v-else-if="data">
      <UAlert
        v-if="!data.available"
        title="Top-ups are not available yet"
        description="Your existing credits and saved images remain available. Contact your website team to arrange more credits."
        color="neutral"
      />
      <p v-else class="max-w-xl text-sm leading-6 text-muted">
        Choose a credit pack, then continue to secure test checkout. No real payment is collected in this preview.
      </p>
      <UAlert
        v-if="cancelled && !notice"
        title="Checkout was closed"
        description="Returning here does not confirm a payment. Check its status or resume the same purchase."
        color="neutral"
      />
      <UAlert v-if="notice" :title="notice" :color="receiptFailed ? 'error' : 'info'" />
      <p v-if="receipt?.compensatedCredits" class="text-sm text-muted">
        {{ receipt.compensatedCredits }} credits from this purchase have been held or reversed. See credit activity for adjustments.
      </p>
      <div v-if="data.available" class="grid grid-cols-1 gap-4 max-w-md">
        <UFormField v-if="!saved && !returned" label="Credit pack">
          <USelect
            v-model="selected"
            :items="options"
            placeholder="Choose a credit pack"
            aria-label="Credit pack"
            class="w-full"
          />
        </UFormField>
        <p v-if="pack && !saved" class="text-sm text-highlighted">
          {{ money(pack) }} for {{ pack.credits.toLocaleString() }} image credits.
        </p>
        <UButton
          v-if="saved || (!returned && !receipt)"
          :label="saved ? 'Resume test checkout' : 'Continue to test checkout'"
          :disabled="!saved && !pack"
          :loading="busy"
          class="justify-center"
          @click="checkout"
        />
      </div>
      <div v-if="saved || returned || receipt" class="flex flex-wrap gap-2">
        <UButton
          label="Check payment status"
          color="neutral"
          variant="outline"
          :loading="busy"
          @click="checkPayment()"
        />
        <UButton
          v-if="mayStartAnother"
          label="Start another purchase"
          color="neutral"
          variant="ghost"
          :disabled="busy"
          @click="startAnother"
        />
      </div>
      <p v-if="receipt && receipt.status !== 'confirmed' && mayStartAnother" class="max-w-xl text-sm text-muted">
        The checkout window has ended. An earlier payment may still be confirmed later; check your payment records before buying again.
      </p>
      <div v-if="data.purchases?.length" class="space-y-3 pt-3">
        <h3 class="font-medium text-highlighted">
          Recent purchases
        </h3>
        <ul class="divide-y divide-default">
          <li v-for="item in data.purchases" :key="item.intentId" class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p class="text-sm text-highlighted">
                {{ item.pack.credits.toLocaleString() }} credits · {{ money(item.pack) }}
              </p>
              <p class="text-xs text-muted">
                {{ new Date(item.createdAt).toLocaleDateString('en-AU') }} · {{ item.status === 'confirmed' ? 'Payment confirmed' : 'Awaiting confirmation' }}
              </p>
            </div>
            <UButton
              label="View payment"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="busy"
              @click="checkPayment(item.intentId)"
            />
          </li>
        </ul>
      </div>
    </template>
    <UButton
      label="Refresh billing"
      color="neutral"
      variant="ghost"
      :loading="pending"
      @click="refresh()"
    />
  </section>
</template>
