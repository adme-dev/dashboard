// server/utils/socialInbox/departmentScopeSql.ts
// Dependency-free SQL predicates for department-scoped social-inbox reads and mutations (see
// departmentScope.ts). Kept import-free so pure query builders can use them.

/**
 * Self-contained predicate over a social_conversations alias: the conversation's client is active
 * and the conversation's social account is active and owned by that same client. Contains no
 * parameters, so callers can append it to any WHERE clause without renumbering.
 */
export function departmentConversationScopeSql(alias = 'c'): string {
  return `EXISTS (
    SELECT 1
      FROM social_accounts inbox_scope_account
      JOIN agency_clients inbox_scope_client
        ON inbox_scope_client.id = inbox_scope_account.client_id
       AND inbox_scope_client.is_active = TRUE
     WHERE inbox_scope_account.id = ${alias}.social_account_id
       AND inbox_scope_account.is_active = TRUE
       AND inbox_scope_account.client_id = ${alias}.client_id
  )`
}

/** Queue-row predicate: the row's client matches its conversation, which must itself be in scope. */
export function departmentQueueScopeSql(alias = 'rq'): string {
  return `EXISTS (
    SELECT 1
      FROM social_conversations inbox_scope_conversation
     WHERE inbox_scope_conversation.id = ${alias}.conversation_id
       AND inbox_scope_conversation.client_id = ${alias}.client_id
       AND ${departmentConversationScopeSql('inbox_scope_conversation')}
  )`
}
