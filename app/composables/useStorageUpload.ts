/**
 * Storage Upload Composable
 *
 * Provides file upload functionality using presigned URLs for direct-to-R2 uploads.
 * Falls back to server-side upload if presigned URL generation fails.
 *
 * Named useStorageUpload to avoid conflict with Nuxt UI's useFileUpload.
 */

type FileCategory = 'avatars' | 'attachments' | 'expenses' | 'briefs' | 'invoices' | 'general'

interface UploadOptions {
  category: FileCategory
  entityId?: string
  entityType?: 'task' | 'expense' | 'brief' | 'invoice' | 'avatar'
  onProgress?: (progress: number) => void
}

interface UploadResult {
  success: boolean
  key?: string
  url?: string
  size?: number
  contentType?: string
  error?: string
}

interface PresignedResponse {
  success: boolean
  uploadUrl: string
  key: string
  expiresIn: number
  maxSize: number
  allowedTypes: string[]
}

interface ConfirmResponse {
  success: boolean
  file: {
    key: string
    url: string
    size: number
    contentType: string
    uploadedAt: string
    uploadedBy: string
  }
}

export function useStorageUpload() {
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string; body?: unknown }
  ) => Promise<T>
  const isUploading = ref(false)
  const uploadProgress = ref(0)
  const error = ref<string | null>(null)

  /**
   * Upload a file using presigned URL (direct to R2)
   */
  async function uploadFile(file: File, options: UploadOptions): Promise<UploadResult> {
    isUploading.value = true
    uploadProgress.value = 0
    error.value = null

    try {
      // Step 1: Get presigned URL
      const presignedResponse = await apiFetch<PresignedResponse>('/api/storage/presigned-upload', {
        method: 'POST',
        body: {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          category: options.category,
          entityId: options.entityId
        }
      })

      if (!presignedResponse.success) {
        throw new Error('Failed to get upload URL')
      }

      // Step 2: Upload directly to R2 using presigned URL
      await uploadToPresignedUrl(presignedResponse.uploadUrl, file, options.onProgress)

      // Step 3: Confirm upload
      const confirmResponse = await apiFetch<ConfirmResponse>('/api/storage/confirm-upload', {
        method: 'POST',
        body: {
          key: presignedResponse.key,
          category: options.category,
          entityId: options.entityId,
          entityType: options.entityType
        }
      })

      if (!confirmResponse.success) {
        throw new Error('Failed to confirm upload')
      }

      uploadProgress.value = 100

      return {
        success: true,
        key: confirmResponse.file.key,
        url: confirmResponse.file.url,
        size: confirmResponse.file.size,
        contentType: confirmResponse.file.contentType
      }
    } catch (err: any) {
      const errorMessage = err.data?.statusMessage || err.message || 'Upload failed'
      error.value = errorMessage
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      isUploading.value = false
    }
  }

  /**
   * Upload file directly to presigned URL
   */
  function uploadToPresignedUrl(
    url: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100)
          uploadProgress.value = progress
          onProgress?.(progress)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'))
      })

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'))
      })

      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.send(file)
    })
  }

  /**
   * Upload a file via server (fallback for non-R2 setups or smaller files)
   */
  async function uploadViaServer(
    file: File,
    endpoint: string,
    additionalFields?: Record<string, string>
  ): Promise<UploadResult> {
    isUploading.value = true
    uploadProgress.value = 0
    error.value = null

    try {
      const formData = new FormData()
      formData.append('file', file)

      if (additionalFields) {
        Object.entries(additionalFields).forEach(([key, value]) => {
          formData.append(key, value)
        })
      }

      // Use XMLHttpRequest for progress tracking
      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100)
            uploadProgress.value = progress
          }
        })

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch {
              resolve({ success: true })
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText)
              reject(new Error(errorData.statusMessage || `Upload failed with status ${xhr.status}`))
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          }
        })

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'))
        })

        xhr.open('POST', endpoint)
        xhr.send(formData)
      })

      uploadProgress.value = 100

      return {
        success: true,
        url: result.fileUrl || result.avatarUrl || result.url,
        key: result.storageKey || result.key,
        size: file.size,
        contentType: file.type
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Upload failed'
      error.value = errorMessage
      return {
        success: false,
        error: errorMessage
      }
    } finally {
      isUploading.value = false
    }
  }

  /**
   * Delete a file from storage
   */
  async function deleteFile(key: string): Promise<{ success: boolean; error?: string }> {
    try {
      await apiFetch(`/api/storage/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      })
      return { success: true }
    } catch (err: any) {
      return {
        success: false,
        error: err.data?.statusMessage || err.message || 'Delete failed'
      }
    }
  }

  /**
   * Validate file before upload
   */
  function validateFile(
    file: File,
    options: {
      maxSize?: number
      allowedTypes?: string[]
    }
  ): { valid: boolean; error?: string } {
    if (options.maxSize && file.size > options.maxSize) {
      const maxSizeMB = Math.round(options.maxSize / (1024 * 1024))
      return {
        valid: false,
        error: `File too large. Maximum size is ${maxSizeMB}MB`
      }
    }

    if (options.allowedTypes && options.allowedTypes.length > 0) {
      if (!options.allowedTypes.includes('*') && !options.allowedTypes.includes(file.type)) {
        return {
          valid: false,
          error: `Invalid file type. Allowed types: ${options.allowedTypes.join(', ')}`
        }
      }
    }

    return { valid: true }
  }

  /**
   * Format file size for display
   */
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  /**
   * Get file icon based on MIME type
   */
  function getFileIcon(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'i-lucide-image'
    if (mimeType.startsWith('video/')) return 'i-lucide-video'
    if (mimeType.startsWith('audio/')) return 'i-lucide-music'
    if (mimeType === 'application/pdf') return 'i-lucide-file-text'
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'i-lucide-file-spreadsheet'
    if (mimeType.includes('document') || mimeType.includes('word')) return 'i-lucide-file-text'
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'i-lucide-presentation'
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return 'i-lucide-archive'
    return 'i-lucide-file'
  }

  return {
    // State
    isUploading: readonly(isUploading),
    uploadProgress: readonly(uploadProgress),
    error: readonly(error),

    // Methods
    uploadFile,
    uploadViaServer,
    deleteFile,
    validateFile,
    formatFileSize,
    getFileIcon
  }
}
