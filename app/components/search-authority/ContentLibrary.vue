<script setup lang="ts">
import { idempotencyKey } from '~~/app/utils/idempotencyKey'

interface ContentAsset {
  id: string
  slug: string
  title: string
  topic: string
  status: string
  current_version_id: string | null
  updated_at: string
}

const props = defineProps<{ clientId: string | null, siteId: string | null }>()
const toast = useToast()
const assets = ref<ContentAsset[]>([])
const loading = ref(false)
const publishingAssetId = ref<string | null>(null)
const editorOpen = ref(false)
const selectedAssetId = ref<string | null>(null)

const versionRoute = computed(() => selectedAssetId.value
  ? `/api/agency/search-authority/content/${selectedAssetId.value}/versions`
  : null)

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase())
}

function statusColor(status: string): 'neutral' | 'info' | 'success' | 'warning' {
  if (status === 'approved' || status === 'published') return 'success'
  if (status === 'in_review') return 'info'
  if (status === 'rejected') return 'warning'
  return 'neutral'
}

async function refresh() {
  if (!props.clientId) {
    assets.value = []
    return
  }
  loading.value = true
  try {
    const response = await $fetch<{ assets: ContentAsset[] }>(
      `/api/agency/search-authority/content?${new URLSearchParams({ clientId: props.clientId })}`
    )
    assets.value = response.assets
  } catch (error: unknown) {
    const candidate = error as { data?: { statusMessage?: string } }
    toast.add({ title: 'Content library unavailable', description: candidate?.data?.statusMessage, color: 'error' })
  } finally {
    loading.value = false
  }
}

function createAsset() {
  selectedAssetId.value = null
  editorOpen.value = true
}

function editAsset(id: string) {
  selectedAssetId.value = id
  editorOpen.value = true
}

async function publishAsset(asset: ContentAsset) {
  if (!props.clientId) return
  publishingAssetId.value = asset.id
  try {
    const result = await $fetch<{ publicUrl: string }>(
      `/api/agency/search-authority/content/${asset.id}/publish`,
      { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey('search-authority-publish') }, body: { clientId: props.clientId } }
    )
    toast.add({
      title: 'Approved guide published',
      description: result.publicUrl,
      color: 'success'
    })
    await refresh()
  } catch (error: unknown) {
    const candidate = error as { data?: { statusMessage?: string }, message?: string }
    toast.add({
      title: 'Guide not published',
      description: candidate?.data?.statusMessage || candidate?.message,
      color: 'error'
    })
  } finally {
    publishingAssetId.value = null
  }
}

watch(() => props.clientId, () => void refresh(), { immediate: true })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="font-semibold text-highlighted">
            Source-backed content
          </h2>
          <p class="mt-1 text-sm text-muted">
            One governed monthly guide, from Sales Manager evidence to client approval.
          </p>
        </div>
        <UButton
          label="Create guide"
          icon="i-lucide-file-plus-2"
          :disabled="!clientId || !siteId"
          @click="createAsset"
        />
      </div>
    </template>

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-24 w-full" />
      <USkeleton class="h-24 w-full" />
    </div>
    <UAlert
      v-else-if="assets.length === 0"
      title="No governed guides yet"
      description="Capture a real buyer question and a consented Sales Manager source to begin."
      icon="i-lucide-notebook-pen"
      color="neutral"
      variant="subtle"
    />
    <div v-else class="space-y-4">
      <article v-for="asset in assets" :key="asset.id" class="rounded-lg border border-default p-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-medium text-highlighted">
                {{ asset.title }}
              </h3>
              <UBadge :label="label(asset.status)" :color="statusColor(asset.status)" variant="subtle" />
            </div>
            <p class="mt-1 text-sm text-muted">
              {{ asset.topic }}
            </p>
            <p class="mt-2 text-xs text-muted">
              /guides/{{ asset.slug }}
            </p>
          </div>
          <UButton
            label="Open version"
            icon="i-lucide-pencil-line"
            color="neutral"
            variant="soft"
            @click="editAsset(asset.id)"
          />
        </div>
        <SearchAuthorityContentApprovalPanel
          class="mt-4 border-t border-default pt-4"
          :client-id="clientId!"
          :asset-id="asset.id"
          :version-id="asset.current_version_id"
          :status="asset.status"
          :busy="publishingAssetId === asset.id"
          @edit="editAsset(asset.id)"
          @refreshed="refresh"
          @publish="publishAsset(asset)"
        />
      </article>
    </div>

    <SearchAuthorityContentEditorSlideover
      v-if="clientId && siteId"
      v-model:open="editorOpen"
      :client-id="clientId"
      :site-id="siteId"
      :asset-id="selectedAssetId"
      :version-route="versionRoute"
      @saved="refresh"
    />
  </UCard>
</template>
