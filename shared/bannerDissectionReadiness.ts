/** Legacy or partial manifests cannot establish that the source lettering was removed. */
export function canImportDissection(manifest: { status?: string, layers?: Array<{ extraction_status?: string }> } | null | undefined): boolean {
  return manifest?.status === 'complete' && !!manifest.layers?.length
    && manifest.layers.every(layer => layer.extraction_status === 'extracted')
}
