<template>
  <UPopover v-if="!loading && !repo">
    <UButton
      icon="i-lucide-github"
      variant="ghost"
      color="neutral"
      size="sm"
    >
      Connect Repo
    </UButton>
    <template #content>
      <div class="p-3 w-64">
        <p class="text-sm font-medium mb-1">Connect a GitHub repo</p>
        <p class="text-xs text-muted mb-3">
          Lets the AI agent answer questions grounded in this project's code.
        </p>
        <UButton
          block
          color="primary"
          icon="i-lucide-link"
          size="sm"
          @click="openModal()"
        >
          Connect
        </UButton>
      </div>
    </template>
  </UPopover>

  <div v-else-if="repo" class="flex items-center gap-1">
    <UButton
      icon="i-lucide-github"
      variant="soft"
      color="success"
      size="sm"
      :title="`Connected to ${shortRepoName}`"
      @click="openModal()"
    >
      <span class="hidden sm:inline">{{ shortRepoName }}</span>
      <UIcon name="i-lucide-circle-check" class="w-3.5 h-3.5 -mr-0.5" />
    </UButton>
    <UButton
      icon="i-lucide-message-square-code"
      variant="soft"
      color="primary"
      size="sm"
      :title="`Chat with the AI about ${shortRepoName} — scoped to this repo`"
      @click="chatWithRepo"
    >
      <span class="hidden md:inline">Chat with repo</span>
    </UButton>
  </div>

  <UModal v-model:open="modalOpen" title="Connect GitHub Repository">
    <template #content>
      <div class="p-5 space-y-4">
        <p class="text-sm text-muted">
          Connecting a repo lets the AI agent answer questions grounded in your code via the
          graphify knowledge graph stored in R2.
        </p>

        <UFormField label="Repository URL" name="repoUrl" required>
          <UInput
            v-model="form.repoUrl"
            placeholder="https://github.com/your-org/your-repo"
            icon="i-lucide-github"
          />
        </UFormField>

        <UFormField label="Personal Access Token" name="accessToken" required>
          <UInput
            v-model="form.accessToken"
            :type="showToken ? 'text' : 'password'"
            :placeholder="repo?.has_token ? 'Leave blank to keep existing token' : 'ghp_...'"
            :ui="{ trailing: 'pe-1' }"
          >
            <template #trailing>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                :icon="showToken ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                :aria-label="showToken ? 'Hide token' : 'Show token'"
                @click="showToken = !showToken"
              />
            </template>
          </UInput>
          <template #help>
            Needs <code>repo</code> scope (read access to private repos).
            <a href="https://github.com/settings/tokens/new" target="_blank" class="text-primary underline">
              Create one
            </a>.
          </template>
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Default branch" name="defaultBranch">
            <UInput v-model="form.defaultBranch" placeholder="main" />
          </UFormField>

          <UFormField label="Graphify R2 prefix" name="graphifyPath" hint="optional">
            <UInput v-model="form.graphifyPath" placeholder="graphify/your-repo" />
          </UFormField>
        </div>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          icon="i-lucide-circle-alert"
          :title="errorMessage"
        />

        <div class="flex items-center justify-end gap-2 pt-2">
          <UButton color="neutral" variant="ghost" @click="modalOpen = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            :loading="submitting"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ repo ? 'Update connection' : 'Connect' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  boardId: string
}>()

interface RepoInfo {
  id: string
  repo_url: string
  default_branch: string
  graphify_path: string | null
  graphify_last_synced_at: string | null
  updated_at: string
  has_token: boolean
}

const toast = useToast()
const { open: openHub, setScope } = useActivityHub()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const repo = ref<RepoInfo | null>(null)
const modalOpen = ref(false)
const showToken = ref(false)
const submitting = ref(false)
const errorMessage = ref<string | null>(null)

function chatWithRepo() {
  if (!repo.value) return
  setScope(props.boardId, shortRepoName.value)
  openHub('ai')
}

const form = reactive({
  repoUrl: '',
  accessToken: '',
  defaultBranch: 'main',
  graphifyPath: '',
})

const shortRepoName = computed(() => {
  const url = repo.value?.repo_url ?? ''
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/i)
  return m ? `${m[1]}/${m[2]}` : url
})

const canSubmit = computed(() => {
  if (!form.repoUrl.trim()) return false
  // If creating a new connection, token is required.
  if (!repo.value && !form.accessToken.trim()) return false
  return true
})

async function loadStatus() {
  loading.value = true
  try {
    const res = await apiFetch<{ connected: boolean; repo: RepoInfo | null }>(
      `/api/agency/boards/${props.boardId}/repo`,
    )
    repo.value = res.repo
  } catch (err: any) {
    // 403/404 is fine — just means user can't see / nothing connected.
    // Anything else is worth a console line so it's not silently invisible.
    const code = err?.statusCode ?? err?.response?.status
    if (code !== 403 && code !== 404) {
      console.error('[BoardRepoConnect] failed to load repo status:', err)
    }
    repo.value = null
  } finally {
    loading.value = false
  }
}

function openModal() {
  errorMessage.value = null
  showToken.value = false
  if (repo.value) {
    form.repoUrl = repo.value.repo_url
    form.accessToken = '' // never prefill the token
    form.defaultBranch = repo.value.default_branch
    form.graphifyPath = repo.value.graphify_path ?? ''
  } else {
    form.repoUrl = ''
    form.accessToken = ''
    form.defaultBranch = 'main'
    form.graphifyPath = ''
  }
  modalOpen.value = true
}

async function submit() {
  errorMessage.value = null
  submitting.value = true
  try {
    const body: Record<string, string> = {
      repoUrl: form.repoUrl.trim(),
      defaultBranch: form.defaultBranch.trim() || 'main',
    }
    if (form.accessToken.trim()) body.accessToken = form.accessToken.trim()
    if (form.graphifyPath.trim()) body.graphifyPath = form.graphifyPath.trim()

    if (!body.accessToken && !repo.value) {
      errorMessage.value = 'Access token is required for a new connection'
      return
    }

    // When updating, accessToken is optional — the API preserves the
    // stored token if we omit it. Just send whatever the user provided.

    await apiFetch(`/api/agency/boards/${props.boardId}/repo`, {
      method: 'POST',
      body,
    })

    toast.add({
      title: repo.value ? 'Connection updated' : 'Repository connected',
      description: shortRepoName.value || form.repoUrl,
      color: 'success',
    })
    modalOpen.value = false
    await loadStatus()
  } catch (err: any) {
    errorMessage.value = err?.statusMessage || err?.data?.statusMessage || err?.message || 'Failed to save connection'
  } finally {
    submitting.value = false
  }
}

onMounted(loadStatus)
</script>
