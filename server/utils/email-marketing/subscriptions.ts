// server/utils/email-marketing/subscriptions.ts
// DB layer for the public (unauthenticated) Phase 4 surfaces: one-click
// unsubscribe, double-opt-in subscribe, confirm, and the preference center.
// Every caller MUST verify a signed link token (links.ts) before invoking
// these — the functions here trust their inputs and only enforce data rules.

import { queryRows, queryOne, execute, transaction } from '~~/server/utils/db'
import type { MembershipStatus } from './types'

export interface PublicSubscriber {
  id: string
  email: string
  name: string | null
}

export interface ListMembership {
  list_id: string
  list_name: string
  status: MembershipStatus
}

// Subscriber + their non-archived list memberships — drives the unsubscribe page
// header (which email) and the preference center toggles. null if unknown id.
export async function getSubscriberWithLists(
  subscriberId: string
): Promise<{ subscriber: PublicSubscriber, lists: ListMembership[] } | null> {
  const subscriber = await queryOne<PublicSubscriber>(
    'SELECT id, email, name FROM email_subscribers WHERE id = $1',
    [subscriberId]
  )
  if (!subscriber) return null
  const lists = await queryRows<ListMembership>(`
    SELECT sl.list_id, el.name AS list_name, sl.status
    FROM subscriber_lists sl
    JOIN email_lists el ON el.id = sl.list_id
    WHERE sl.subscriber_id = $1 AND el.archived_at IS NULL
    ORDER BY el.name
  `, [subscriberId])
  return { subscriber, lists }
}

// Global one-click unsubscribe (RFC 8058). Idempotent: adds the email to the
// suppression list, marks every membership unsubscribed, and records the event +
// bumps the campaign counter EXACTLY ONCE (gated on first suppression) so mailbox
// retries / repeat clicks never inflate metrics. Returns the email, or null if
// the subscriber id is unknown.
export async function globalUnsubscribe(opts: {
  subscriberId: string
  campaignId?: string | null
}): Promise<{ email: string } | null> {
  const sub = await queryOne<{ email: string }>(
    'SELECT email FROM email_subscribers WHERE id = $1',
    [opts.subscriberId]
  )
  if (!sub) return null

  await transaction(async (db) => {
    const supp = await db.query(
      `INSERT INTO suppression_list (email, reason, campaign_id)
       VALUES ($1, 'global_unsubscribe', $2)
       ON CONFLICT (email) DO NOTHING`,
      [sub.email, opts.campaignId ?? null]
    )

    const memberships = await db.query(
      `UPDATE subscriber_lists SET status = 'unsubscribed', unsubscribed_at = NOW()
       WHERE subscriber_id = $1 AND status <> 'unsubscribed'`,
      [opts.subscriberId]
    )

    // Record the event + bump the counter on the FIRST explicit unsubscribe —
    // i.e. when this call either newly suppressed the email OR transitioned an
    // active membership. (A prior suppression for a *different* reason —
    // hard_bounce/complaint — leaves the suppression insert a no-op, so keying
    // only on that would silently lose the genuine user-initiated unsubscribe.)
    // Repeat clicks / mailbox retries find nothing to transition → no dup event.
    const firstExplicit = (supp.rowCount ?? 0) > 0 || (memberships.rowCount ?? 0) > 0
    if (firstExplicit) {
      await db.query(
        `INSERT INTO email_events (campaign_id, subscriber_id, event_type)
         VALUES ($1, $2, 'unsubscribed')`,
        [opts.campaignId ?? null, opts.subscriberId]
      )
      if (opts.campaignId) {
        await db.query(
          'UPDATE campaigns SET unsubscribed = unsubscribed + 1, updated_at = NOW() WHERE id = $1',
          [opts.campaignId]
        )
      }
    }
  })
  return { email: sub.email }
}

// Preference center: flip a single list membership on/off. Re-subscribing only
// affects a list the subscriber already has a row for (you can't be added to a
// brand-new list here) and clears a prior GLOBAL UNSUBSCRIBE suppression — but
// never a hard_bounce/complaint suppression. Returns true if a row changed.
export async function setListSubscription(opts: {
  subscriberId: string
  listId: string
  subscribe: boolean
}): Promise<boolean> {
  if (opts.subscribe) {
    // Atomic: re-enabling the membership and lifting the global-unsubscribe
    // suppression are a single consent change — a partial failure must not leave
    // the subscriber confirmed-but-suppressed. This path is reached only with a
    // valid signed link token (proof the subscriber controls the email), so
    // lifting the global hard-stop here is authorized.
    return transaction(async (db) => {
      const res = await db.query(
        `UPDATE subscriber_lists
         SET status = 'confirmed', unsubscribed_at = NULL, subscribed_at = NOW()
         WHERE subscriber_id = $1 AND list_id = $2`,
        [opts.subscriberId, opts.listId]
      )
      await db.query(
        `DELETE FROM suppression_list
         WHERE reason = 'global_unsubscribe'
           AND email = (SELECT email FROM email_subscribers WHERE id = $1)`,
        [opts.subscriberId]
      )
      return (res.rowCount ?? 0) > 0
    })
  }
  const n = await execute(
    `UPDATE subscriber_lists SET status = 'unsubscribed', unsubscribed_at = NOW()
     WHERE subscriber_id = $1 AND list_id = $2 AND status <> 'unsubscribed'`,
    [opts.subscriberId, opts.listId]
  )
  return n > 0
}

