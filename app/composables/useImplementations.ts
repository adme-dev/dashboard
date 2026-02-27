import type { Implementation, ImplementationTask, Comment, Document } from '~/types'

interface ImplementationFilters {
  status?: string
  assigned_to?: string
  search?: string
}

export const useImplementations = () => {
  const implementations = ref<Implementation[]>([])
  const currentImplementation = ref<Implementation | null>(null)
  const tasks = ref<ImplementationTask[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Fetch all implementations
  const fetchImplementations = async (filters?: ImplementationFilters) => {
    isLoading.value = true
    error.value = null
    
    try {
      const queryParams = new URLSearchParams()
      if (filters?.status) queryParams.append('status', filters.status)
      if (filters?.assigned_to) queryParams.append('assigned_to', filters.assigned_to)
      if (filters?.search) queryParams.append('search', filters.search)
      
      const { data } = await $fetch(`/api/implementations?${queryParams}`)
      implementations.value = data
      return data
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch implementations'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Fetch single implementation with details
  const fetchImplementation = async (id: string) => {
    isLoading.value = true
    error.value = null
    
    try {
      const { data } = await $fetch(`/api/implementations/${id}`)
      currentImplementation.value = data
      tasks.value = data.tasks || []
      return data
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch implementation'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  // Update task status
  const updateTaskStatus = async (taskId: string, status: ImplementationTask['status']) => {
    const { data } = await $fetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: { status }
    })
    
    // Update local state
    const taskIndex = tasks.value.findIndex(t => t.id === taskId)
    if (taskIndex !== -1) {
      tasks.value[taskIndex] = { ...tasks.value[taskIndex], ...data }
    }
    
    return data
  }

  // Add comment to task
  const addComment = async (taskId: string, content: string, isInternal: boolean = false) => {
    const { data } = await $fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      body: { content, isInternal }
    })
    return data
  }

  // Upload document
  const uploadDocument = async (implementationId: string, file: File, documentType: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('documentType', documentType)
    
    const { data } = await $fetch(`/api/implementations/${implementationId}/documents`, {
      method: 'POST',
      body: formData
    })
    return data
  }

  // Get status color for UI
  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      'not_started': 'bg-gray-100 text-gray-800',
      'setup_phase': 'bg-yellow-100 text-yellow-800',
      'in_progress': 'bg-blue-100 text-blue-800',
      'review': 'bg-purple-100 text-purple-800',
      'go_live': 'bg-green-100 text-green-800',
      'complete': 'bg-green-200 text-green-900',
      'on_hold': 'bg-red-100 text-red-800'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  // Get task status color
  const getTaskStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      'not_started': 'bg-gray-100 text-gray-800',
      'in_progress': 'bg-blue-100 text-blue-800',
      'blocked': 'bg-red-100 text-red-800',
      'review': 'bg-purple-100 text-purple-800',
      'complete': 'bg-green-100 text-green-800',
      'skipped': 'bg-gray-50 text-gray-500'
    }
    return colors[status] || 'bg-gray-100 text-gray-800'
  }

  // Calculate progress percentage
  const calculateProgress = (completed: number, total: number): number => {
    if (total === 0) return 0
    return Math.round((completed / total) * 100)
  }

  return {
    implementations: readonly(implementations),
    currentImplementation: readonly(currentImplementation),
    tasks: readonly(tasks),
    isLoading: readonly(isLoading),
    error: readonly(error),
    fetchImplementations,
    fetchImplementation,
    updateTaskStatus,
    addComment,
    uploadDocument,
    getStatusColor,
    getTaskStatusColor,
    calculateProgress
  }
}
