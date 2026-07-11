<template>
  <div class="min-h-screen bg-gray-50 p-8">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">Task Comments Test</h1>
      
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="font-semibold">Task: SEO Framework Updates</h2>
            <UBadge color="primary">Testing</UBadge>
          </div>
        </template>

        <TaskActivityFeed task-id="test-task-123" />
      </UCard>

      <!-- API Test Section -->
      <UCard class="mt-6">
        <template #header>
          <h3 class="font-semibold">API Test</h3>
        </template>
        
        <div class="space-y-4">
          <UButton @click="testGetComments" :loading="loading">
            Test GET /api/tasks/:id/comments
          </UButton>
          
          <UButton @click="testCreateComment" :loading="loading">
            Test POST Comment
          </UButton>
          
          <UButton @click="testSearchUsers" :loading="loading">
            Test GET /api/users/search?q=test
          </UButton>

          <pre v-if="result" class="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-60">{{ JSON.stringify(result, null, 2) }}</pre>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const loading = ref(false)
const result = ref<any>(null)

const testGetComments = async () => {
  loading.value = true
  try {
    result.value = await $fetch('/api/tasks/test-task-123/comments')
  } catch (error: any) {
    result.value = { error: error.message }
  } finally {
    loading.value = false
  }
}

const testCreateComment = async () => {
  loading.value = true
  try {
    result.value = await $fetch('/api/tasks/test-task-123/comments', {
      method: 'POST',
      body: {
        content: `Test comment with @Paul Giurin mention at ${new Date().toLocaleTimeString()}`,
        isInternal: false
      }
    })
  } catch (error: any) {
    result.value = { error: error.message }
  } finally {
    loading.value = false
  }
}

const testSearchUsers = async () => {
  loading.value = true
  try {
    result.value = await $fetch('/api/users/search?q=clara')
  } catch (error: any) {
    result.value = { error: error.message }
  } finally {
    loading.value = false
  }
}
</script>
