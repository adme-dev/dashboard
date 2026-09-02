export interface PageStudioReleaseMetadata {
  defaultLocale: string
  theme: Record<string, unknown>
  navigation: Record<string, unknown>
  footer: Record<string, unknown>
  seoDefaults: Record<string, unknown>
  integrations: Record<string, unknown>
}

export class PageStudioReleaseMetadataError extends Error {
  readonly code = 'INVALID_RELEASE_METADATA'

  constructor(message: string) {
    super(message)
    this.name = 'PageStudioReleaseMetadataError'
  }
}

function objectValue(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PageStudioReleaseMetadataError(`${field} must be an object`)
  }
  return structuredClone(value as Record<string, unknown>)
}

export function derivePageStudioReleaseMetadata(manifest: unknown): PageStudioReleaseMetadata {
  const root = objectValue(manifest, 'manifest')
  if (root.schemaVersion !== 2) {
    throw new PageStudioReleaseMetadataError('Only Page Studio manifest schema version 2 can be published')
  }
  if (typeof root.defaultLocale !== 'string' || !root.defaultLocale.trim() || root.defaultLocale.length > 35) {
    throw new PageStudioReleaseMetadataError('manifest.defaultLocale is invalid')
  }

  const shell = objectValue(root.shell, 'manifest.shell')
  const seo = objectValue(root.seo, 'manifest.seo')
  const theme = objectValue(root.theme, 'manifest.theme')
  const navigation = objectValue(shell.navigation, 'manifest.shell.navigation')
  const footer = objectValue(shell.footer, 'manifest.shell.footer')
  const integrations = root.integrations === undefined
    ? {}
    : objectValue(root.integrations, 'manifest.integrations')

  const serialized = JSON.stringify({ shell, seo, theme, integrations })
  if (serialized.length > 1_000_000) {
    throw new PageStudioReleaseMetadataError('Manifest-derived release metadata exceeds the 1 MB limit')
  }

  return {
    defaultLocale: root.defaultLocale.trim(),
    theme,
    navigation,
    footer,
    seoDefaults: seo,
    integrations
  }
}
