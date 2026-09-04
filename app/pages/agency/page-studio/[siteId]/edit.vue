<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Page Studio | XeroFlow Agency' })

const route = useRoute()
const config = useRuntimeConfig()
const toast = useToast()
const rawSiteId = route.params.siteId
const siteId = Array.isArray(rawSiteId) ? rawSiteId[0] : rawSiteId
const launching = ref(false)
const errorMessage = ref<string | null>(null)

if (!siteId) {
  throw createError({ statusCode: 404, statusMessage: 'Page Studio site not found' })
}

function resolveEditorOrigin() {
  const value = config.public.pageStudioEditorUrl
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

async function launchStudio() {
  if (launching.value) return
  launching.value = true
  errorMessage.value = null

  try {
    const editorOrigin = resolveEditorOrigin()
    if (!editorOrigin) throw new Error('Page Studio editor is not configured')

    const response = await $fetch<{ session: { token: string } }>(
      `/api/agency/page-studio/sites/${siteId}/editor-sessions`,
      { method: 'POST' }
    )
    const form = document.createElement('form')
    form.action = `${editorOrigin}/launch`
    form.method = 'POST'
    const token = document.createElement('input')
    token.type = 'hidden'
    token.name = 'token'
    token.value = response.session.token
    form.append(token)
    document.body.append(form)
    form.submit()
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      && error.data && typeof error.data === 'object' && 'message' in error.data
      ? String(error.data.message)
      : error instanceof Error
        ? error.message
        : 'The governed editor session could not be started.'
    errorMessage.value = message
    toast.add({
      title: 'Page Studio could not open',
      description: message,
      color: 'error'
    })
    launching.value = false
  }
}

onMounted(launchStudio)
</script>

<template>
  <section class="mx-auto w-full max-w-2xl p-4 sm:p-6">
    <UCard>
      <div class="flex flex-col items-center py-8 text-center">
        <span class="flex size-12 items-center justify-center rounded-xl bg-elevated">
          <UIcon
            :name="errorMessage ? 'i-lucide-circle-alert' : 'i-lucide-loader-circle'"
            class="size-6 text-primary"
            :class="{ 'animate-spin': launching && !errorMessage }"
          />
        </span>
        <h1 class="mt-4 text-xl font-semibold text-highlighted">
          {{ errorMessage ? 'Page Studio could not open' : 'Opening Page Studio' }}
        </h1>
        <p class="mt-2 max-w-md text-sm leading-6 text-muted">
          {{ errorMessage || 'Creating a secure editor session and opening the canonical Studio.' }}
        </p>
        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <UButton
            v-if="errorMessage"
            label="Try again"
            icon="i-lucide-refresh-cw"
            :loading="launching"
            @click="launchStudio"
          />
          <UButton
            :to="`/agency/page-studio/${encodeURIComponent(siteId)}`"
            label="Return to site"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="outline"
          />
        </div>
      </div>
    </UCard>
  </section>
</template>
