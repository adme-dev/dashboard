import { ref } from 'vue'

export interface VideoGenerationJobView {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked'
  mode: string
  modelId: string
  prompt: string
  sourceAssetIds: string[]
  durationSeconds: number
  aspectRatio: string
  resolution: string | null
  subjectType: 'vehicle' | 'non_vehicle' | 'unknown'
  outputAssetId: string | null
  outputR2Key: string | null
  errorMessage: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export function useVideoGenerationJobs(projectId: string) {
  const jobs = ref<VideoGenerationJobView[]>([])
  let timer: ReturnType<typeof setTimeout> | null = null
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { query?: Record<string, unknown> }
  ) => Promise<T>

  async function refresh() {
    try {
      const res = await apiFetch<{ jobs: VideoGenerationJobView[] }>(`/api/agency/video/generation/jobs`, { query: { projectId } })
      jobs.value = res?.jobs ?? []
    } catch { /* surfaced via UI emptiness */ }
  }

  function schedule() {
    if (timer) clearTimeout(timer)
    const active = jobs.value.some((j) => j.status === 'queued' || j.status === 'running')
    if (!active) return
    timer = setTimeout(async () => { await refresh(); schedule() }, 2500)
  }

  async function start() { await refresh(); schedule() }
  function stop() { if (timer) clearTimeout(timer); timer = null }

  return { jobs, refresh, start, stop }
}
