<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <UCard class="w-full max-w-md text-center p-8">
      <UIcon name="i-lucide-user-check" class="w-16 h-16 text-primary mx-auto mb-4" />
      <h1 class="text-2xl font-bold mb-2">Development Login</h1>
      <p class="text-gray-500 mb-6">
        This will automatically log you in as an admin user for testing purposes.
      </p>
      
      <UButton
        color="primary"
        size="lg"
        block
        :loading="loading"
        @click="devLogin"
      >
        Auto Login & Continue
      </UButton>
      
      <div class="mt-4 space-y-2">
        <UButton
          variant="ghost"
          size="sm"
          to="/auth/login"
        >
          Regular Login
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const loading = ref(false)
const toast = useToast()

async function devLogin() {
  loading.value = true
  try {
    const result = await $fetch('/api/auth/dev-login')
    
    toast.add({
      title: 'Logged in',
      description: result.message,
      color: 'success'
    })
    
    // Redirect to Monday.com integration
    await navigateTo('/settings/integrations/monday')
  } catch (error: any) {
    toast.add({
      title: 'Login failed',
      description: error.data?.message || 'Could not auto-login',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

// Auto-login on page load after a short delay
onMounted(() => {
  setTimeout(() => {
    devLogin()
  }, 500)
})
</script>
