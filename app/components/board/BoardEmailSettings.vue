<script setup lang="ts">
const props = defineProps<{
  boardId: string
}>()

const emailData = ref<{ email: string; token: string; enabled: boolean } | null>(null)
const loading = ref(false)
const copied = ref(false)
const toast = useToast()

async function fetchEmail() {
  loading.value = true
  try {
    emailData.value = await $fetch(`/api/agency/boards/${props.boardId}/email`)
  } catch {
    emailData.value = null
  } finally {
    loading.value = false
  }
}

async function regenerate() {
  try {
    emailData.value = await $fetch(`/api/agency/boards/${props.boardId}/email/regenerate`, { method: 'POST' })
    toast.add({ title: 'Email address regenerated', color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Failed to regenerate', color: 'error' })
  }
}

async function disable() {
  try {
    await $fetch(`/api/agency/boards/${props.boardId}/email`, { method: 'DELETE' })
    emailData.value = null
    toast.add({ title: 'Email-to-board disabled', color: 'success', icon: 'i-lucide-check' })
  } catch {
    toast.add({ title: 'Failed to disable', color: 'error' })
  }
}

function copyEmail() {
  if (emailData.value) {
    navigator.clipboard.writeText(emailData.value.email)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

onMounted(fetchEmail)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-mail" class="w-5 h-5 text-primary" />
      <h3 class="text-sm font-semibold">Email to Board</h3>
    </div>

    <p class="text-sm text-muted">
      Forward emails to this address to automatically create items on this board.
    </p>

    <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
      Loading...
    </div>

    <template v-else-if="emailData">
      <div class="flex items-center gap-2">
        <code class="flex-1 px-3 py-2 bg-elevated rounded text-sm font-mono truncate">
          {{ emailData.email }}
        </code>
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="copyEmail"
        />
      </div>

      <div class="flex items-center gap-2">
        <UButton
          label="Regenerate Address"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          size="sm"
          @click="regenerate"
        />
        <UButton
          label="Disable"
          icon="i-lucide-x"
          color="error"
          variant="ghost"
          size="sm"
          @click="disable"
        />
      </div>
    </template>

    <template v-else>
      <UButton
        label="Enable Email to Board"
        icon="i-lucide-mail-plus"
        color="primary"
        size="sm"
        @click="fetchEmail"
      />
    </template>

    <p class="text-xs text-dimmed">
      Email subject becomes the item title. Email body becomes the description.
      Sender email is stored in metadata.
    </p>
  </div>
</template>
