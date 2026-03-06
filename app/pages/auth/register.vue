<script setup lang="ts">
definePageMeta({
  layout: 'auth',
  middleware: 'guest'
})

const route = useRoute()
const { register, loading } = useAuth()

// Get invite token from URL
const inviteToken = computed(() => route.query.token as string | undefined)

// Fetch invitation details if token provided
const { data: invitation, pending: loadingInvitation } = await useLazyFetch(
  () => inviteToken.value ? `/api/auth/invitations/${inviteToken.value}` as const : '/api/auth/invitations' as const,
  { immediate: !!inviteToken.value }
)

const form = ref({
  name: '',
  email: '',
  password: '',
  confirmPassword: ''
})

const error = ref('')

// Pre-fill email from invitation
watch(invitation, (inv: any) => {
  if (inv?.email) {
    form.value.email = inv.email
  }
}, { immediate: true })

async function handleSubmit() {
  error.value = ''

  if (!form.value.name || !form.value.email || !form.value.password) {
    error.value = 'Please fill in all required fields'
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

  const result = await register({
    name: form.value.name,
    email: form.value.email,
    password: form.value.password,
    inviteToken: inviteToken.value
  })

  if (result.success) {
    navigateTo('/')
  } else {
    error.value = result.error || 'Registration failed'
  }
}
</script>

<template>
  <div>
    <!-- Logo -->
    <div class="text-center mb-8">
      <UIcon name="i-lucide-layout-dashboard" class="h-12 w-12 text-primary mx-auto mb-4" />
      <h1 class="text-2xl font-bold text-highlighted">
        {{ invitation ? 'Accept Invitation' : 'Create Account' }}
      </h1>
      <p class="text-muted mt-2">
        {{ invitation
          ? `You've been invited to join ${(invitation as any).invitedByName}'s team`
          : 'Set up your account to get started'
        }}
      </p>
    </div>

    <!-- Loading invitation -->
    <template v-if="inviteToken && loadingInvitation">
      <UCard>
        <div class="flex items-center justify-center py-8">
          <XfLoader />
        </div>
      </UCard>
    </template>

    <!-- Invalid/Expired token -->
    <template v-else-if="inviteToken && !invitation">
      <UCard>
        <div class="text-center py-8">
          <UIcon name="i-lucide-alert-circle" class="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 class="text-lg font-semibold text-highlighted mb-2">Invalid or Expired Invitation</h2>
          <p class="text-muted mb-4">
            This invitation link is no longer valid. Please contact your administrator for a new invitation.
          </p>
          <UButton to="/auth/login" color="primary" variant="soft">
            Go to Login
          </UButton>
        </div>
      </UCard>
    </template>

    <!-- Registration Form -->
    <template v-else>
      <UCard>
        <!-- Invitation badge -->
        <div v-if="invitation" class="mb-4 p-3 bg-primary/10 rounded-lg">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-mail-check" class="h-5 w-5 text-primary" />
            <div>
              <p class="text-sm font-medium text-highlighted">Invited as {{ (invitation as any).role }}</p>
              <p class="text-xs text-muted">{{ (invitation as any).email }}</p>
            </div>
          </div>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Error Alert -->
          <UAlert
            v-if="error"
            color="error"
            :title="error"
            icon="i-lucide-alert-circle"
            :close-button="{ onClick: () => error = '' }"
          />

          <!-- Name -->
          <UFormField label="Full Name" name="name" required>
            <UInput
              v-model="form.name"
              placeholder="John Doe"
              icon="i-lucide-user"
              size="lg"
              autofocus
            />
          </UFormField>

          <!-- Email -->
          <UFormField label="Email" name="email" required>
            <UInput
              v-model="form.email"
              type="email"
              placeholder="you@example.com"
              icon="i-lucide-mail"
              size="lg"
              :disabled="!!invitation"
            />
          </UFormField>

          <!-- Password -->
          <UFormField label="Password" name="password" required hint="At least 8 characters">
            <UInput
              v-model="form.password"
              type="password"
              placeholder="Create a password"
              icon="i-lucide-lock"
              size="lg"
            />
          </UFormField>

          <!-- Confirm Password -->
          <UFormField label="Confirm Password" name="confirmPassword" required>
            <UInput
              v-model="form.confirmPassword"
              type="password"
              placeholder="Confirm your password"
              icon="i-lucide-lock"
              size="lg"
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
            {{ invitation ? 'Accept Invitation' : 'Create Account' }}
          </UButton>
        </form>
      </UCard>

      <!-- Sign In Link -->
      <p class="text-center mt-6 text-sm text-muted">
        Already have an account?
        <NuxtLink to="/auth/login" class="text-primary hover:underline font-medium">
          Sign in
        </NuxtLink>
      </p>
    </template>
  </div>
</template>
