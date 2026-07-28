export interface BrowserConfirmationDb {
  query(sql: string, params?: unknown[]): Promise<{ rows?: unknown[] }>
}

async function lockBrowserConfirmation(
  db: BrowserConfirmationDb,
  clientId: string,
  browserEventId: string
): Promise<void> {
  // Both arrival paths take the same transaction-scoped lock. That makes a
  // provider webhook and its browser form_submit event observe one another
  // even when they arrive concurrently in separate transactions.
  await db.query(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [`${clientId}:${browserEventId}`]
  )
}

/**
 * Confirms an already-persisted browser candidate when CRM intake creates a
 * lead. The companion function below handles the inverse arrival order.
 */
export async function appendConfirmedBrowserLeadEvent(
  db: BrowserConfirmationDb,
  input: {
    clientId: string
    leadId: string
    browserEventId: string | null
    source: string
    occurredAt: string
  }
): Promise<boolean> {
  if (!input.browserEventId) return false
  await lockBrowserConfirmation(db, input.clientId, input.browserEventId)

  const result = await db.query(
    `INSERT INTO tracking_events (
       site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, msclkid, li_fat_id,
       event_data, consent, ua, ip_hash, origin, occurred_at
     )
     SELECT source_event.site_id,
            source_event.client_id,
            'confirmed-lead:' || $2,
            source_event.anon_id,
            source_event.session_id,
            'generate_lead',
            source_event.page_url,
            source_event.referrer,
            source_event.utm_source,
            source_event.utm_medium,
            source_event.utm_campaign,
            source_event.utm_term,
            source_event.utm_content,
            source_event.gclid,
            source_event.gbraid,
            source_event.wbraid,
            source_event.fbclid,
            source_event.fbc,
            source_event.fbp,
            source_event.ttclid,
            source_event.msclkid,
            source_event.li_fat_id,
            COALESCE(source_event.event_data, '{}'::jsonb)
              || jsonb_build_object(
                   'canonical_lead_id', $2::text,
                   'confirmation_source', $4::text,
                   'browser_event_id', $3::text
                 ),
            source_event.consent,
            source_event.ua,
            source_event.ip_hash,
            source_event.origin,
            $5::timestamptz
       FROM tracking_events source_event
      WHERE source_event.client_id = $1
        AND source_event.event_id = $3
        AND source_event.event_name = 'form_submit'
        AND source_event.event_data->>'lead_eligible' = 'true'
        AND source_event.event_data->>'capture_source' = 'explicit_provider_bridge'
      ORDER BY source_event.occurred_at DESC, source_event.id DESC
      LIMIT 1
     ON CONFLICT (site_id, event_id) DO NOTHING
     RETURNING event_id`,
    [
      input.clientId,
      input.leadId,
      input.browserEventId,
      input.source,
      input.occurredAt
    ]
  )
  return Boolean(result.rows?.length)
}

/**
 * Confirms an already-created CRM lead when its matching browser form_submit
 * event is persisted afterwards. The shared lock above closes the overlap race
 * between this and appendConfirmedBrowserLeadEvent().
 */
export async function appendConfirmedBrowserLeadEventForStoredFormSubmission(
  db: BrowserConfirmationDb,
  input: {
    clientId: string
    browserEventId: string
  }
): Promise<boolean> {
  await lockBrowserConfirmation(db, input.clientId, input.browserEventId)

  const result = await db.query(
    `INSERT INTO tracking_events (
       site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, msclkid, li_fat_id,
       event_data, consent, ua, ip_hash, origin, occurred_at
     )
     SELECT source_event.site_id,
            source_event.client_id,
            'confirmed-lead:' || confirmed_lead.id::text,
            source_event.anon_id,
            source_event.session_id,
            'generate_lead',
            source_event.page_url,
            source_event.referrer,
            source_event.utm_source,
            source_event.utm_medium,
            source_event.utm_campaign,
            source_event.utm_term,
            source_event.utm_content,
            source_event.gclid,
            source_event.gbraid,
            source_event.wbraid,
            source_event.fbclid,
            source_event.fbc,
            source_event.fbp,
            source_event.ttclid,
            source_event.msclkid,
            source_event.li_fat_id,
            COALESCE(source_event.event_data, '{}'::jsonb)
              || jsonb_build_object(
                   'canonical_lead_id', confirmed_lead.id::text,
                   'confirmation_source', confirmed_lead.source,
                   'browser_event_id', source_event.event_id
                 ),
            source_event.consent,
            source_event.ua,
            source_event.ip_hash,
            source_event.origin,
            confirmed_lead.submitted_at
       FROM tracking_events source_event
       JOIN leads confirmed_lead
         ON confirmed_lead.client_id = source_event.client_id
        AND confirmed_lead.deleted_at IS NULL
        AND confirmed_lead.attribution->>'browserEventId' = source_event.event_id
      WHERE source_event.client_id = $1
        AND source_event.event_id = $2
        AND source_event.event_name = 'form_submit'
        AND source_event.event_data->>'lead_eligible' = 'true'
        AND source_event.event_data->>'capture_source' = 'explicit_provider_bridge'
     ON CONFLICT (site_id, event_id) DO NOTHING
     RETURNING event_id`,
    [input.clientId, input.browserEventId]
  )
  return Boolean(result.rows?.length)
}