export interface SubscribeResult {
  subscriberId: string
  listId: string
  listName: string
  status: MembershipStatus
  needsConfirm: boolean
}

// Public subscribe to a list (the marketing signup form) — UNAUTHENTICATED.
// Upserts the subscriber by case-insensitive email and attaches them to the
// list. Double-opt-in lists land 'unconfirmed' (caller sends a confirm email);
// otherwise 'confirmed' immediately. Never clears a global-unsubscribe
// suppression (that requires proven consent — see confirmSubscription) and never
// re-enables a disabled/blocklisted subscriber.
export async function subscribePublic(opts: {
  email: string
  name?: string | null
  listId: string
  source?: 'form'
}): Promise<SubscribeResult> {
  const list = await queryOne<{ id: string, name: string, double_optin: boolean }>(
    'SELECT id, name, double_optin FROM email_lists WHERE id = $1 AND archived_at IS NULL',
    [opts.listId]
  )
  if (!list) throw createError({ statusCode: 404, statusMessage: 'list_not_found' })

  const targetStatus: MembershipStatus = list.double_optin ? 'unconfirmed' : 'confirmed'

  return transaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO email_subscribers (email, name, status)
       VALUES ($1, $2, 'enabled')
       ON CONFLICT (email) DO UPDATE
         SET name = COALESCE(NULLIF(EXCLUDED.name, ''), email_subscribers.name),
             updated_at = NOW()
       RETURNING id, status`,
      [opts.email, opts.name?.trim() || null]
    )
    const subscriberId = rows[0].id as string
    const subscriberStatus = rows[0].status as string

    // Attach to the list. Only an UNSUBSCRIBED membership is moved back to the
    // target status; an already-confirmed/unconfirmed row is left as-is so a
    // re-submit can't silently downgrade a confirmed opt-in to unconfirmed.
    const memRes = await db.query(
      `INSERT INTO subscriber_lists (subscriber_id, list_id, status, source, subscribed_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (subscriber_id, list_id) DO UPDATE
         SET status = CASE
               WHEN subscriber_lists.status = 'unsubscribed' THEN EXCLUDED.status
               ELSE subscriber_lists.status END,
             unsubscribed_at = NULL
       RETURNING status`,
      [subscriberId, opts.listId, targetStatus, opts.source ?? 'form']
    )
    const membershipStatus = memRes.rows[0].status as MembershipStatus

    // NOTE: this endpoint is UNAUTHENTICATED — we do NOT clear a global
    // unsubscribe suppression here. Doing so would let anyone re-enable a victim
    // who opted out, just by knowing their email + a list id. Suppression is
    // only lifted on proven consent: a double-opt-in confirm, or the
    // token-authenticated preference center. A previously-suppressed email
    // therefore stays suppressed until it confirms.

    return {
      subscriberId,
      listId: opts.listId,
      listName: list.name,
      status: membershipStatus,
      // Only worth a confirm email when the membership is actually awaiting
      // confirmation (not already confirmed) and the subscriber isn't disabled.
      needsConfirm: list.double_optin && subscriberStatus === 'enabled' && membershipStatus === 'unconfirmed'
    }
  })
}

// Double-opt-in confirm: promote an unconfirmed membership to confirmed. This is
// the proven-consent moment, so it also lifts a prior global_unsubscribe
// suppression for the email (never a hard_bounce/complaint one) — otherwise a
// genuine re-subscriber who clicks confirm would stay permanently unmailable.
// Atomic. Returns true if the membership transitioned (false if already
// confirmed / unknown / unsubscribed).
export async function confirmSubscription(opts: {
  subscriberId: string
  listId: string
}): Promise<boolean> {
  return transaction(async (db) => {
    const res = await db.query(
      `UPDATE subscriber_lists SET status = 'confirmed'
       WHERE subscriber_id = $1 AND list_id = $2 AND status = 'unconfirmed'`,
      [opts.subscriberId, opts.listId]
    )
    const confirmed = (res.rowCount ?? 0) > 0
    if (confirmed) {
      await db.query(
        `DELETE FROM suppression_list
         WHERE reason = 'global_unsubscribe'
           AND email = (SELECT email FROM email_subscribers WHERE id = $1)`,
        [opts.subscriberId]
      )
    }
    return confirmed
  })
}
