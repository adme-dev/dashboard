// server/utils/socialReporting/store.ts
// Idempotent persistence for Slice 3 metrics. Injected query runner so the upsert SQL is
// unit-testable without a live DB (mirrors socialInbox/store.ts).
//
// Latest-snapshot model: one row per (post, platform) and one per (account, day) — re-polls
// OVERWRITE via ON CONFLICT, so the table always reflects current lifetime totals / today's snapshot.
import type { PostMetric, AccountMetric } from '~~/server/utils/social-providers/types'

export interface DbRunner {
  execute(sql: string, params?: any[]): Promise<number>
}

/** Upsert one post's metrics for a platform (overwrite on re-poll). No-op for an empty metric. */
export async function upsertPostMetric(db: DbRunner, platform: string, m: PostMetric): Promise<void> {
  await db.execute(
    `INSERT INTO social_post_metrics
       (post_id, platform, impressions, reach, engagements, clicks, likes, comments_count,
        shares, saves, video_views, reactions, collected_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW(), NOW())
     ON CONFLICT (post_id, platform) DO UPDATE SET
       impressions = EXCLUDED.impressions, reach = EXCLUDED.reach, engagements = EXCLUDED.engagements,
       clicks = EXCLUDED.clicks, likes = EXCLUDED.likes, comments_count = EXCLUDED.comments_count,
       shares = EXCLUDED.shares, saves = EXCLUDED.saves, video_views = EXCLUDED.video_views,
       reactions = EXCLUDED.reactions, collected_at = NOW(), updated_at = NOW()`,
    [m.postId, platform, m.impressions ?? 0, m.reach ?? 0, m.engagements ?? 0, m.clicks ?? 0,
     m.likes ?? 0, m.commentsCount ?? 0, m.shares ?? 0, m.saves ?? 0, m.videoViews ?? 0, m.reactions ?? 0],
  )
}

/** Upsert today's account snapshot (overwrite if re-polled same day). `snapshotDate` ISO date string. */
export async function upsertAccountMetric(
  db: DbRunner, args: { clientId: string; accountId: string; platform: string; snapshotDate: string; postsCount?: number; metric: AccountMetric },
): Promise<void> {
  const { clientId, accountId, platform, snapshotDate, metric, postsCount } = args
  await db.execute(
    `INSERT INTO social_account_metrics
       (client_id, social_account_id, platform, snapshot_date, followers, reach, impressions, profile_views, posts_count, updated_at)
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9, NOW())
     ON CONFLICT (social_account_id, snapshot_date) DO UPDATE SET
       followers = EXCLUDED.followers, reach = EXCLUDED.reach, impressions = EXCLUDED.impressions,
       profile_views = EXCLUDED.profile_views, posts_count = EXCLUDED.posts_count, updated_at = NOW()`,
    [clientId, accountId, platform, snapshotDate, metric.followers ?? 0, metric.reach ?? 0,
     metric.impressions ?? 0, metric.profileViews ?? 0, postsCount ?? 0],
  )
}
