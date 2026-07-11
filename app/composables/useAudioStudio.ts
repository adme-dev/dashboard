import type { AudioAsset } from '~/types'

export function useAudioStudio() {
  const generating = ref(false)
  const toast = useToast()
  const apiFetch = $fetch as <T = unknown>(request: string, options?: {
    method?: string
    body?: unknown
    query?: Record<string, unknown>
  }) => Promise<T>

  async function generateVoiceover(payload: {
    text: string
    title?: string
    clientId?: string | null
    lang?: string
    channels?: string[]
  }): Promise<AudioAsset | null> {
    generating.value = true
    try {
      const res = await apiFetch<{ asset: AudioAsset, violations: string[] }>(
        '/api/agency/audio/voiceover', { method: 'POST', body: payload }
      )
      if (res.violations?.length) {
        toast.add({ title: 'Mimicry phrasing removed', description: res.violations.join(', '), color: 'warning' })
      }
      toast.add({ title: 'Voiceover ready', color: 'success' })
      return res.asset
    } catch (e: any) {
      toast.add({ title: 'Generation failed', description: e?.data?.statusMessage ?? 'Try again', color: 'error' })
      return null
    } finally {
      generating.value = false
    }
  }

  function listVoiceovers() {
    return listAssets('voiceover')
  }

  /** Kick off async music generation. Returns the queued asset (poll for status)
   * or null on failure (guard 422 / not-enabled 503 / duplicate 409). */
  async function generateMusic(payload: {
    prompt: string
    title?: string
    clientId?: string | null
    isInstrumental?: boolean
    lyrics?: string | null
    format?: 'mp3' | 'wav'
    channels?: string[]
  }): Promise<AudioAsset | null> {
    generating.value = true
    try {
      const res = await apiFetch<{ asset: AudioAsset }>(
        '/api/agency/audio/music/generate', { method: 'POST', body: payload }
      )
      return res.asset
    } catch (e: any) {
      const status = e?.statusCode ?? e?.response?.status
      const violations: string[] | undefined = e?.data?.data?.violations
      toast.add({
        title: status === 422 ? 'Artist mention blocked' : status === 503 ? 'Music not enabled yet' : 'Could not start generation',
        description: violations?.length ? `Remove: ${violations.join(', ')}` : (e?.data?.statusMessage ?? 'Try again'),
        color: status === 422 ? 'warning' : 'error'
      })
      return null
    } finally {
      generating.value = false
    }
  }

  /** Poll a music job once. */
  function fetchMusicStatus(assetId: string) {
    return apiFetch<{ status: AudioAsset['status'], streamUrl: string | null, error: string | null, asset: AudioAsset }>(
      `/api/agency/audio/music/status/${assetId}`
    )
  }

  function listMusic() {
    return listAssets('music')
  }

  function listAssets(kind: 'voiceover' | 'music') {
    const data = ref<{ assets: AudioAsset[] }>({ assets: [] })
    async function refresh() {
      data.value = await apiFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', {
        query: { kind },
      }).catch(() => ({ assets: [] }))
    }
    refresh()
    return { data, refresh }
  }

  return { generating, generateVoiceover, listVoiceovers, generateMusic, fetchMusicStatus, listMusic }
}
