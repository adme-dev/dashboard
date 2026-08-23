// God mode families for the Audio / Video Studio routes that hand work to an
// external provider — render (Queues), media upload (R2), AI generation (AI
// Gateway). These use the execution-ledger protocol, not a DB transaction.
// DB-only editing routes live in ./godModeMutations.ts.
import type { H3Event } from 'h3'

import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'
import {
  defaultExternalLedgerDependencies,
  executeGodModeExternalMutation,
  prepareGodModeExternalMutation,
  type GodModeExternalMutation,
  type GodModeExternalRun
} from '~~/server/utils/godMode/externalLedgerCoordinator'

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const RENDER_ROUTE = new RegExp(`^/api/agency/audio/projects/${UUID}/render-video$`, 'i')
const UPLOAD_ROUTE = new RegExp(`^/api/agency/audio/projects/${UUID}/upload-media$`, 'i')
const GENERATION_ROUTE = '/api/agency/video/generation/jobs'

export const MEDIA_RENDER_MUTATION: GodModeExternalMutation = {
  label: 'video render',
  coordinationKey: Symbol('godModeMediaRender')
}
export const MEDIA_UPLOAD_MUTATION: GodModeExternalMutation = {
  label: 'media upload',
  coordinationKey: Symbol('godModeMediaUpload')
}
export const VIDEO_GENERATION_MUTATION: GodModeExternalMutation = {
  label: 'video generation',
  coordinationKey: Symbol('godModeVideoGeneration')
}

// Uploads are multipart: digesting the file bytes would be slow and pointless —
// the Idempotency-Key alone identifies the attempt.
const uploadDependencies = {
  ...defaultExternalLedgerDependencies,
  digestRequest: async () => await digestMcpRequestBody({ multipart: true })
}

export function isMediaRenderPath(path: string): boolean { return RENDER_ROUTE.test(path) }
export function isMediaUploadPath(path: string): boolean { return UPLOAD_ROUTE.test(path) }
export function isVideoGenerationPath(path: string): boolean { return path === GENERATION_ROUTE }

export function executeGodModeMediaRender<T>(event: H3Event, work: (run: GodModeExternalRun<T>) => Promise<T>) {
  return executeGodModeExternalMutation(event, MEDIA_RENDER_MUTATION, 1, work)
}
export function executeGodModeMediaUpload<T>(event: H3Event, work: (run: GodModeExternalRun<T>) => Promise<T>) {
  return executeGodModeExternalMutation(event, MEDIA_UPLOAD_MUTATION, 1, work)
}
export function executeGodModeVideoGeneration<T>(event: H3Event, work: (run: GodModeExternalRun<T>) => Promise<T>) {
  return executeGodModeExternalMutation(event, VIDEO_GENERATION_MUTATION, 1, work)
}

export function registerGodModeMediaExternalMutationFamilies(): () => void {
  const unregisters = [
    registerGodModeMutationFamily({
      family: 'media-render-video',
      method: 'POST',
      matchesPath: isMediaRenderPath,
      prepare: event => prepareGodModeExternalMutation(event, MEDIA_RENDER_MUTATION)
    }),
    registerGodModeMutationFamily({
      family: 'media-upload',
      method: 'POST',
      matchesPath: isMediaUploadPath,
      prepare: event => prepareGodModeExternalMutation(event, MEDIA_UPLOAD_MUTATION, uploadDependencies)
    }),
    registerGodModeMutationFamily({
      family: 'video-generation-job',
      method: 'POST',
      matchesPath: isVideoGenerationPath,
      prepare: event => prepareGodModeExternalMutation(event, VIDEO_GENERATION_MUTATION)
    })
  ]
  return () => { for (const unregister of unregisters.reverse()) unregister() }
}
