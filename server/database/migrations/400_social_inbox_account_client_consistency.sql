-- Keep inbox ownership aligned with the connected social account. A Page can be
-- re-associated with another agency client, but its existing conversations and
-- tenant-scoped child rows must move with it.

BEGIN;

UPDATE social_conversations AS conversation
SET client_id = account.client_id,
    updated_at = NOW()
FROM social_accounts AS account
WHERE conversation.social_account_id = account.id
  AND conversation.client_id IS DISTINCT FROM account.client_id;

UPDATE social_messages AS message
SET client_id = conversation.client_id
FROM social_conversations AS conversation
WHERE message.conversation_id = conversation.id
  AND message.client_id IS DISTINCT FROM conversation.client_id;

UPDATE social_response_queue AS queued_reply
SET client_id = conversation.client_id
FROM social_conversations AS conversation
WHERE queued_reply.conversation_id = conversation.id
  AND queued_reply.client_id IS DISTINCT FROM conversation.client_id;

UPDATE social_conversation_events AS conversation_event
SET client_id = conversation.client_id
FROM social_conversations AS conversation
WHERE conversation_event.conversation_id = conversation.id
  AND conversation_event.client_id IS DISTINCT FROM conversation.client_id;

CREATE OR REPLACE FUNCTION sync_social_inbox_account_client()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE social_conversations
  SET client_id = NEW.client_id,
      updated_at = NOW()
  WHERE social_account_id = NEW.id
    AND client_id IS DISTINCT FROM NEW.client_id;

  UPDATE social_messages AS message
  SET client_id = NEW.client_id
  FROM social_conversations AS conversation
  WHERE message.conversation_id = conversation.id
    AND conversation.social_account_id = NEW.id
    AND message.client_id IS DISTINCT FROM NEW.client_id;

  UPDATE social_response_queue AS queued_reply
  SET client_id = NEW.client_id
  FROM social_conversations AS conversation
  WHERE queued_reply.conversation_id = conversation.id
    AND conversation.social_account_id = NEW.id
    AND queued_reply.client_id IS DISTINCT FROM NEW.client_id;

  UPDATE social_conversation_events AS conversation_event
  SET client_id = NEW.client_id
  FROM social_conversations AS conversation
  WHERE conversation_event.conversation_id = conversation.id
    AND conversation.social_account_id = NEW.id
    AND conversation_event.client_id IS DISTINCT FROM NEW.client_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_inbox_account_client ON social_accounts;
CREATE TRIGGER trg_social_inbox_account_client
AFTER UPDATE OF client_id ON social_accounts
FOR EACH ROW
WHEN (OLD.client_id IS DISTINCT FROM NEW.client_id)
EXECUTE FUNCTION sync_social_inbox_account_client();

COMMIT;
