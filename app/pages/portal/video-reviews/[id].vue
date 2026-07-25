<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const { hasPermission } = usePortalAuth()
const toast = useToast()
const reviewId = route.params.id as string

const { data, pending, refresh } = useFetch(`/api/portal/video-reviews/${reviewId}`)

const responseNotes = ref('')
const responding = ref(false)

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    return (error as { data?: { statusMessage?: string } }).data?.statusMessage
  }
  return undefined
}

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function respond(action: 'approve' | 'reject' | 'revision_requested') {
  responding.value = true
  try {
    await $fetch(`/api/portal/video-reviews/${reviewId}/respond`, {
      method: 'POST',
      body: { action, notes: responseNotes.value || undefined }
    })
    toast.add({
      title: `Video ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revision requested'}`,
      color: 'success'
    })
    responseNotes.value = ''
    await refresh()
  } catch (error: unknown) {
    toast.add({ title: 'Failed', description: errorMessage(error), color: 'error' })
  } finally {
    responding.value = false
  }
}

const statusColors: Record<string, string> = {
  pending: 'info',
  approved: 'success',
  rejected: 'error',
  revision_requested: 'warning'
}
</script>

<template>
  <div class="p-6 space-y-6 w-full">
    <div v-if="pending" class="space-y-4">
      <USkeleton class="h-8 w-64" />
      <USkeleton class="h-48 rounded-lg" />
    </div>

    <template v-else-if="data">
      <NuxtLink
        to="/portal/video-reviews"
        class="text-sm text-muted hover:text-default inline-flex items-center gap-1"
      >
        <UIcon name="i-lucide-arrow-left" class="w-3 h-3" />
        Back to video reviews
      </NuxtLink>

      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold">
            {{ data.review.title ?? 'Video review' }}
          </h1>
          <div class="flex items-center gap-2 mt-2">
            <UBadge :color="(statusColors[data.review.status] as any) || 'neutral'" variant="subtle">
              {{ data.review.status.replace('_', ' ') }}
            </UBadge>
            <UBadge color="neutral" variant="subtle">
              {{ data.review.format }}
            </UBadge>
            <span class="text-sm text-muted">
              {{ formatDate(data.review.createdAt) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Video player -->
      <UCard>
        <video :src="data.videoUrl" controls class="w-full rounded-lg bg-black" />
      </UCard>

      <!-- Response form (pending only) -->
      <UCard v-if="data.review.status === 'pending' && hasPermission('canApproveWork')">
        <div class="space-y-4">
          <UFormField label="Notes (optional)">
            <UTextarea
              v-model="responseNotes"
              placeholder="Share any feedback..."
              :rows="4"
              class="w-full"
            />
          </UFormField>
          <div class="flex items-center gap-3">
            <UButton
              color="success"
              :loading="responding"
              icon="i-lucide-check"
              @click="respond('approve')"
            >
              Approve
            </UButton>
            <UButton
              color="warning"
              variant="soft"
              :loading="responding"
              icon="i-lucide-edit"
              @click="respond('revision_requested')"
            >
              Request changes
            </UButton>
            <UButton
              color="error"
              variant="soft"
              :loading="responding"
              icon="i-lucide-x"
              @click="respond('reject')"
            >
              Reject
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Recorded response (non-pending) -->
      <UCard v-else-if="data.review.status !== 'pending'">
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <span class="text-sm text-muted">Status</span>
            <UBadge :color="(statusColors[data.review.status] as any) || 'neutral'" variant="subtle">
              {{ data.review.status.replace('_', ' ') }}
            </UBadge>
          </div>
          <div v-if="data.review.respondedAt" class="text-sm text-muted">
            Responded {{ formatDate(data.review.respondedAt) }}
          </div>
          <div v-if="data.review.responseNotes" class="p-3 rounded-lg bg-muted/10 border border-default">
            <p class="text-sm font-medium mb-1">
              Response Notes
            </p>
            <p class="text-sm whitespace-pre-wrap">
              {{ data.review.responseNotes }}
            </p>
          </div>
        </div>
      </UCard>
    </template>
  </div>
</template>
