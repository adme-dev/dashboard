<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const fileRef = ref<HTMLInputElement>()

const profileSchema = z.object({
  name: z.string().min(2, 'Too short'),
  email: z.string().email('Invalid email'),
  username: z.string().min(2, 'Too short'),
  avatar: z.string().optional(),
  bio: z.string().optional()
})

type ProfileSchema = z.output<typeof profileSchema>

const profile = reactive<Partial<ProfileSchema>>({
  name: 'Benjamin Canac',
  email: 'ben@nuxtlabs.com',
  username: 'benjamincanac',
  avatar: undefined,
  bio: undefined
})
const toast = useToast()
async function onSubmit(event: FormSubmitEvent<ProfileSchema>) {
  toast.add({
    title: 'Success',
    description: 'Your settings have been updated.',
    icon: 'i-lucide-check',
    color: 'success'
  })
  console.log(event.data)
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement

  if (!input.files?.length) {
    return
  }

  profile.avatar = URL.createObjectURL(input.files[0]!)
}

function onFileClick() {
  fileRef.value?.click()
}

// Load status on client
const { data: xeroStatus, refresh: refreshStatus } = await useFetch('/api/xero/status', { server: false })

// Explicit client-side tenants fetch to avoid SSR/stale data issues
const tenantOptions = ref<{ label: string, value: string }[]>([])
const tenantsLoading = ref(false)

async function loadTenants() {
  try {
    tenantsLoading.value = true
    const list = await $fetch<any[]>('/api/xero/tenants')
    tenantOptions.value = (list || []).map(t => ({ label: t.tenantName, value: t.tenantId }))
  } catch {
    tenantOptions.value = []
  } finally {
    tenantsLoading.value = false
  }
}

onMounted(async () => {
  if (xeroStatus.value?.connected) {
    await loadTenants()
  }
})

watch(() => xeroStatus?.value?.connected, async (connected) => {
  if (connected) {
    await loadTenants()
  } else {
    tenantOptions.value = []
  }
})

const selectedTenant = ref<string | undefined>(undefined)
watch(() => xeroStatus.value?.selectedTenantId, (v) => {
  selectedTenant.value = (v as string | undefined)
})

async function selectTenant(tenantId: string) {
  await $fetch('/api/xero/select-tenant', { method: 'POST', body: { tenantId } })
  await refreshStatus()
  toast.add({ title: 'Organization selected', icon: 'i-lucide-check', color: 'success' })
}
</script>

<template>
  <UForm
    id="settings"
    :schema="profileSchema"
    :state="profile"
    @submit="onSubmit"
  >
    <UPageCard
      title="Profile"
      description="These informations will be displayed publicly."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        form="settings"
        label="Save changes"
        color="neutral"
        type="submit"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard
      title="Xero Connection"
      description="Connect your Xero account to enable live financial data."
      variant="subtle"
      class="mb-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon :name="xeroStatus?.connected ? 'i-lucide-badge-check' : 'i-lucide-plug'" />
          <span>{{ xeroStatus?.connected ? 'Connected' : 'Not connected' }}</span>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            :label="xeroStatus?.connected ? 'Reconnect' : 'Connect Xero'"
            color="primary"
            href="/api/xero/login"
          />
          <UButton v-if="xeroStatus?.connected" label="Refresh orgs" color="neutral" variant="outline" @click="loadTenants" />
        </div>
      </div>

      <div v-if="xeroStatus?.connected" class="mt-4 space-y-3">
        <UFormField label="Organization" class="flex items-center justify-between gap-4">
          <USelectMenu
            :loading="tenantsLoading"
            :options="tenantOptions"
            placeholder="Select an organization"
            :model-value="xeroStatus?.selectedTenantId || undefined"
            @update:model-value="selectTenant"
            class="w-full max-w-md"
          />
        </UFormField>

        <div v-if="tenantOptions.length" class="text-xs text-muted">Found {{ tenantOptions.length }} organization(s).</div>

        <div v-if="!tenantOptions.length" class="text-xs text-muted">
          No organizations loaded. Click Refresh orgs or Reconnect and select an org on the consent screen.
        </div>

        <div v-if="tenantOptions.length" class="pt-1">
          <URadioGroup
            v-model="selectedTenant"
            :options="tenantOptions"
            @update:model-value="selectTenant"
            legend="Or pick below"
          />
          <div class="mt-2 flex flex-wrap gap-2">
            <UButton
              v-for="opt in tenantOptions"
              :key="opt.value"
              color="neutral"
              variant="outline"
              :label="opt.label"
              @click="selectTenant(opt.value)"
            />
          </div>
          <div class="text-2xs text-dimmed mt-1">Debug: {{ tenantOptions }}</div>
        </div>
      </div>
    </UPageCard>

    <UPageCard variant="subtle">
      <UFormField
        name="name"
        label="Name"
        description="Will appear on receipts, invoices, and other communication."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.name"
          autocomplete="off"
        />
      </UFormField>
      <USeparator />
      <UFormField
        name="email"
        label="Email"
        description="Used to sign in, for email receipts and product updates."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.email"
          type="email"
          autocomplete="off"
        />
      </UFormField>
      <USeparator />
      <UFormField
        name="username"
        label="Username"
        description="Your unique username for logging in and your profile URL."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.username"
          type="username"
          autocomplete="off"
        />
      </UFormField>
      <USeparator />
      <UFormField
        name="avatar"
        label="Avatar"
        description="JPG, GIF or PNG. 1MB Max."
        class="flex max-sm:flex-col justify-between sm:items-center gap-4"
      >
        <div class="flex flex-wrap items-center gap-3">
          <UAvatar
            :src="profile.avatar"
            :alt="profile.name"
            size="lg"
          />
          <UButton
            label="Choose"
            color="neutral"
            @click="onFileClick"
          />
          <input
            ref="fileRef"
            type="file"
            class="hidden"
            accept=".jpg, .jpeg, .png, .gif"
            @change="onFileChange"
          >
        </div>
      </UFormField>
      <USeparator />
      <UFormField
        name="bio"
        label="Bio"
        description="Brief description for your profile. URLs are hyperlinked."
        class="flex max-sm:flex-col justify-between items-start gap-4"
        :ui="{ container: 'w-full' }"
      >
        <UTextarea
          v-model="profile.bio"
          :rows="5"
          autoresize
          class="w-full"
        />
      </UFormField>
    </UPageCard>
  </UForm>
</template>
