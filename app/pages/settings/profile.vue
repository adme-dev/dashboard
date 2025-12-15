<script setup lang="ts">
const { user, fetchUser } = useAuth()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const uploadingAvatar = ref(false)
const removingAvatar = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const state = reactive({
  name: '',
  email: '',
  timezone: '',
  locale: 'en'
})

const timezones = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
  { value: 'Asia/Shanghai', label: 'China Standard Time' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time' },
  { value: 'Pacific/Auckland', label: 'New Zealand' }
]

const locales = [
  { value: 'en', label: 'English' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' }
]

// Load user data on mount
onMounted(async () => {
  if (user.value) {
    state.name = user.value.name || ''
    state.email = user.value.email || ''
    state.timezone = user.value.timezone || 'UTC'
    state.locale = user.value.locale || 'en'
  }
  loading.value = false
})

// Watch for user changes
watch(user, (newUser) => {
  if (newUser) {
    state.name = newUser.name || ''
    state.email = newUser.email || ''
    state.timezone = newUser.timezone || 'UTC'
    state.locale = newUser.locale || 'en'
  }
}, { immediate: true })

async function saveProfile() {
  if (!state.name.trim()) {
    toast.add({
      title: 'Name is required',
      color: 'error',
      duration: 3000
    })
    return
  }

  saving.value = true
  try {
    await $fetch('/api/auth/profile', {
      method: 'PUT',
      body: {
        name: state.name,
        timezone: state.timezone,
        locale: state.locale
      }
    })

    // Refresh user data
    await fetchUser()

    toast.add({
      title: 'Profile updated',
      color: 'success',
      duration: 2000
    })
  } catch (error) {
    toast.add({
      title: 'Failed to update profile',
      color: 'error',
      duration: 3000
    })
  } finally {
    saving.value = false
  }
}

async function resendVerification() {
  try {
    await $fetch('/api/auth/resend-verification', { method: 'POST' })
    toast.add({
      title: 'Verification email sent',
      description: 'Please check your inbox.',
      color: 'success',
      duration: 3000
    })
  } catch (error) {
    toast.add({
      title: 'Failed to send verification email',
      color: 'error',
      duration: 3000
    })
  }
}

function triggerFileUpload() {
  fileInput.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    toast.add({
      title: 'Invalid file type',
      description: 'Please upload a JPEG, PNG, GIF, or WebP image.',
      color: 'error',
      duration: 3000
    })
    return
  }

  // Validate file size (2MB)
  if (file.size > 2 * 1024 * 1024) {
    toast.add({
      title: 'File too large',
      description: 'Maximum file size is 2MB.',
      color: 'error',
      duration: 3000
    })
    return
  }

  uploadingAvatar.value = true
  try {
    const formData = new FormData()
    formData.append('avatar', file)

    await $fetch('/api/auth/avatar', {
      method: 'POST',
      body: formData
    })

    await fetchUser()

    toast.add({
      title: 'Avatar updated',
      color: 'success',
      duration: 2000
    })
  } catch (error) {
    toast.add({
      title: 'Failed to upload avatar',
      color: 'error',
      duration: 3000
    })
  } finally {
    uploadingAvatar.value = false
    // Reset the input
    if (input) input.value = ''
  }
}

async function removeAvatar() {
  removingAvatar.value = true
  try {
    await $fetch('/api/auth/avatar', { method: 'DELETE' })
    await fetchUser()

    toast.add({
      title: 'Avatar removed',
      color: 'success',
      duration: 2000
    })
  } catch (error) {
    toast.add({
      title: 'Failed to remove avatar',
      color: 'error',
      duration: 3000
    })
  } finally {
    removingAvatar.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <UPageCard
      title="Profile Settings"
      description="Update your personal information."
      variant="naked"
    />

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-gray-400" />
    </div>

    <!-- Avatar Section -->
    <UPageCard v-if="!loading" variant="subtle" title="Profile Photo" description="Upload a photo to personalize your account.">
      <div class="flex items-center gap-6">
        <!-- Hidden file input -->
        <input
          ref="fileInput"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          class="hidden"
          @change="handleFileSelect"
        />

        <!-- Avatar preview -->
        <div class="relative">
          <UAvatar
            :src="user?.avatarUrl"
            :alt="user?.name || 'User'"
            size="xl"
            class="ring-2 ring-offset-2 ring-default"
          />
          <div
            v-if="uploadingAvatar"
            class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full"
          >
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-white" />
          </div>
        </div>

        <!-- Upload/Remove buttons -->
        <div class="flex flex-col gap-2">
          <UButton
            icon="i-lucide-upload"
            variant="outline"
            size="sm"
            :loading="uploadingAvatar"
            :disabled="uploadingAvatar || removingAvatar"
            @click="triggerFileUpload"
          >
            Upload Photo
          </UButton>
          <UButton
            v-if="user?.avatarUrl"
            icon="i-lucide-trash-2"
            variant="ghost"
            color="red"
            size="sm"
            :loading="removingAvatar"
            :disabled="uploadingAvatar || removingAvatar"
            @click="removeAvatar"
          >
            Remove
          </UButton>
          <p class="text-xs text-muted mt-1">
            JPEG, PNG, GIF or WebP. Max 2MB.
          </p>
        </div>
      </div>
    </UPageCard>

    <UPageCard v-if="!loading" variant="subtle">
      <form @submit.prevent="saveProfile" class="space-y-6">
        <!-- Name -->
        <UFormField name="name" label="Full Name" required>
          <UInput
            v-model="state.name"
            placeholder="Your name"
            :disabled="saving"
            class="max-w-md"
          />
        </UFormField>

        <!-- Email (read-only) -->
        <UFormField name="email" label="Email Address" description="Contact support to change your email address.">
          <UInput
            v-model="state.email"
            type="email"
            disabled
            class="max-w-md"
          />
        </UFormField>

        <!-- Timezone -->
        <UFormField name="timezone" label="Timezone" description="Used for displaying dates and scheduling.">
          <USelectMenu
            v-model="state.timezone"
            :items="timezones"
            value-key="value"
            :disabled="saving"
            class="max-w-md"
            placeholder="Select timezone"
          />
        </UFormField>

        <!-- Locale -->
        <UFormField name="locale" label="Language" description="Your preferred language for the interface.">
          <USelectMenu
            v-model="state.locale"
            :items="locales"
            value-key="value"
            :disabled="saving"
            class="max-w-md"
            placeholder="Select language"
          />
        </UFormField>

        <!-- Submit -->
        <div class="flex justify-end pt-4 border-t border-default">
          <UButton
            type="submit"
            :loading="saving"
            :disabled="saving"
          >
            Save Changes
          </UButton>
        </div>
      </form>
    </UPageCard>

    <!-- Email Verification Status -->
    <UPageCard
      title="Email Verification"
      :description="user?.emailVerifiedAt ? 'Your email has been verified.' : 'Please verify your email address.'"
      variant="subtle"
    >
      <div class="flex items-center gap-3">
        <UIcon
          :name="user?.emailVerifiedAt ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'"
          :class="user?.emailVerifiedAt ? 'text-success' : 'text-warning'"
          class="size-5"
        />
        <span v-if="user?.emailVerifiedAt" class="text-sm text-muted">
          Verified on {{ new Date(user.emailVerifiedAt).toLocaleDateString() }}
        </span>
        <UButton
          v-else
          variant="outline"
          size="sm"
          @click="resendVerification"
        >
          Resend Verification Email
        </UButton>
      </div>
    </UPageCard>
  </div>
</template>
