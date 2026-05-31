<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()

const s = computed(() => String(route.query.s || ''))
const l = computed(() => String(route.query.l || ''))
const t = computed(() => String(route.query.t || ''))

useHead({ title: 'Confirm subscription · XeroFlow', meta: [{ name: 'robots', content: 'noindex' }] })

const state = ref<'pending' | 'ok' | 'invalid'>('pending')

onMounted(async () => {
  if (!s.value || !l.value || !t.value) {
    state.value = 'invalid'
    return
  }
  try {
    await $fetch('/api/public/email/confirm', {
      method: 'POST',
      body: { s: s.value, l: l.value, t: t.value }
    })
    state.value = 'ok'
  } catch {
    state.value = 'invalid'
  }
})
</script>

<template>
  <EmailPublicShell eyebrow="Confirm subscription">
    <div class="flex flex-col items-center text-center">
      <template v-if="state === 'pending'">
        <UIcon name="i-lucide-loader-circle" class="mb-4 size-8 animate-spin text-white/40" />
        <h1 class="text-xl font-semibold tracking-tight">
          Confirming…
        </h1>
        <p class="mt-2 text-sm text-white/50">
          One moment while we finish setting you up.
        </p>
      </template>

      <template v-else-if="state === 'ok'">
        <div class="mb-4 flex size-11 items-center justify-center rounded-full bg-emerald-500/10">
          <UIcon name="i-lucide-check-circle" class="size-5 text-emerald-400" />
        </div>
        <h1 class="text-2xl font-semibold leading-tight tracking-tight">
          Subscription confirmed
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-white/55">
          You're all set — thanks for confirming. You can unsubscribe any time from the
          footer of our emails.
        </p>
      </template>

      <template v-else>
        <UIcon name="i-lucide-link-2-off" class="mb-4 size-9 text-white/30" />
        <h1 class="text-xl font-semibold tracking-tight">
          This link isn't valid
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-white/50">
          The confirmation link may have expired or already been used. Try subscribing
          again, or reach out and we'll help.
        </p>
      </template>
    </div>
  </EmailPublicShell>
</template>
