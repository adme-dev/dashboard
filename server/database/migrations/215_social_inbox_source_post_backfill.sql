-- Backfill Engagement Wall source-post projection from existing message metadata.
-- Safe to rerun: only conversations without source-post projection are touched.

WITH source_messages AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.metadata->'sourcePost' AS post
  FROM social_messages m
  JOIN social_conversations c ON c.id = m.conversation_id
  WHERE m.metadata ? 'sourcePost'
    AND jsonb_typeof(m.metadata->'sourcePost') = 'object'
    AND c.source_post_id IS NULL
    AND c.source_post_url IS NULL
    AND c.linked_social_post_id IS NULL
  ORDER BY
    m.conversation_id,
    COALESCE(m.platform_timestamp, m.created_at) DESC,
    m.created_at DESC
)
UPDATE social_conversations c
SET
  source_post_id = COALESCE(NULLIF(source_messages.post->>'id', ''), c.source_post_id),
  source_post_url = COALESCE(NULLIF(source_messages.post->>'permalink', ''), c.source_post_url),
  source_post_title = COALESCE(NULLIF(source_messages.post->>'title', ''), c.source_post_title),
  source_post_content = COALESCE(NULLIF(source_messages.post->>'text', ''), c.source_post_content),
  source_post_media = CASE
    WHEN jsonb_array_length(c.source_post_media) > 0 THEN c.source_post_media
    WHEN NULLIF(source_messages.post->>'imageUrl', '') IS NOT NULL THEN jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'url', NULLIF(source_messages.post->>'imageUrl', ''),
        'type', COALESCE(NULLIF(source_messages.post->>'mediaType', ''), 'image'),
        'thumbnailUrl', NULLIF(source_messages.post->>'thumbnailUrl', '')
      ))
    )
    WHEN NULLIF(source_messages.post->>'thumbnailUrl', '') IS NOT NULL THEN jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object(
        'url', NULLIF(source_messages.post->>'thumbnailUrl', ''),
        'type', COALESCE(NULLIF(source_messages.post->>'mediaType', ''), 'image'),
        'thumbnailUrl', NULLIF(source_messages.post->>'thumbnailUrl', '')
      ))
    )
    ELSE c.source_post_media
  END,
  source_post_author_name = COALESCE(NULLIF(source_messages.post->>'authorName', ''), c.source_post_author_name),
  source_post_author_avatar_url = COALESCE(NULLIF(source_messages.post->>'authorAvatarUrl', ''), c.source_post_author_avatar_url),
  source_post_published_at = COALESCE(
    CASE
      WHEN NULLIF(source_messages.post->>'publishedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        THEN (source_messages.post->>'publishedAt')::timestamptz
      ELSE NULL
    END,
    c.source_post_published_at
  ),
  updated_at = NOW()
FROM source_messages
WHERE c.id = source_messages.conversation_id;
