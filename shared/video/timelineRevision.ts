import { z } from 'zod'

/** Both values identify the edit the caller actually read, not the latest server edit. */
export const TimelineWritePreconditionSchema = z.object({
  expectedTimelineId: z.string().min(1).max(128),
  expectedEditRevision: z.number().int().nonnegative()
})
export type TimelineWritePrecondition = z.infer<typeof TimelineWritePreconditionSchema>
