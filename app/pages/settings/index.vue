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

// Profile card shows the real logged-in user — this page previously
// shipped the Nuxt-UI template's placeholder ("Benjamin Canac").
const { user, fetchUser, canAccessFinance, canAccessMediaBuying } = useAuth()

const profile = reactive<Partial<ProfileSchema>>({
  name: '',
  email: '',
  username: '',
  avatar: undefined,
  bio: undefined
})

function seedProfileFromUser() {
  if (!user.value) return
  profile.name = user.value.name || ''
  profile.email = user.value.email || ''
  profile.username = (user.value.email || '').split('@')[0] || ''
  profile.avatar = (user.value as any).avatarUrl || (user.value as any).avatar_url || undefined
}
watch(user, seedProfileFromUser, { immediate: true })
const toast = useToast()
async function onSubmit(event: FormSubmitEvent<ProfileSchema>) {
  toast.add({
    title: 'Success',
    description: 'Your settings have been updated.',
    icon: 'i-lucide-check',
    color: 'success'
  })
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

// Load status on client (lazy to avoid blocking Suspense).
// getCachedData returns undefined so every mount refetches — otherwise Nuxt serves
// a stale response from the data cache and the page shows "not connected" on soft
// navigations even after the user has linked Xero.
interface XeroStatus {
  connected: boolean
  selectedTenantId?: string | null
  selectedTenantName?: string | null
}

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
) => Promise<T>

const xeroStatus = ref<XeroStatus | null>(null)

async function refreshStatus() {
  xeroStatus.value = await apiFetch<XeroStatus>('/api/xero/status')
}

const { state: connectState, connect: connectXero } = useXeroConnect({ onStatusRefresh: refreshStatus })

const connectLabel = computed(() => {
  if (connectState.status === 'loading') {
    return 'Opening Xero...'
  }
  if (connectState.status === 'completed' && xeroStatus.value?.connected) {
    return 'Connected'
  }
  return xeroStatus.value?.connected ? 'Reconnect' : 'Connect Xero'
})

// Meta Ads connection (lazy to avoid blocking Suspense)
const metaAccounts = ref<any[]>([])

async function refreshMetaAccounts() {
  metaAccounts.value = await apiFetch<any[]>('/api/agency/social/meta/accounts')
}

const { state: metaConnectState, connect: connectMeta } = useMetaConnect({ onConnected: refreshMetaAccounts })
const metaSyncing = ref(false)
const showDisconnectMetaConfirm = ref(false)
const metaAccountToDisconnect = ref<any>(null)

const metaConnectLabel = computed(() => {
  if (metaConnectState.status === 'loading') return 'Opening Meta...'
  if (metaConnectState.status === 'completed') return 'Connected'
  return metaAccounts.value?.length ? 'Add Account' : 'Connect Meta'
})

