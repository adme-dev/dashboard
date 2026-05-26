<script setup lang="ts">
import type { OfficeLobbyConfig } from '~~/app/types/office'

definePageMeta({
  layout: false,
  auth: false
})

const route = useRoute()
const handle = computed(() => String(route.params.handle || ''))

const { data, pending, error } = await useFetch<{
  lobby: {
    id: string
    office_id: string
    handle: string
    name: string
    description: string
    destination_zone_slug: string | null
    destination_zone_name: string | null
    office_name: string
    config: OfficeLobbyConfig
  }
}>(() => `/api/public/office-lobby/handle/${handle.value}`, {
  watch: [handle]
})

const destinationUrl = computed(() => {
  const lobby = data.value?.lobby
  if (!lobby) return null
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(route.query)) {
    if (key === 'lobby') continue
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') query.append(key, item)
      }
    } else if (typeof value === 'string') {
      query.set(key, value)
    }
  }
  query.set('lobby', lobby.handle)
  if (lobby.destination_zone_slug && !query.has('room')) query.set('room', lobby.destination_zone_slug)
  return `/lobby/${lobby.office_id}?${query.toString()}`
})

watch(
  destinationUrl,
  async (url) => {
    if (url) await navigateTo(url, { replace: true })
  },
  { immediate: true }
)
</script>

<template>
  <main class="min-h-screen bg-[#06070a] text-white">
    <div class="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div class="mb-4 flex size-12 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
        <UIcon name="i-lucide-door-open" class="size-5 text-emerald-300" />
      </div>
      <h1 class="text-lg font-semibold">
        {{ pending ? 'Opening lobby' : error ? 'Lobby unavailable' : data?.lobby.name }}
      </h1>
      <p class="mt-2 text-sm text-white/45">
        {{ error ? 'This lobby link is inactive or does not exist.' : data?.lobby.description || data?.lobby.office_name || 'Redirecting you to the waiting room.' }}
      </p>
      <NuxtLink
        v-if="destinationUrl"
        :to="destinationUrl"
        class="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black"
      >
        Continue
      </NuxtLink>
    </div>
  </main>
</template>
