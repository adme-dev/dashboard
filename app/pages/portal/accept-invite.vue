<script setup lang="ts">
definePageMeta({ layout: false })

const route = useRoute()
const { login } = usePortalAuth()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>

const token = computed(() => route.query.token as string)
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)
const success = ref(false)

// Store email from invite validation for auto-login
const inviteEmail = ref('')

function errorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    if ('data' in error) {
      return (error as { data?: { statusMessage?: string } }).data?.statusMessage
    }
    if ('message' in error) {
      return (error as { message?: string }).message
    }
  }
  return undefined
}

async function handleAccept() {
  error.value = ''

  if (!token.value) {
    error.value = 'Invalid invitation link'
    return
  }

  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }

  if (password.value !== confirmPassword.value) {
    error.value = 'Passwords do not match'
    return
  }

  loading.value = true
  try {
    const data = await apiFetch<{ success: boolean, user: { email: string }, sessionToken: string }>('/api/agency/client-portal/accept-invite', {
      method: 'POST',
      body: { token: token.value, password: password.value }
    })

    inviteEmail.value = data.user.email
    success.value = true

    // Auto-login with the credentials
    try {
      await login(data.user.email, password.value)
      toast.add({ title: 'Welcome!', description: 'Your account has been activated.', color: 'success' })
      await navigateTo('/portal')
    } catch {
      // If auto-login fails, redirect to login page
      toast.add({ title: 'Account activated', description: 'Please sign in with your new password.', color: 'success' })
      await navigateTo('/portal/login')
    }
  } catch (caught: unknown) {
    error.value = errorMessage(caught) || 'Failed to accept invitation'
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
          <UIcon name="i-lucide-mail-open" class="text-primary w-6 h-6" />
        </div>
        <h1 class="text-2xl font-bold">
          Accept Invitation
        </h1>
        <p class="text-muted mt-1">
          Set your password to activate your account
        </p>
      </div>

      <div v-if="!token" class="text-center">
        <UAlert
          title="Invalid invitation link"
          description="This link is missing a token. Please check your email for the correct link."
          color="error"
          icon="i-lucide-alert-circle"
        />
      </div>

      <form v-else class="space-y-4" @submit.prevent="handleAccept">
        <UAlert
          v-if="error"
          :title="error"
          color="error"
          icon="i-lucide-alert-circle"
        />

        <div class="space-y-2">
          <label class="text-sm font-medium">Password</label>
          <UInput
            v-model="password"
            type="password"
            placeholder="Min 8 characters"
            size="lg"
            autofocus
          />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-medium">Confirm Password</label>
          <UInput
            v-model="confirmPassword"
            type="password"
            placeholder="Confirm your password"
            size="lg"
          />
        </div>

        <UButton
          type="submit"
          :loading="loading"
          block
          size="lg"
        >
          Activate Account
        </UButton>

        <p class="text-center text-sm text-muted">
          Already have an account?
          <NuxtLink to="/portal/login" class="text-primary hover:underline">
            Sign in
          </NuxtLink>
        </p>
      </form>
    </div>
  </div>
</template>