/**
 * Repairs confirmed conversions that could not be written while the browser
 * candidate or provider webhook was being processed. This is intentionally
 * bounded to candidates that have an accepted CRM lead and no matching
 * confirmation event; it never infers a conversion from an ordinary submit.
 */
export async function reconcileConfirmedBrowserLeadEvents(
  db: BrowserConfirmationDb
): Promise<number> {
  const result = await db.query(
    `WITH candidates AS (
       SELECT DISTINCT ON (confirmed_lead.id)
              source_event.site_id,
              source_event.client_id,
              source_event.event_id AS browser_event_id,
              source_event.anon_id,
              source_event.session_id,
              source_event.page_url,
              source_event.referrer,
              source_event.utm_source,
              source_event.utm_medium,
              source_event.utm_campaign,
              source_event.utm_term,
              source_event.utm_content,
              source_event.gclid,
              source_event.gbraid,
              source_event.wbraid,
              source_event.fbclid,
              source_event.fbc,
              source_event.fbp,
              source_event.ttclid,
              source_event.msclkid,
              source_event.li_fat_id,
              source_event.event_data,
              source_event.consent,
              source_event.ua,
              source_event.ip_hash,
              source_event.origin,
              confirmed_lead.id AS lead_id,
              confirmed_lead.source AS lead_source,
              confirmed_lead.submitted_at
         FROM tracking_events source_event
         JOIN leads confirmed_lead
           ON confirmed_lead.client_id = source_event.client_id
          AND confirmed_lead.deleted_at IS NULL
          AND confirmed_lead.attribution->>'browserEventId' = source_event.event_id
        WHERE source_event.event_name = 'form_submit'
          AND source_event.event_data->>'lead_eligible' = 'true'
          AND source_event.event_data->>'capture_source' = 'explicit_provider_bridge'
          AND NOT EXISTS (
            SELECT 1
              FROM tracking_events confirmed_event
             WHERE confirmed_event.site_id = source_event.site_id
               AND confirmed_event.event_id = 'confirmed-lead:' || confirmed_lead.id::text
          )
        ORDER BY confirmed_lead.id, source_event.occurred_at DESC, source_event.id DESC
        LIMIT 500
     )
     INSERT INTO tracking_events (
       site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
       utm_source, utm_medium, utm_campaign, utm_term, utm_content,
       gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, msclkid, li_fat_id,
       event_data, consent, ua, ip_hash, origin, occurred_at
     )
     SELECT site_id,
            client_id,
            'confirmed-lead:' || lead_id::text,
            anon_id,
            session_id,
            'generate_lead',
            page_url,
            referrer,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_term,
            utm_content,
            gclid,
            gbraid,
            wbraid,
            fbclid,
            fbc,
            fbp,
            ttclid,
            msclkid,
            li_fat_id,
            COALESCE(event_data, '{}'::jsonb)
              || jsonb_build_object(
                   'canonical_lead_id', lead_id::text,
                   'confirmation_source', lead_source,
                   'browser_event_id', browser_event_id
                 ),
            consent,
            ua,
            ip_hash,
            origin,
            submitted_at
       FROM candidates
     ON CONFLICT (site_id, event_id) DO NOTHING
     RETURNING event_id`
  )
  return result.rows?.length ?? 0
}
