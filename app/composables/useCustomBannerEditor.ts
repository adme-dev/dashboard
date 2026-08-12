import type { CustomTemplateVariable } from '~/types/banner-studio'
import { buildCustomBannerPreviewHTML } from '~/utils/custom-banner-builder'

interface InstanceData {
  id: string
  templateId: string
  templateName: string
  templateCategory: string
  name: string
  htmlOverride: string | null
  cssOverride: string | null
  jsOverride: string | null
  variableValues: Record<string, string>
  width: number | null
  height: number | null
  publishedUrl: string | null
  isPublished: boolean
  clickUrl: string | null
  impressionPixel: string | null
  clickPixel: string | null
  // Template fields
  templateHtml: string
  templateCss: string
  templateJs: string
  templateVariables: CustomTemplateVariable[]
  templateWidth: number
  templateHeight: number
  templateExternalScripts: string[]
  templateExternalStyles: string[]
}

export function useCustomBannerEditor(instanceId: string) {
  const toast = useToast()
  const loading = ref(true)
  const saving = ref(false)
  const publishing = ref(false)
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string, body?: unknown }
  ) => Promise<T>

  // Instance + template data
  const instance = ref<InstanceData | null>(null)

  // Editable state
  const instanceName = ref('')
  const variableValues = ref<Record<string, string>>({})
  const htmlOverride = ref<string | null>(null)
  const cssOverride = ref<string | null>(null)
  const jsOverride = ref<string | null>(null)
  const width = ref(300)
  const height = ref(250)
  const clickUrl = ref('')
  const impressionPixel = ref('')
  const clickPixel = ref('')

  // Template reference (read-only)
  const templateVariables = ref<CustomTemplateVariable[]>([])
  const templateHtml = ref('')
  const templateCss = ref('')
  const templateJs = ref('')
  const externalScripts = ref<string[]>([])
  const externalStyles = ref<string[]>([])

  // Effective code (override ?? template)
  const effectiveHtml = computed(() => htmlOverride.value ?? templateHtml.value)
  const effectiveCss = computed(() => cssOverride.value ?? templateCss.value)
  const effectiveJs = computed(() => jsOverride.value ?? templateJs.value)

  // Variable defaults map
  const variableDefaults = computed(() => {
    const map: Record<string, string> = {}
    for (const v of templateVariables.value) {
      map[v.name] = v.default || ''
    }
    return map
  })

  // Preview options (toggled by consuming page)
  const includeGsap = ref(true)
  const enableConsoleRelay = ref(true)

  // Preview HTML (debounced by consumer)
  const previewHtml = computed(() => {
    return buildCustomBannerPreviewHTML({
      html: effectiveHtml.value,
      css: effectiveCss.value,
      js: effectiveJs.value,
      width: width.value,
      height: height.value,
      variableValues: variableValues.value,
      variableDefaults: variableDefaults.value,
      externalScripts: externalScripts.value,
      externalStyles: externalStyles.value,
      includeGsap: includeGsap.value,
      enableConsoleRelay: enableConsoleRelay.value,
    })
  })

  const isDirty = computed(() => {
    if (!instance.value) return false
    return (
      instanceName.value !== instance.value.name ||
      htmlOverride.value !== instance.value.htmlOverride ||
      cssOverride.value !== instance.value.cssOverride ||
      jsOverride.value !== instance.value.jsOverride ||
      JSON.stringify(variableValues.value) !== JSON.stringify(instance.value.variableValues) ||
      width.value !== (instance.value.width || instance.value.templateWidth) ||
      height.value !== (instance.value.height || instance.value.templateHeight)
    )
  })

  async function load() {
    loading.value = true
    try {
      const data = await apiFetch<InstanceData>(
        `/api/agency/banner-studio/custom-instances/${instanceId}`,
      )
      instance.value = data

      // Populate editable state
      instanceName.value = data.name
      variableValues.value = typeof data.variableValues === 'string'
        ? JSON.parse(data.variableValues) : { ...data.variableValues }
      htmlOverride.value = data.htmlOverride
      cssOverride.value = data.cssOverride
      jsOverride.value = data.jsOverride
      width.value = data.width || data.templateWidth
      height.value = data.height || data.templateHeight
      clickUrl.value = data.clickUrl || ''
      impressionPixel.value = data.impressionPixel || ''
      clickPixel.value = data.clickPixel || ''

      // Template data
      templateVariables.value = typeof data.templateVariables === 'string'
        ? JSON.parse(data.templateVariables) : (data.templateVariables || [])
      templateHtml.value = data.templateHtml || ''
      templateCss.value = data.templateCss || ''
      templateJs.value = data.templateJs || ''
      externalScripts.value = data.templateExternalScripts || []
      externalStyles.value = data.templateExternalStyles || []
    } catch (err: any) {
      toast.add({ title: 'Error loading instance', description: err.data?.statusMessage || 'Failed', color: 'error' })
    } finally {
      loading.value = false
    }
  }

  async function save() {
    saving.value = true
    try {
      await apiFetch(`/api/agency/banner-studio/custom-instances/${instanceId}`, {
        method: 'PATCH',
        body: {
          name: instanceName.value,
          htmlOverride: htmlOverride.value,
          cssOverride: cssOverride.value,
          jsOverride: jsOverride.value,
          variableValues: variableValues.value,
          width: width.value,
          height: height.value,
          clickUrl: clickUrl.value || null,
          impressionPixel: impressionPixel.value || null,
          clickPixel: clickPixel.value || null,
        },
      })
      // Update snapshot so isDirty resets
      if (instance.value) {
        instance.value.name = instanceName.value
        instance.value.htmlOverride = htmlOverride.value
        instance.value.cssOverride = cssOverride.value
        instance.value.jsOverride = jsOverride.value
        instance.value.variableValues = { ...variableValues.value }
        instance.value.width = width.value
        instance.value.height = height.value
      }
      toast.add({ title: 'Saved', color: 'success' })
    } catch (err: any) {
      toast.add({ title: 'Save failed', description: err.data?.statusMessage || 'Error', color: 'error' })
    } finally {
      saving.value = false
    }
  }

  async function publish() {
    publishing.value = true
    try {
      const result = await apiFetch<{ publishedUrl: string; isPublished: boolean }>(
        `/api/agency/banner-studio/custom-instances/${instanceId}/publish`,
        {
          method: 'POST',
          body: {
            clickUrl: clickUrl.value || null,
            impressionPixel: impressionPixel.value || null,
            clickPixel: clickPixel.value || null,
          },
        },
      )
      if (instance.value) {
        instance.value.publishedUrl = result.publishedUrl
        instance.value.isPublished = true
      }
      toast.add({ title: 'Published', description: 'Banner is live', color: 'success' })
      return result
    } catch (err: any) {
      toast.add({ title: 'Publish failed', description: err.data?.statusMessage || 'Error', color: 'error' })
      return null
    } finally {
      publishing.value = false
    }
  }

  const savingAsTemplate = ref(false)

  async function saveAsTemplate(opts?: { name?: string; category?: string; description?: string }) {
    savingAsTemplate.value = true
    try {
      const result = await apiFetch<{ id: string; name: string; category: string }>(
        `/api/agency/banner-studio/custom-instances/${instanceId}/save-as-template`,
        {
          method: 'POST',
          body: {
            name: opts?.name || instanceName.value,
            category: opts?.category || instance.value?.templateCategory,
            description: opts?.description || null,
          },
        },
      )
      toast.add({ title: 'Template saved', description: `"${result.name}" added to template library`, color: 'success' })
      return result
    } catch (err: any) {
      toast.add({ title: 'Save as template failed', description: err.data?.statusMessage || 'Error', color: 'error' })
      return null
    } finally {
      savingAsTemplate.value = false
    }
  }

  function resetCodeToTemplate() {
    htmlOverride.value = null
    cssOverride.value = null
    jsOverride.value = null
  }

  function resetVariablesToDefaults() {
    const defaults: Record<string, string> = {}
    for (const v of templateVariables.value) {
      defaults[v.name] = v.default || ''
    }
    variableValues.value = defaults
  }

  return {
    loading,
    saving,
    publishing,
    instance,
    instanceName,
    variableValues,
    htmlOverride,
    cssOverride,
    jsOverride,
    width,
    height,
    clickUrl,
    impressionPixel,
    clickPixel,
    templateVariables,
    templateHtml,
    templateCss,
    templateJs,
    externalScripts,
    externalStyles,
    effectiveHtml,
    effectiveCss,
    effectiveJs,
    variableDefaults,
    includeGsap,
    enableConsoleRelay,
    previewHtml,
    isDirty,
    load,
    save,
    publish,
    savingAsTemplate,
    saveAsTemplate,
    resetCodeToTemplate,
    resetVariablesToDefaults,
  }
}
