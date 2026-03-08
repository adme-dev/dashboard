import type { AiMessage, AiContextSource } from '~/types'

interface VoiceResponse {
  message: AiMessage
  contextSources: AiContextSource[]
  transcribedText: string
  audioBase64: string | null
  audioFormat: string | null
  sttLatencyMs: number
}

const MAX_RECORDING_DURATION = 60_000 // 60 seconds

export function useVoiceChat() {
  const isAvailable = ref(true) // assume available until first failure
  const isRecording = ref(false)
  const isProcessing = ref(false)
  const isPlaying = ref(false)
  const volumeLevel = ref(0)
  const error = ref<string | null>(null)

  let mediaStream: MediaStream | null = null
  let mediaRecorder: MediaRecorder | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let animFrameId: number | null = null
  let recordedChunks: Blob[] = []
  let currentAudio: HTMLAudioElement | null = null
  let currentAudioUrl: string | null = null
  let resolveRecording: ((blob: Blob | null) => void) | null = null
  let maxDurationTimer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false

  const SILENCE_THRESHOLD = 0.015
  const SILENCE_TIMEOUT = 1500 // ms

  /** Start recording from microphone. Returns a promise that resolves with the audio blob when stopped. */
  async function startRecording(): Promise<Blob | null> {
    error.value = null
    cancelled = false

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        error.value = 'Please allow microphone access to use voice input.'
      } else if (err.name === 'NotFoundError') {
        error.value = 'No microphone found.'
      } else {
        error.value = 'Could not access microphone.'
      }
      return null
    }

    // Set up volume monitoring
    try {
      audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(mediaStream)
      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      monitorVolume()
    } catch {
      // Volume monitoring is optional — continue without it
    }

    // Determine supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm'

    recordedChunks = []
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType })

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data)
      }
    }

    return new Promise<Blob | null>((resolve) => {
      resolveRecording = resolve

      mediaRecorder!.onstop = () => {
        // If already resolved by cancelRecording, skip
        if (!resolveRecording) return

        const blob = recordedChunks.length > 0 && !cancelled
          ? new Blob(recordedChunks, { type: mimeType })
          : null
        cleanup()
        resolveRecording = null
        resolve(blob)
      }

      mediaRecorder!.start(250) // collect in 250ms chunks
      isRecording.value = true

      // Auto-stop after max duration
      maxDurationTimer = setTimeout(() => {
        if (isRecording.value) stopRecording()
      }, MAX_RECORDING_DURATION)
    })
  }

  /** Stop recording manually */
  function stopRecording() {
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = null
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    isRecording.value = false
  }

  /** Cancel recording without processing */
  function cancelRecording() {
    cancelled = true
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = null
    }

    // Null out resolveRecording before stopping, so onstop handler knows not to resolve
    const pendingResolve = resolveRecording
    resolveRecording = null

    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop() // will fire onstop, but resolveRecording is null so it skips
    }

    isRecording.value = false
    cleanup()

    // Resolve the pending promise with null
    if (pendingResolve) {
      pendingResolve(null)
    }
  }

  /** Send voice audio to the API */
  async function sendVoiceMessage(
    conversationId: string,
    audioBlob: Blob,
    entities?: Array<{ type: string; id: string }>
  ): Promise<VoiceResponse> {
    isProcessing.value = true
    error.value = null

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob)
      if (entities && entities.length > 0) {
        formData.append('mentionedEntities', JSON.stringify(entities))
      }

      const result = await $fetch<VoiceResponse>(
        `/api/agency/ai/chat/conversations/${conversationId}/voice`,
        {
          method: 'POST',
          body: formData,
        }
      )

      return result
    } catch (err: any) {
      const status = err?.response?.status || err?.statusCode
      if (status === 422) {
        error.value = 'Could not understand. Try again or type your message.'
        isAvailable.value = true // STT worked, just no speech detected
      } else if (status === 429) {
        error.value = 'Too many messages. Please wait a moment.'
      } else {
        error.value = 'Voice processing failed. Try typing instead.'
        if (status === 500) {
          isAvailable.value = false
        }
      }
      throw err
    } finally {
      isProcessing.value = false
    }
  }

  /** Play audio from base64 */
  async function playAudio(base64: string, format: string = 'wav'): Promise<void> {
    stopAudio()

    return new Promise<void>((resolve) => {
      const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
      }
      const mimeType = mimeMap[format] || `audio/${format}`

      // Use Blob URL instead of data URL for better memory efficiency
      const byteChars = atob(base64)
      const byteArray = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i)
      }
      const blob = new Blob([byteArray], { type: mimeType })
      currentAudioUrl = URL.createObjectURL(blob)

      currentAudio = new Audio(currentAudioUrl)
      isPlaying.value = true

      const done = () => {
        revokeAudioUrl()
        isPlaying.value = false
        currentAudio = null
        resolve()
      }

      currentAudio.onended = done
      currentAudio.onerror = done

      currentAudio.play().catch(done)
    })
  }

  /** Stop audio playback */
  function stopAudio() {
    if (currentAudio) {
      currentAudio.onended = null
      currentAudio.onerror = null
      currentAudio.pause()
      currentAudio.currentTime = 0
      currentAudio = null
    }
    revokeAudioUrl()
    isPlaying.value = false
  }

  /** Revoke Blob URL to free memory */
  function revokeAudioUrl() {
    if (currentAudioUrl) {
      URL.revokeObjectURL(currentAudioUrl)
      currentAudioUrl = null
    }
  }

  /** Monitor microphone volume for visual feedback + silence detection */
  function monitorVolume() {
    if (!analyser) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    let silenceStart: number | null = null

    function tick() {
      if (!analyser || !isRecording.value) {
        volumeLevel.value = 0
        return
      }

      analyser.getByteFrequencyData(dataArray)

      // Calculate RMS volume (0-1)
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = dataArray[i] / 255
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / dataArray.length)
      volumeLevel.value = rms

      // Silence detection
      if (rms < SILENCE_THRESHOLD) {
        if (silenceStart === null) {
          silenceStart = Date.now()
        } else if (Date.now() - silenceStart > SILENCE_TIMEOUT) {
          stopRecording()
          return
        }
      } else {
        silenceStart = null
      }

      animFrameId = requestAnimationFrame(tick)
    }

    tick()
  }

  /** Clean up all recording resources */
  function cleanup() {
    if (maxDurationTimer) {
      clearTimeout(maxDurationTimer)
      maxDurationTimer = null
    }
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop())
      mediaStream = null
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {})
      audioContext = null
    }
    analyser = null
    mediaRecorder = null
    volumeLevel.value = 0
    isRecording.value = false
  }

  // Clean up on unmount
  onUnmounted(() => {
    cleanup()
    stopAudio()
  })

  return {
    isAvailable,
    isRecording,
    isProcessing,
    isPlaying,
    volumeLevel,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    sendVoiceMessage,
    playAudio,
    stopAudio,
  }
}
