<script setup lang="ts">
definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

const route = useRoute()
const { resetPassword } = useAuth()

const token = computed(() => route.query.token as string | undefined)

const form = ref({
  password: '',
  confirmPassword: ''
})

const loading = ref(false)
const error = ref('')
const success = ref(false)

// Redirect if no token
if (!token.value) {
  navigateTo('/auth/forgot-password')
}

async function handleSubmit() {
  error.value = ''

  if (!form.value.password) {
    error.value = 'Please enter a new password'
    return
  }

  if (form.value.password.length < 8) {
    error.value = 'Password must be at least 8 characters'
    return
  }

  if (form.value.password !== form.value.confirmPassword) {
    error.value = 'Passwords do not match'
    return
  }

  loading.value = true
  const result = await resetPassword(token.value!, form.value.password)
  loading.value = false

  if (result.success) {
    success.value = true
  } else {
    error.value = result.error || 'Failed to reset password'
  }
}
</script>

<template>
  <div>
    <!-- Logo -->
    <div class="text-center mb-8">
      <UIcon name="i-lucide-lock-keyhole" class="h-12 w-12 text-primary mx-auto mb-4" />
      <h1 class="text-2xl font-bold text-highlighted">Reset Password</h1>
      <p class="text-muted mt-2">
        Choose a new password for your account
      </p>
    </div>

    <!-- Success State -->
    <template v-if="success">
      <UCard>
        <div class="text-center py-4">
          <div class="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <UIcon name="i-lucide-check-circle" class="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 class="text-lg font-semibold text-highlighted mb-2">Password Reset!</h2>
          <p class="text-muted text-sm mb-4">
            Your password has been successfully reset.<br>
            You can now log in with your new password.
          </p>
          <UButton to="/auth/login" color="primary" block>
            Continue to Login
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

          <!-- New Password -->
          <UFormField label="New Password" name="password" hint="At least 8 characters">
            <UInput
              v-model="form.password"
              type="password"
              placeholder="Enter new password"
              icon="i-lucide-lock"
              size="lg"
              autofocus
            />
          </UFormField>

          <!-- Confirm Password -->
          <UFormField label="Confirm Password" name="confirmPassword">
            <UInput
              v-model="form.confirmPassword"
              type="password"
              placeholder="Confirm new password"
              icon="i-lucide-lock"
              size="lg"
            />
          </UFormField>

          <!-- Password requirements -->
          <div class="text-xs text-muted space-y-1">
            <p class="font-medium">Password requirements:</p>
            <ul class="list-disc list-inside space-y-0.5">
              <li :class="form.password.length >= 8 ? 'text-emerald-600' : ''">
                At least 8 characters
              </li>
            </ul>
          </div>

          <!-- Submit -->
          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            :loading="loading"
          >
            Reset Password
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
