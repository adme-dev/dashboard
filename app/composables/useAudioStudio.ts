import type { AudioAsset } from '~/types'

export function useAudioStudio() {
  const generating = ref(false)
  const toast = useToast()

  async function generateVoiceover(payload: {
    text: string
    title?: string
    clientId?: string | null
    lang?: string
    channels?: string[]
  }): Promise<AudioAsset | null> {
    generating.value = true
    try {
      const res = await $fetch<{ asset: AudioAsset, violations: string[] }>(
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
    return useFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', {
      query: { kind: 'voiceover' },
      default: () => ({ assets: [] })
    })
  }

  return { generating, generateVoiceover, listVoiceovers }
}
