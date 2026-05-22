export interface UseMediaDevicesOptions {
  initialAudio?: boolean
  initialVideo?: boolean
}

export function useMediaDevices(opts: UseMediaDevicesOptions = {}) {
  const audioInputs = ref<MediaDeviceInfo[]>([])
  const videoInputs = ref<MediaDeviceInfo[]>([])
  const audioOutputs = ref<MediaDeviceInfo[]>([])
  const selectedAudioId = ref<string | null>(null)
  const selectedVideoId = ref<string | null>(null)
  const permissionDenied = ref(false)

  const enabledAudio = ref(opts.initialAudio ?? true)
  const enabledVideo = ref(opts.initialVideo ?? true)

  const devices = useDevicesList({
    requestPermissions: true,
    constraints: { audio: true, video: true },
  })

  // Sync device lists and auto-select the first available device when
  // the enumeration populates (or changes — e.g. plug/unplug).
  watchEffect(() => {
    audioInputs.value = devices.audioInputs.value
    videoInputs.value = devices.videoInputs.value
    audioOutputs.value = devices.audioOutputs.value
    if (!selectedAudioId.value && audioInputs.value[0]) {
      selectedAudioId.value = audioInputs.value[0].deviceId
    }
    if (!selectedVideoId.value && videoInputs.value[0]) {
      selectedVideoId.value = videoInputs.value[0].deviceId
    }
  })

  const userMedia = useUserMedia({
    constraints: computed(() => ({
      audio: enabledAudio.value
        ? selectedAudioId.value
          ? { deviceId: { exact: selectedAudioId.value } }
          : true
        : false,
      video: enabledVideo.value
        ? selectedVideoId.value
          ? { deviceId: { exact: selectedVideoId.value } }
          : true
        : false,
    })),
    enabled: computed(() => enabledAudio.value || enabledVideo.value),
    autoSwitch: true,
  })

  // Track permission-denied state: stream is null while the user wanted media.
  watch(
    () => userMedia.stream.value,
    (stream) => {
      if (stream === null && (enabledAudio.value || enabledVideo.value)) {
        permissionDenied.value = true
      } else if (stream) {
        permissionDenied.value = false
      }
    },
  )

  function toggleMic() {
    enabledAudio.value = !enabledAudio.value
  }

  function toggleCam() {
    enabledVideo.value = !enabledVideo.value
  }

  function selectMic(deviceId: string) {
    selectedAudioId.value = deviceId
  }

  function selectCam(deviceId: string) {
    selectedVideoId.value = deviceId
  }

  function stop() {
    userMedia.stop()
  }

  return {
    stream: userMedia.stream,
    audioInputs,
    videoInputs,
    audioOutputs,
    selectedAudioId,
    selectedVideoId,
    enabledAudio,
    enabledVideo,
    permissionDenied,
    toggleMic,
    toggleCam,
    selectMic,
    selectCam,
    stop,
  }
}
