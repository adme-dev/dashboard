import { z } from 'zod'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'
import type { StoryboardApplicationReceipt } from '~~/server/utils/video-storyboard/apply'
import { apiErrorStatus } from '~~/app/utils/apiError'

export interface StoryboardApplyBody {
  operationId: string
  revisionId: string
  expectedTimelineId: string
  expectedEditRevision: number
  replaceConfirmed: boolean
}
const PendingCacheSchema = z.object({
  projectId: z.string().min(1),
  body: z.object({ operationId: z.string().min(1), revisionId: z.string().min(1), expectedTimelineId: z.string().min(1),
    expectedEditRevision: z.number().int().nonnegative(), replaceConfirmed: z.boolean() }).strict(),
  before: TimelineStateSchema
}).strict()
interface EditorBoundary {
  begin(): Promise<{ beforeState: TimelineState, expectedTimelineId: string, expectedEditRevision: number }>
  adopt(receipt: StoryboardApplicationReceipt, before: TimelineState): void | Promise<void>
  release(): void
  resume?(): Promise<void>
}
/** Unknown outcomes retain the original request and edit lock until receipt recovery.
 * A missing receipt is not evidence that a concurrent request cannot still commit. */
export function createStoryboardApplication(projectId: string, editor: EditorBoundary, transport: {
  apply(body: StoryboardApplyBody): Promise<StoryboardApplicationReceipt>
  recover(id: string): Promise<StoryboardApplicationReceipt | null>
}, uuid: () => string = () => crypto.randomUUID(), storage?: { read(): string | null, write(value: string | null): void }) {
  let pending: { body: StoryboardApplyBody, before: TimelineState } | null = null
  let resumed = true
  try {
    const saved = storage?.read()
    if (saved) {
      const parsed = PendingCacheSchema.safeParse(JSON.parse(saved))
      if (parsed.success && parsed.data.projectId === projectId) {
        pending = { body: parsed.data.body, before: parsed.data.before }
        resumed = false
      } else storage?.write(null)
    }
  } catch {
    try {
      storage?.write(null)
    } catch { /* unavailable browser storage */ }
  }
  function persist() {
    try {
      storage?.write(pending ? JSON.stringify({ projectId, ...pending }) : null)
    } catch { /* private mode */ }
  }
  async function resume() {
    if (!resumed) {
      await editor.resume?.()
      resumed = true
    }
  }
  let running = false
  const adopted = new Set<string>()
  async function accept(receipt: StoryboardApplicationReceipt) {
    if (adopted.has(receipt.operationId)) return receipt
    if (!pending || receipt.projectId !== projectId || receipt.operationId !== pending.body.operationId
      || receipt.before.timelineId !== pending.body.expectedTimelineId || receipt.before.editRevision !== pending.body.expectedEditRevision) {
      throw new Error('Application receipt does not match this edit. Recover the saved timeline before continuing.')
    }
    await editor.adopt(receipt, pending.before)
    adopted.add(receipt.operationId)
    pending = null
    persist()
    editor.release()
    return receipt
  }
  async function recover() {
    if (!pending) return null
    await resume()
    const receipt = await transport.recover(pending.body.operationId)
    return receipt ? accept(receipt) : null
  }
  async function apply(revisionId: string, replaceConfirmed: boolean) {
    if (running) throw new Error('Application is already running')
    if (pending && (pending.body.revisionId !== revisionId || pending.body.replaceConfirmed !== replaceConfirmed)) throw new Error('Recover the pending application before changing the request')
    running = true
    try {
      await resume()
      if (!pending) {
        const snapshot = await editor.begin()
        pending = { before: snapshot.beforeState, body: { operationId: uuid(), revisionId, replaceConfirmed,
          expectedTimelineId: snapshot.expectedTimelineId, expectedEditRevision: snapshot.expectedEditRevision } }
        persist()
      }
      try {
        return await accept(await transport.apply(pending.body))
      } catch (error) {
        const status = apiErrorStatus(error)
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          pending = null
          persist()
          editor.release()
          throw error
        }
        try {
          const receipt = await recover()
          if (receipt) return receipt
        } catch { /* preserve original ambiguous failure */ }
        throw error
      }
    } finally { running = false }
  }
  return { apply, recover, retry: () => {
    if (!pending) throw new Error('No application to retry')
    return apply(pending.body.revisionId, pending.body.replaceConfirmed)
  }, pendingOperation: () => pending?.body.operationId ?? null }
}
