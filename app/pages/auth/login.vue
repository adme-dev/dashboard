<script setup lang="ts">
definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

const { login, loading } = useAuth()

const form = ref({
  email: '',
  password: '',
  rememberMe: false
})

const error = ref('')

async function handleSubmit() {
  error.value = ''

  if (!form.value.email || !form.value.password) {
    error.value = 'Please enter your email and password'
    return
  }

  const result = await login(form.value)

  if (result.success) {
    navigateTo('/')
  } else {
    error.value = result.error || 'Login failed'
  }
}
</script>

<template>
  <div>
    <!-- Logo -->
    <div class="text-center mb-8">
      <UIcon name="i-lucide-layout-dashboard" class="h-12 w-12 text-primary mx-auto mb-4" />
      <h1 class="text-2xl font-bold text-highlighted">Welcome back</h1>
      <p class="text-muted mt-2">Sign in to your account to continue</p>
    </div>

    <!-- Login Form -->
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
            v-model="form.email"
            type="email"
            placeholder="you@example.com"
            icon="i-lucide-mail"
            size="lg"
            autofocus
          />
        </UFormField>

        <!-- Password -->
        <UFormField label="Password" name="password">
          <UInput
            v-model="form.password"
            type="password"
            placeholder="Enter your password"
            icon="i-lucide-lock"
            size="lg"
          />
        </UFormField>

        <!-- Remember Me & Forgot Password -->
        <div class="flex items-center justify-between">
          <UCheckbox v-model="form.rememberMe" label="Remember me" />
          <NuxtLink
            to="/auth/forgot-password"
            class="text-sm text-primary hover:underline"
          >
            Forgot password?
          </NuxtLink>
        </div>

        <!-- Submit -->
        <UButton
          type="submit"
          color="primary"
          size="lg"
          block
          :loading="loading"
        >
          Sign in
        </UButton>
      </form>
    </UCard>

    <!-- Sign Up Link -->
    <p class="text-center mt-6 text-sm text-muted">
      Don't have an account?
      <NuxtLink to="/auth/register" class="text-primary hover:underline font-medium">
        Contact your administrator
      </NuxtLink>
    </p>
  </div>
</template>
