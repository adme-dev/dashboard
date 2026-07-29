import { computed, onMounted, ref } from 'vue'
import type {
  EmailEndpointClientOption,
  EmailEndpointTeamOption,
  SafeEmailLeadEndpoint
} from '~/utils/emailEndpointUi'

export function useEmailEndpointsManager(onOpenRules: () => void) {
  const toast = useToast()
  const apiFetch = $fetch as <T>(
    request: string,
    options?: { method?: 'GET' | 'PATCH' | 'POST', body?: Record<string, unknown>, query?: Record<string, unknown> }
  ) => Promise<T>

  const clients = ref<EmailEndpointClientOption[]>([])
  const team = ref<EmailEndpointTeamOption[]>([])
  const endpoints = ref<SafeEmailLeadEndpoint[]>([])
  const pending = ref(true)
  const mutationPendingId = ref<string | null>(null)
  const loadError = ref<string | null>(null)
  const forbidden = ref(false)
  const selectedClient = ref('all')
  const selectedStatus = ref('all')
  const showSlideover = ref(false)
  const editingEndpoint = ref<SafeEmailLeadEndpoint | null>(null)
  const rotationTarget = ref<SafeEmailLeadEndpoint | null>(null)
  const retirementTarget = ref<SafeEmailLeadEndpoint | null>(null)
  const showRotationModal = ref(false)
  const showRetirementModal = ref(false)
  let refreshEpoch = 0

  const clientOptions = computed(() => [
    { value: 'all', label: 'All clients' },
    ...clients.value.map(client => ({ value: client.id, label: client.name }))
  ])
  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'enabled', label: 'Enabled' },
    { value: 'disabled', label: 'Disabled' },
    { value: 'attention', label: 'Needs attention' },
    { value: 'retired', label: 'Retired' }
  ]
  const clientNameById = computed(() => new Map(
    clients.value.map(client => [client.id, client.name])
  ))
  const filteredEndpoints = computed(() => endpoints.value.filter((endpoint) => {
    if (selectedClient.value !== 'all' && endpoint.client_id !== selectedClient.value) return false
    if (selectedStatus.value === 'enabled') return endpoint.enabled && !endpoint.retired_at
    if (selectedStatus.value === 'disabled') return !endpoint.enabled && !endpoint.retired_at
    if (selectedStatus.value === 'attention') {
      return endpoint.consecutive_failures > 0
        || endpoint.non_terminal_count > 0
        || endpoint.exhausted_recovery_count > 0
    }
    if (selectedStatus.value === 'retired') return Boolean(endpoint.retired_at)
    return true
  }))

  function errorStatus(error: unknown) {
    const candidate = error as {
      statusCode?: number
      status?: number
      data?: { statusCode?: number }
    } | null
    return candidate?.statusCode ?? candidate?.status ?? candidate?.data?.statusCode ?? null
  }

  function errorMessage(error: unknown) {
    const candidate = error as {
      data?: { statusMessage?: string }
      statusMessage?: string
      message?: string
    } | null
    return candidate?.data?.statusMessage
      ?? candidate?.statusMessage
      ?? candidate?.message
      ?? 'Please retry.'
  }

  async function refresh() {
    const epoch = ++refreshEpoch
    pending.value = true
    loadError.value = null
    forbidden.value = false
    try {
      const [endpointResult, teamResult] = await Promise.allSettled([
        apiFetch<{
          items: SafeEmailLeadEndpoint[]
          clients: EmailEndpointClientOption[]
        }>('/api/leads/email-endpoints', { method: 'GET' }),
        apiFetch<{ members: EmailEndpointTeamOption[] }>('/api/agency/team-members')
      ])
      if (epoch !== refreshEpoch) return
      if (teamResult.status === 'fulfilled') {
        team.value = teamResult.value.members ?? []
      }
      if (endpointResult.status === 'fulfilled') {
        clients.value = endpointResult.value.clients
        endpoints.value = endpointResult.value.items
        if (teamResult.status === 'rejected') {
          toast.add({
            title: 'Team options unavailable',
            description: `${errorMessage(teamResult.reason)} Existing endpoint data is still current.`,
            color: 'warning'
          })
        }
      } else if (errorStatus(endpointResult.reason) === 403) {
        forbidden.value = true
        clients.value = []
        team.value = []
        endpoints.value = []
      } else {
        loadError.value = errorMessage(endpointResult.reason)
      }
    } finally {
      if (epoch === refreshEpoch) pending.value = false
    }
  }

  function replaceEndpoint(endpoint: SafeEmailLeadEndpoint) {
    const index = endpoints.value.findIndex(item => item.id === endpoint.id)
    if (index === -1) endpoints.value.unshift(endpoint)
    else endpoints.value[index] = endpoint
  }

  async function patchEndpoint(
    endpoint: SafeEmailLeadEndpoint,
    body: Record<string, unknown>,
    successTitle: string
  ): Promise<boolean> {
    if (mutationPendingId.value) return false
    mutationPendingId.value = endpoint.id
    try {
      const response = await apiFetch<{ endpoint: SafeEmailLeadEndpoint }>(
        `/api/leads/email-endpoints/${endpoint.id}`,
        { method: 'PATCH', body }
      )
      replaceEndpoint(response.endpoint)
      toast.add({ title: successTitle, description: response.endpoint.email_address, color: 'success' })
      return true
    } catch (error) {
      toast.add({ title: 'Endpoint update failed', description: errorMessage(error), color: 'error' })
      return false
    } finally {
      mutationPendingId.value = null
    }
  }

  async function copyAddress(endpoint: SafeEmailLeadEndpoint) {
    try {
      await navigator.clipboard.writeText(endpoint.email_address)
      toast.add({ title: 'Address copied', description: endpoint.email_address, color: 'success' })
    } catch {
      toast.add({ title: 'Copy failed', description: 'Copy the address manually from the table.', color: 'error' })
    }
  }

  function openCreate() {
    editingEndpoint.value = null
    showSlideover.value = true
  }
  function openEdit(endpoint: SafeEmailLeadEndpoint) {
    editingEndpoint.value = endpoint
    showSlideover.value = true
  }
  function requestRotation(endpoint: SafeEmailLeadEndpoint) {
    rotationTarget.value = endpoint
    showRotationModal.value = true
  }
  function requestRetirement(endpoint: SafeEmailLeadEndpoint) {
    retirementTarget.value = endpoint
    showRetirementModal.value = true
  }
  function openRules() {
    showSlideover.value = false
    onOpenRules()
  }

  async function toggleEndpoint(endpoint: SafeEmailLeadEndpoint) {
    await patchEndpoint(
      endpoint,
      { enabled: !endpoint.enabled },
      endpoint.enabled ? 'Email address disabled' : 'Email address enabled'
    )
  }

  async function rotateEndpoint() {
    const endpoint = rotationTarget.value
    if (!endpoint || mutationPendingId.value) return
    mutationPendingId.value = endpoint.id
    try {
      const response = await apiFetch<{ endpoint: SafeEmailLeadEndpoint }>(
        `/api/leads/email-endpoints/${endpoint.id}/rotate`,
        { method: 'POST' }
      )
      replaceEndpoint(response.endpoint)
      showRotationModal.value = false
      toast.add({
        title: 'Email address rotated',
        description: 'The previous address remains valid for 24 hours.',
        color: 'success'
      })
    } catch (error) {
      toast.add({ title: 'Rotation failed', description: errorMessage(error), color: 'error' })
    } finally {
      mutationPendingId.value = null
    }
  }

  async function retireEndpoint() {
    const endpoint = retirementTarget.value
    if (endpoint && await patchEndpoint(endpoint, { retire: true }, 'Email address retired')) {
      showRetirementModal.value = false
    }
  }

  onMounted(refresh)

  return {
    clients, team, pending, mutationPendingId, loadError, forbidden,
    selectedClient, selectedStatus, showSlideover, editingEndpoint,
    rotationTarget, retirementTarget, showRotationModal, showRetirementModal,
    clientOptions, statusOptions, clientNameById, filteredEndpoints,
    refresh, replaceEndpoint, copyAddress, openCreate, openEdit, toggleEndpoint,
    requestRotation, requestRetirement, openRules, rotateEndpoint, retireEndpoint
  }
}
