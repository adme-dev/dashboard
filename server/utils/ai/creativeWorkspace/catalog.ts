/** Source capability inventory, not a claim of live transport/provider acceptance. */
export const CREATIVE_WORKSPACE_SOURCES = ['banner_assets', 'banner_projects', 'audio_assets', 'video_assets', 'edm_templates'] as const
export type CreativeWorkspaceSource = typeof CREATIVE_WORKSPACE_SOURCES[number]

export function creativeWorkspaceCapabilities() {
  return {
    discovery: {
      tools: ['get_creative_workspace_capabilities', 'search_creative_workspace'],
      scope: 'Current XeroFlow permissions and client scope; metadata only.',
      sources: [...CREATIVE_WORKSPACE_SOURCES],
      fileAccess: false,
      editing: false,
    },
    modules: [
      { id: 'banner_studio', name: 'Banner Studio', integration: 'existing_governed_suite', sources: ['banner_assets', 'banner_projects'] },
      { id: 'video_studio', name: 'Video Studio', integration: 'existing_governed_suite', sources: ['video_assets'] },
      { id: 'audio_studio', name: 'Sound and audio', integration: 'existing_generation_suite', sources: ['audio_assets'] },
      { id: 'edm_builder', name: 'EDM builder', integration: 'metadata_discovery', sources: ['edm_templates'] },
      ...['PhotoFlow', 'VectorFlow', 'EffectFlow', 'FilmFlow', 'SoundFlow', 'FigFlow'].map(name => ({
        id: name.toLowerCase(), name, integration: 'browser_bridge_required', sources: [],
      })),
    ],
    note: 'Existing suite availability depends on the caller’s current tools/list and runtime flags. Browser editing, shared document storage and cross-app handoffs are not enabled by metadata discovery.',
  }
}
