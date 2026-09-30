<script setup lang="ts">
import { normalizePortalRedirect } from '~~/shared/portalRedirect'

definePageMeta({ layout: false })
useHead({ title: 'Page Studio — Your website workspace' })
const route = useRoute()
const { requestMagicLink, fetchUser } = usePortalAuth()
const email = ref('')
const sentTo = ref('')
const loading = ref(false)
const error = ref('')
const destination = computed(() => {
  const value = normalizePortalRedirect(route.query.redirect)
  return value.startsWith('/studio/sites') ? value : '/studio/sites'
})
onMounted(async () => {
  if (await fetchUser()) await navigateTo(destination.value)
})
async function signIn() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    await requestMagicLink(email.value.trim(), destination.value)
    sentTo.value = email.value.trim()
  } catch {
    error.value = 'We could not send a sign-in link. Try again shortly or contact your website team.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-default text-default">
    <header class="border-b border-default">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <NuxtLink to="/studio" class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-panels-top-left" class="size-5 text-primary" />Page Studio
        </NuxtLink>
        <UButton
          to="/support"
          label="Get help"
          color="neutral"
          variant="ghost"
        />
      </div>
    </header>
    <main class="mx-auto grid max-w-6xl items-start gap-12 px-6 py-12 md:grid-cols-2 md:gap-20 md:py-24">
      <section class="max-w-lg">
        <h1 class="text-4xl font-semibold tracking-tight text-highlighted sm:text-5xl">
          Your website.<br>Your next idea.
        </h1>
        <p class="mt-6 max-w-md text-lg leading-8 text-muted">
          Edit your pages, keep your content current and build reusable sections in one website workspace.
        </p>
        <ul class="mt-10 space-y-5 text-sm leading-6">
          <li class="flex gap-3">
            <UIcon name="i-lucide-mouse-pointer-2" class="mt-0.5 size-5 shrink-0 text-primary" /><span><strong class="font-medium text-highlighted">Make it yours.</strong> Open your visual builder and preview changes as you work.</span>
          </li>
          <li class="flex gap-3">
            <UIcon name="i-lucide-layout-list" class="mt-0.5 size-5 shrink-0 text-primary" /><span><strong class="font-medium text-highlighted">Keep content fresh.</strong> Update your website’s collections in the CMS.</span>
          </li>
          <li class="flex gap-3">
            <UIcon name="i-lucide-history" class="mt-0.5 size-5 shrink-0 text-primary" /><span><strong class="font-medium text-highlighted">Keep your progress.</strong> Save named drafts while your team handles review and publishing.</span>
          </li>
        </ul>
      </section>
      <UCard class="w-full max-w-md md:justify-self-end">
        <div class="space-y-6 p-1 sm:p-3">
          <div>
            <h2 class="text-xl font-semibold text-highlighted">
              {{ sentTo ? 'Check your inbox' : 'Sign in to Page Studio' }}
            </h2>
            <p class="mt-2 text-sm leading-6 text-muted">
              {{ sentTo ? `If ${sentTo} has an eligible account, a secure sign-in link is on its way.` : 'Use the email address your website team invited. We’ll send you a secure sign-in link.' }}
            </p>
          </div>
          <div v-if="sentTo" class="space-y-4" role="status">
            <UAlert
              color="success"
              title="Link requested"
              description="Your link expires in 15 minutes. Check your spam folder if it does not arrive."
              icon="i-lucide-mail-check"
            />
            <UButton
              label="Use another email"
              block
              color="neutral"
              variant="outline"
              @click="() => { sentTo = '' }"
            />
          </div>
          <form v-else class="space-y-4" @submit.prevent="signIn">
            <UAlert
              v-if="error"
              color="error"
              title="Sign-in link unavailable"
              :description="error"
            />
            <UFormField label="Email address" required>
              <UInput
                v-model="email"
                type="email"
                autocomplete="email"
                placeholder="you@company.com"
                size="lg"
                class="w-full"
                required
                :disabled="loading"
              />
            </UFormField>
            <UButton
              type="submit"
              label="Email me a sign-in link"
              block
              size="lg"
              :loading="loading"
              :disabled="!email.trim()"
            />
          </form>
          <p class="border-t border-default pt-5 text-sm leading-6 text-muted">
            New here? Ask your website team to invite you and assign your website.
          </p>
        </div>
      </UCard>
    </main>
  </div>
</template>
