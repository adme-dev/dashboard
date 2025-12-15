<script setup lang="ts">
definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

const { forgotPassword } = useAuth()

const email = ref('')
const loading = ref(false)
const error = ref('')
const success = ref(false)

async function handleSubmit() {
  error.value = ''

  if (!email.value) {
    error.value = 'Please enter your email address'
    return
  }

  loading.value = true
  const result = await forgotPassword(email.value)
  loading.value = false

  if (result.success) {
    success.value = true
  } else {
    error.value = result.error || 'Failed to send reset email'
  }
}
</script>

<template>
  <div>
    <!-- Logo -->
    <div class="text-center mb-8">
      <UIcon name="i-lucide-key" class="h-12 w-12 text-primary mx-auto mb-4" />
      <h1 class="text-2xl font-bold text-highlighted">Forgot Password?</h1>
      <p class="text-muted mt-2">
        No worries, we'll send you reset instructions
      </p>
    </div>

    <!-- Success State -->
    <template v-if="success">
      <UCard>
        <div class="text-center py-4">
          <div class="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <UIcon name="i-lucide-mail-check" class="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 class="text-lg font-semibold text-highlighted mb-2">Check your email</h2>
          <p class="text-muted text-sm mb-4">
            We've sent a password reset link to<br>
            <span class="font-medium text-highlighted">{{ email }}</span>
          </p>
          <p class="text-xs text-muted mb-4">
            Didn't receive the email? Check your spam folder or
            <button
              @click="success = false"
              class="text-primary hover:underline"
            >
              try again
            </button>
          </p>
          <UButton to="/auth/login" color="primary" variant="soft" block>
            Back to Login
          </UButton>
        </div>
      </UCard>
    </template>

    <!-- Form State -->
    <template v-else>
      <UCard>
        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Error Alert -->
          <UAlert
            v-if="error"
            color="error"
            :title="error"
            icon="i-lucide-alert-circle"
            :close-button="{ onClick: () => error = '' }"
          />

          <!-- Email -->
          <UFormField label="Email" name="email">
            <UInput
              v-model="email"
              type="email"
              placeholder="you@example.com"
              icon="i-lucide-mail"
              size="lg"
              autofocus
            />
          </UFormField>

          <!-- Submit -->
          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            :loading="loading"
          >
            Send Reset Link
          </UButton>
        </form>
      </UCard>

      <!-- Back to Login -->
      <p class="text-center mt-6">
        <NuxtLink
          to="/auth/login"
          class="text-sm text-muted hover:text-highlighted inline-flex items-center gap-1"
        >
          <UIcon name="i-lucide-arrow-left" class="h-4 w-4" />
          Back to login
        </NuxtLink>
      </p>
    </template>
  </div>
</template>
