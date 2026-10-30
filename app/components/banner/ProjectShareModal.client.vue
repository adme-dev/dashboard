<script setup lang="ts">
import type { BannerProject } from '~/types/banner-studio'

const props = defineProps<{ open: boolean, project: BannerProject | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
type Link = { id: string, token: string, expiresAt: string, revoked: boolean, createdAt: string }
const links = ref<Link[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const expiry = ref('7')
const expiryOptions = [{ label: '7 days', value: '7' }, { label: '30 days', value: '30' }, { label: '90 days', value: '90' }]
const toast = useToast()
const apiError = (cause: unknown, fallback: string) => {
  const response = cause as { data?: { statusMessage?: string } }
  return response?.data?.statusMessage || fallback
}

const activeLinks = computed(() => links.value.filter(link => !link.revoked && new Date(link.expiresAt).getTime() > Date.now()))
const linkUrl = (link: Link) => `${window.location.origin}/share/banner/${link.token}`

async function refresh() {
  if (!props.project) return
  const projectId = props.project.id
  loading.value = true
  error.value = ''
  try {
    const result = await $fetch<Link[]>('/api/agency/banner-studio/links', { query: { projectId } })
    if (props.project?.id === projectId) links.value = result
  } catch (cause) {
    if (props.project?.id === projectId) error.value = apiError(cause, 'Could not load share links')
  } finally {
    loading.value = false
  }
}
watch(() => [props.open, props.project?.id] as const, ([open]) => {
  if (open) void refresh()
}, { immediate: true })

async function createLink() {
  if (!props.project || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/agency/banner-studio/links', { method: 'POST', body: { projectId: props.project.id, expiresInDays: Number(expiry.value) } })
    await refresh()
    toast.add({ title: 'Client link created', color: 'success' })
  } catch (cause) {
    error.value = apiError(cause, 'Could not create link')
  } finally {
    busy.value = false
  }
}
async function copyLink(link: Link) {
  try {
    await navigator.clipboard.writeText(linkUrl(link))
    toast.add({ title: 'Link copied', color: 'success' })
  } catch {
    error.value = 'Clipboard unavailable. Open the link and copy it from your browser.'
  }
}
async function revokeLink(link: Link) {
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/agency/banner-studio/links/${link.id}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Link revoked', color: 'success' })
  } catch (cause) {
    error.value = apiError(cause, 'Could not revoke link')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Share banner"
    :description="project?.name"
    @update:open="value => emit('update:open', value)"
  >
    <template #body>
      <div class="space-y-5 @container">
        <div class="rounded-lg border border-default bg-elevated/40 p-4">
          <h3 class="text-sm font-semibold">
            Team access
          </h3>
          <p class="mt-1 text-sm text-muted">
            Team members with Banner Studio access to this client can open the saved banner viewer.
          </p>
          <UButton
            v-if="project"
            :to="`/creative/banner-studio/view/${project.id}`"
            target="_blank"
            icon="i-lucide-external-link"
            color="neutral"
            variant="outline"
            size="sm"
            class="mt-3"
          >
            Open team viewer
          </UButton>
        </div>
        <div class="space-y-3">
          <div>
            <h3 class="text-sm font-semibold">
              Client links
            </h3>
            <p class="mt-1 text-sm text-muted">
              Anyone with a link can view the current banner. Links expire automatically and can be revoked.
            </p>
          </div>
          <UFormField label="Link expires after">
            <USelect v-model="expiry" :items="expiryOptions" class="w-full" />
          </UFormField>
          <UButton
            icon="i-lucide-link"
            :loading="busy"
            :disabled="busy"
            @click="createLink"
          >
            Create client link
          </UButton>
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            title="Sharing unavailable"
            :description="error"
          />
          <USkeleton v-if="loading" class="h-16 w-full" />
          <p v-else-if="!activeLinks.length" class="text-sm text-muted">
            No active client links yet.
          </p>
          <div v-for="link in activeLinks" :key="link.id" class="flex flex-wrap items-center gap-2 rounded-lg border border-default p-3">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ linkUrl(link) }}
              </p>
              <p class="text-xs text-muted">
                Expires {{ new Date(link.expiresAt).toLocaleDateString('en-AU') }}
              </p>
            </div>
            <UButton
              icon="i-lucide-copy"
              aria-label="Copy client link"
              color="neutral"
              variant="outline"
              size="sm"
              @click="copyLink(link)"
            />
            <UButton
              :to="linkUrl(link)"
              target="_blank"
              icon="i-lucide-external-link"
              aria-label="Open client link"
              color="neutral"
              variant="outline"
              size="sm"
            />
            <UButton
              icon="i-lucide-link-2-off"
              aria-label="Revoke client link"
              color="error"
              variant="ghost"
              size="sm"
              :disabled="busy"
              @click="revokeLink(link)"
            />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
