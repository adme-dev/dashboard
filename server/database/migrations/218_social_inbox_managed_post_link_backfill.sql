-- 218_social_inbox_managed_post_link_backfill.sql
-- Backfill managed-post attribution for inbox conversations with source platform post ids.

WITH managed_matches AS (
  SELECT DISTINCT ON (c.id)
    c.id AS conversation_id,
    p.id AS post_id
  FROM social_conversations c
  JOIN social_posts p
    ON p.client_id = c.client_id
  JOIN LATERAL jsonb_each(p.platform_results) AS result(key, value)
    ON TRUE
  WHERE c.linked_social_post_id IS NULL
    AND c.source_post_id IS NOT NULL
    AND COALESCE(result.value->>'platform', split_part(result.key, ':', 1)) = c.platform
    AND result.value->>'platformPostId' = c.source_post_id
  ORDER BY
    c.id,
    p.published_at DESC NULLS LAST,
    p.updated_at DESC NULLS LAST
)
UPDATE social_conversations c
SET linked_social_post_id = managed_matches.post_id,
    updated_at = NOW()
FROM managed_matches
WHERE c.id = managed_matches.conversation_id;
