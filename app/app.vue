<script setup lang="ts">
const colorMode = useColorMode()
const APP_HOST = 'app.xeroflow.io'
const requestURL = useRequestURL()
const currentHost = computed(() => import.meta.client ? window.location.host.toLowerCase() : requestURL.host.toLowerCase())

const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')
const isAdminHost = computed(() => currentHost.value === APP_HOST)

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useHead(() => ({
  meta: isAdminHost.value
    ? []
    : [
        {
          key: 'robots',
          name: 'robots',
          content: 'noindex,nofollow'
        }
      ]
}))

const title = 'XeroFlow — Agency Operations Platform'
const description = 'The all-in-one operations platform for digital marketing agencies. Boards, invoicing, chat, AI insights, time tracking, client portal, and ad spend management — all in one place.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  ogImage: '/images/platform/boards.jpg',
  twitterImage: '/images/platform/boards.jpg',
  twitterCard: 'summary_large_image'
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
