<script setup lang="ts">
definePageMeta({ layout: false })

const { login, isAuthenticated } = usePortalAuth()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

// Redirect if already authenticated
watchEffect(() => {
  if (isAuthenticated.value) {
    const redirect = route.query.redirect as string
    navigateTo(redirect ? decodeURIComponent(redirect) : '/portal')
  }
})

async function handleLogin() {
  error.value = ''
  if (!email.value || !password.value) {
    error.value = 'Please enter email and password'
    return
  }

  loading.value = true
  try {
    await login(email.value, password.value)
    const redirect = route.query.redirect as string
    await navigateTo(redirect ? decodeURIComponent(redirect) : '/portal')
  } catch (e: any) {
    error.value = e.data?.statusMessage || e.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-default px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <UIcon name="i-lucide-building-2" class="text-primary w-6 h-6" />
        </div>
        <h1 class="text-2xl font-bold">Client Portal</h1>
        <p class="text-muted mt-1">Sign in to your account</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-4">
        <UAlert
          v-if="error"
          :title="error"
          color="error"
          icon="i-lucide-alert-circle"
          :close-button="{ onClick: () => error = '' }"
        />

        <div class="space-y-2">
          <label class="text-sm font-medium">Email</label>
          <UInput
            v-model="email"
            type="email"
            placeholder="you@company.com"
            size="lg"
            autofocus
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Password</label>
          <UInput
            v-model="password"
            type="password"
            placeholder="Enter your password"
            size="lg"
          />
        </div>

        <UButton
          type="submit"
          :loading="loading"
          block
          size="lg"
        >
          Sign in
        </UButton>
      </form>
    </div>
  </div>
</template>
