// server/utils/leads/dispatch.ts
// Inner dispatch loop. The full implementation lands in Phase 1a Task 19;
// this file currently exists as a stub so queue.ts can lazy-import it without
// resolving to undefined. When Task 19 ships, the stub body is replaced.

import type { QueueMessage } from './queue'

export async function handleQueueMessage(_msg: QueueMessage): Promise<void> {
  throw new Error('handleQueueMessage stub: implementation lands in Plan 1a Task 19')
}