async function syncMetaSpend() {
  try {
    metaSyncing.value = true
    // Endpoint is now fire-and-forget — returns immediately, sync runs via
    // Cloudflare waitUntil. Refresh accounts list after a short delay so the
    // user sees the updated lastSyncedAt.
    await apiFetch<{ status: 'started'; startedAt: string }>('/api/agency/social/meta/sync-spend', { method: 'POST' })
    toast.add({
      title: 'Sync started',
      description: 'Meta spend sync running in background — refreshing accounts shortly.',
      icon: 'i-lucide-refresh-cw',
      color: 'info',
    })
    setTimeout(() => { refreshMetaAccounts() }, 30_000)
    setTimeout(() => { refreshMetaAccounts() }, 90_000)
  } catch (err: any) {
    toast.add({ title: 'Sync failed', description: err?.data?.statusMessage || 'Could not start sync.', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    metaSyncing.value = false
  }
}

function disconnectMetaAccount(account: any) {
  metaAccountToDisconnect.value = account
  showDisconnectMetaConfirm.value = true
}

async function onConfirmDisconnectMeta() {
  const account = metaAccountToDisconnect.value
  if (!account) return
  showDisconnectMetaConfirm.value = false

  try {
    await apiFetch('/api/agency/social/meta/disconnect', { method: 'DELETE', query: { connectionId: account.id } })
    toast.add({ title: 'Disconnected', description: `${account.accountName} removed.`, icon: 'i-lucide-check', color: 'success' })
    await refreshMetaAccounts()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Could not disconnect.', icon: 'i-lucide-alert-triangle', color: 'error' })
  } finally {
    metaAccountToDisconnect.value = null
  }
}

// Explicit client-side tenants fetch to avoid SSR/stale data issues
const tenantOptions = ref<{ label: string, value: string }[]>([])
const tenantsLoading = ref(false)

async function loadTenants() {
  try {
    tenantsLoading.value = true
    const list = await fetch('/api/xero/tenants').then(r => r.json()) as any[]
    tenantOptions.value = (list || []).map((t: any) => ({ label: t.tenantName, value: t.tenantId }))
  } catch {
    tenantOptions.value = []
  } finally {
    tenantsLoading.value = false
  }
}

onMounted(async () => {
  // Route middleware usually populated the shared user ref already — only
  // hit /api/auth/me when it didn't, so the connection fetches start sooner.
  if (!user.value) await fetchUser()
  // Only fetch what this user's role can see — the endpoints are gated
  // server-side too; this just avoids guaranteed-403 calls.
  await Promise.allSettled([
    canAccessFinance.value ? refreshStatus() : Promise.resolve(),
    canAccessMediaBuying.value ? refreshMetaAccounts().catch(() => { metaAccounts.value = [] }) : Promise.resolve(),
  ])
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

async function selectTenant(tenantId: string | any) {
  const id = typeof tenantId === 'string' ? tenantId : tenantId?.value || tenantId
  await apiFetch('/api/xero/select-tenant', { method: 'POST', body: { tenantId: id } })
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
      description="Your account details — visible to your team, never publicly."
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
      v-if="canAccessFinance"
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
            :label="connectLabel"
            color="primary"
            :loading="connectState.status === 'loading'"
            type="button"
            @click="connectXero"
          />
          <UButton v-if="xeroStatus?.connected" label="Refresh orgs" color="neutral" variant="outline" @click="loadTenants" />
        </div>
      </div>

      <div v-if="connectState.error" class="mt-4 text-sm text-danger bg-danger/10 rounded px-3 py-2">
        {{ connectState.error }}
      </div>

      <div v-if="connectState.status === 'loading'" class="mt-4 text-sm text-muted">
        Opening secure Xero login... if nothing happens, allow popups or <button type="button" class="underline" @click="connectXero">try again</button>.
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
        </div>
      </div>
    </UPageCard>

    <UPageCard
      v-if="canAccessMediaBuying"
      title="Meta Ads"
      description="Connect Meta ad accounts to sync spend data."
      variant="subtle"
      class="mb-4"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon :name="metaAccounts?.length ? 'i-lucide-badge-check' : 'i-lucide-plug'" />
          <span>{{ metaAccounts?.length ? `${metaAccounts.length} account(s) connected` : 'Not connected' }}</span>
        </div>
        <UButton
          :label="metaConnectLabel"
          color="primary"
          :loading="metaConnectState.status === 'loading'"
          type="button"
          @click="connectMeta()"
        />
      </div>

      <div v-if="metaConnectState.error" class="mt-4 text-sm text-danger bg-danger/10 rounded px-3 py-2">
        {{ metaConnectState.error }}
      </div>

      <div v-if="metaConnectState.status === 'loading'" class="mt-4 text-sm text-muted">
        Opening Meta login... if nothing happens, allow popups or
        <UButton type="button" color="neutral" variant="link" class="p-0" @click="connectMeta()">
          try again
        </UButton>.
      </div>

      <div v-if="metaAccounts?.length" class="mt-4 space-y-3">
        <div
          v-for="account in metaAccounts"
          :key="account.id"
          class="flex items-center justify-between gap-4 rounded-lg border border-default p-3"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-medium truncate">{{ account.accountName }}</span>
              <UBadge
                :color="account.status === 'active' ? 'success' : 'warning'"
                :label="account.status"
                variant="subtle"
                size="xs"
              />
            </div>
            <div class="text-xs text-muted mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span v-if="account.tokenExpiresAt">
                Token expires {{ new Date(account.tokenExpiresAt).toLocaleDateString() }}
              </span>
              <span v-if="account.lastSyncedAt">
                Last synced {{ new Date(account.lastSyncedAt).toLocaleDateString() }}
              </span>
              <span v-if="account.mappedClients > 0">
                {{ account.mappedClients }} mapped client(s)
              </span>
              <span v-if="account.connectedByName">
                Connected by {{ account.connectedByName }}
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <UButton
              label="Sync Now"
              color="neutral"
              variant="outline"
              size="xs"
              :loading="metaSyncing"
              @click="syncMetaSpend"
            />
            <UButton
              label="Disconnect"
              color="error"
              variant="ghost"
              size="xs"
              @click="disconnectMetaAccount(account)"
            />
          </div>
        </div>

        <div v-if="metaAccounts.length > 1" class="pt-1">
          <UButton
            label="Sync All Accounts"
            color="neutral"
            variant="outline"
            :loading="metaSyncing"
            @click="syncMetaSpend"
          />
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
            :src="safeMediaUrl(profile.avatar)"
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

    <!-- Disconnect Meta Account Confirm Modal -->
    <UModal v-model:open="showDisconnectMetaConfirm">
      <template #content>
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-2">Disconnect account</h3>
          <p class="text-sm text-muted mb-4">Disconnect "{{ metaAccountToDisconnect?.accountName }}"? Spend data will be preserved.</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" @click="showDisconnectMetaConfirm = false">Cancel</UButton>
            <UButton color="error" @click="onConfirmDisconnectMeta">Disconnect</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </UForm>
</template>
