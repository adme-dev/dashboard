<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const toast = useToast()

const listId = computed(() => String(route.query.list || ''))

useHead({ title: 'Subscribe · XeroFlow', meta: [{ name: 'robots', content: 'noindex' }] })

const email = ref('')
const name = ref('')
const submitting = ref(false)
const result = ref<{ needsConfirm: boolean, status: string, listName: string } | null>(null)

const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()))

async function submit() {
  if (!emailValid.value || !listId.value) return
  submitting.value = true
  try {
    result.value = await $fetch('/api/public/email/subscribe', {
      method: 'POST',
      body: { email: email.value.trim(), name: name.value.trim() || null, listId: listId.value }
    })
  } catch (e: unknown) {
    const statusMessage = (e as { data?: { statusMessage?: string } })?.data?.statusMessage
    const msg = statusMessage === 'list_not_found'
      ? 'That subscription list no longer exists.'
      : 'We couldn\'t sign you up just now. Please try again.'
    toast.add({ title: 'Subscription failed', description: msg, color: 'error' })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <EmailPublicShell eyebrow="Newsletter">
    <!-- missing list param -->
    <template v-if="!listId">
      <div class="flex flex-col items-center text-center">
        <UIcon name="i-lucide-mail-question" class="mb-4 size-9 text-white/30" />
        <h1 class="text-xl font-semibold tracking-tight">
          Nothing to subscribe to
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-white/50">
          This subscribe link is missing its list. Please use the link from the original page.
        </p>
      </div>
    </template>

    <!-- success -->
    <template v-else-if="result">
      <div class="flex flex-col items-center text-center">
        <div class="mb-4 flex size-11 items-center justify-center rounded-full bg-emerald-500/10">
          <UIcon
            :name="result.needsConfirm ? 'i-lucide-mail-check' : 'i-lucide-party-popper'"
            class="size-5 text-emerald-400"
          />
        </div>
        <h1 class="text-2xl font-semibold leading-tight tracking-tight">
          {{ result.needsConfirm ? 'Almost there' : 'You\'re subscribed' }}
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-white/55">
          <template v-if="result.needsConfirm">
            We've sent a confirmation email to <span class="text-white/80">{{ email }}</span>.
            Click the link inside to finish subscribing to
            <span class="text-white/80">{{ result.listName }}</span>.
          </template>
          <template v-else>
            You're now on <span class="text-white/80">{{ result.listName }}</span>.
            Watch your inbox — and you can opt out any time.
          </template>
        </p>
      </div>
    </template>

    <!-- form -->
    <template v-else>
      <h1 class="text-2xl font-semibold leading-tight tracking-tight">
        Subscribe
      </h1>
      <p class="mt-2 text-sm leading-relaxed text-white/55">
        Get our updates straight to your inbox. No noise — unsubscribe whenever you like.
      </p>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <UFormField label="Email address" :ui="{ label: 'text-white/70' }">
          <UInput
            v-model="email"
            type="email"
            size="lg"
            placeholder="you@company.com"
            autocomplete="email"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Name" hint="Optional" :ui="{ label: 'text-white/70', hint: 'text-white/30' }">
          <UInput
            v-model="name"
            size="lg"
            placeholder="Your name"
            autocomplete="name"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          block
          size="lg"
          color="neutral"
          class="bg-white font-medium text-[#0a0b0e] hover:bg-white/90"
          :loading="submitting"
          :disabled="!emailValid"
          label="Subscribe"
        />
      </form>

      <p class="mt-4 text-center text-[12px] leading-relaxed text-white/30">
        By subscribing you agree to receive emails from XeroFlow Agency.
      </p>
    </template>
  </EmailPublicShell>
</template>
