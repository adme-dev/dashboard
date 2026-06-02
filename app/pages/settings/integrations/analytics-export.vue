<script setup lang="ts">
import {
  validateTokenLabel,
  resolveScopeClientId,
  tokenScopeLabel,
  AGENCY_SCOPE_SENTINEL
} from '~~/app/utils/exportTokenForm'

const toast = useToast()

interface ExportToken {
  id: string
  label: string
  client_id: string | null
  client_name: string | null
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

const { data, refresh } = await useFetch<{ tokens: ExportToken[] }>('/api/agency/analytics/export-tokens')
const tokens = computed(() => data.value?.tokens ?? [])

// Client options for the scope picker
const { data: clientData } = await useFetch<Array<{ id: string, name: string }>>('/api/agency/clients')
const scopeItems = computed(() => [
  { label: 'Agency-wide (all clients)', value: AGENCY_SCOPE_SENTINEL },
  ...((clientData.value ?? []).map(c => ({ label: c.name, value: c.id })))
])

// Mint modal
const showMint = ref(false)
const newLabel = ref('')
const newScope = ref<string>(AGENCY_SCOPE_SENTINEL)
const minting = ref(false)
const mintedToken = ref<string | null>(null)
const labelError = computed(() => (newLabel.value ? validateTokenLabel(newLabel.value) : null))

function openMint() {
  newLabel.value = ''
  newScope.value = AGENCY_SCOPE_SENTINEL
  mintedToken.value = null
  showMint.value = true
}

async function mint() {
  const err = validateTokenLabel(newLabel.value)
  if (err) { toast.add({ title: err, color: 'error' }); return }
  minting.value = true
  try {
    const res = await $fetch<{ token: string }>('/api/agency/analytics/export-tokens', {
      method: 'POST',
      body: { label: newLabel.value.trim(), clientId: resolveScopeClientId(newScope.value) }
    })
    mintedToken.value = res.token
    await refresh()
  } catch {
    toast.add({ title: 'Could not mint token', color: 'error' })
  } finally {
    minting.value = false
  }
}

async function copyToken() {
  if (!mintedToken.value) return
  await navigator.clipboard.writeText(mintedToken.value)
  toast.add({ title: 'Token copied', color: 'success' })
}

// Revoke
const showRevoke = ref(false)
const revokeTarget = ref<ExportToken | null>(null)
function askRevoke(t: ExportToken) { revokeTarget.value = t; showRevoke.value = true }
async function confirmRevoke() {
  if (!revokeTarget.value) return
  try {
    await $fetch(`/api/agency/analytics/export-tokens/${revokeTarget.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Token revoked', color: 'success' })
    await refresh()
  } catch {
    toast.add({ title: 'Could not revoke token', color: 'error' })
  } finally {
    showRevoke.value = false
    revokeTarget.value = null
  }
}

const columns = [
  { accessorKey: 'label', header: 'Label' },
  { accessorKey: 'scope', header: 'Scope' },
  { accessorKey: 'created_at', header: 'Created' },
  { accessorKey: 'actions', header: '' }
]

function scopeOf(t: ExportToken): string { return tokenScopeLabel(t) }
function fmtDate(iso: string): string { return new Date(iso).toLocaleDateString() }
</script>

<template>
  <div class="p-6 max-w-5xl mx-auto space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Analytics data export</h1>
        <p class="text-sm text-muted mt-1">
          Mint bearer tokens for the analytics export API
          (<code class="text-xs">/api/export/analytics</code>) — pull the canonical fact into a warehouse or share with a client.
        </p>
      </div>
      <UButton label="Mint token" icon="i-lucide-plus" @click="openMint" />
    </div>

    <UTable :data="tokens" :columns="columns">
      <template #scope-cell="{ row }">
        <UBadge :color="row.original.client_id ? 'primary' : 'neutral'" variant="subtle" size="sm">
          {{ scopeOf(row.original) }}
        </UBadge>
      </template>
      <template #created_at-cell="{ row }">{{ fmtDate(row.original.created_at) }}</template>
      <template #label-cell="{ row }">
        <span :class="row.original.revoked_at ? 'line-through text-muted' : ''">{{ row.original.label }}</span>
      </template>
      <template #actions-cell="{ row }">
        <UButton
          v-if="!row.original.revoked_at"
          label="Revoke"
          color="error"
          variant="ghost"
          size="xs"
          @click="askRevoke(row.original)"
        />
        <UBadge v-else color="neutral" variant="subtle" size="sm">Revoked</UBadge>
      </template>
    </UTable>

    <p v-if="!tokens.length" class="text-sm text-muted text-center py-8">No export tokens yet.</p>

    <!-- Mint modal -->
    <UModal v-model:open="showMint">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">Mint export token</h3>

          <template v-if="!mintedToken">
            <UFormField label="Label" :error="labelError ?? undefined" required>
              <UInput v-model="newLabel" placeholder="e.g. BigQuery nightly pull" class="w-full" />
            </UFormField>
            <UFormField label="Scope">
              <USelectMenu v-model="newScope" :items="scopeItems" value-key="value" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2 pt-2">
              <UButton label="Cancel" variant="ghost" color="neutral" @click="showMint = false" />
              <UButton label="Mint" :loading="minting" :disabled="!!labelError || !newLabel.trim()" @click="mint" />
            </div>
          </template>

          <template v-else>
            <UAlert
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Copy this token now"
              description="This is the only time it will be shown. Store it somewhere safe — it cannot be retrieved again."
            />
            <div class="flex items-center gap-2">
              <UInput :model-value="mintedToken" readonly class="flex-1 font-mono text-xs" />
              <UButton icon="i-lucide-copy" label="Copy" @click="copyToken" />
            </div>
            <div class="flex justify-end pt-2">
              <UButton label="Done" @click="showMint = false" />
            </div>
          </template>
        </div>
      </template>
    </UModal>

    <!-- Revoke confirm -->
    <UModal v-model:open="showRevoke">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">Revoke token?</h3>
          <p class="text-sm text-muted">
            “{{ revokeTarget?.label }}” will stop working immediately. Any warehouse job or client using it will lose access.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" color="neutral" @click="showRevoke = false" />
            <UButton label="Revoke" color="error" @click="confirmRevoke" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
