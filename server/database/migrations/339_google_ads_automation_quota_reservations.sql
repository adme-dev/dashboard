-- 339_google_ads_automation_quota_reservations.sql
-- Serialize automatic action claims per policy so concurrent workers cannot exceed daily caps.

BEGIN;

CREATE TABLE IF NOT EXISTS google_ads_automation_quota_reservations (
  plan_id UUID PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE RESTRICT,
  grant_id UUID NOT NULL REFERENCES google_ads_automation_policies(id) ON DELETE RESTRICT,
  quota_day DATE NOT NULL DEFAULT ((NOW() AT TIME ZONE 'UTC')::date),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_google_ads_quota_reservation_plan_tenant
    FOREIGN KEY (client_id, plan_id)
    REFERENCES google_ads_action_plans (client_id, id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  UNIQUE (grant_id, plan_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_quota_reservations_daily
  ON google_ads_automation_quota_reservations (grant_id, quota_day);

CREATE OR REPLACE FUNCTION prevent_google_ads_quota_reservation_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Google Ads automation quota reservations are immutable once an execution attempt is claimed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_google_ads_quota_reservations_immutable
  ON google_ads_automation_quota_reservations;
CREATE TRIGGER trg_google_ads_quota_reservations_immutable
BEFORE UPDATE OR DELETE ON google_ads_automation_quota_reservations
FOR EACH ROW EXECUTE FUNCTION prevent_google_ads_quota_reservation_mutation();

CREATE OR REPLACE FUNCTION claim_google_ads_automatic_plan(
  requested_plan_id UUID,
  requested_client_id UUID,
  requested_actor_id UUID
)
RETURNS SETOF google_ads_action_plans
LANGUAGE plpgsql
AS $$
DECLARE
  selected_plan google_ads_action_plans%ROWTYPE;
  selected_policy google_ads_automation_policies%ROWTYPE;
  reservation_count INTEGER;
  utc_day DATE := (NOW() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO selected_plan
  FROM google_ads_action_plans
  WHERE id = requested_plan_id
    AND client_id = requested_client_id
    AND actor_id = requested_actor_id
  FOR UPDATE;

  IF NOT FOUND
    OR selected_plan.status <> 'planned'
    OR selected_plan.execution_mode <> 'automatic'
    OR selected_plan.expires_at <= NOW()
    OR selected_plan.grant_id IS NULL
    OR selected_plan.grant_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN;
  END IF;

  SELECT * INTO selected_policy
  FROM google_ads_automation_policies
  WHERE id = selected_plan.grant_id::uuid
    AND client_id = selected_plan.client_id
    AND connection_id = selected_plan.connection_id
    AND customer_id = selected_plan.customer_id
    AND policy_version = selected_plan.policy_version
    AND enabled = true
    AND superseded_at IS NULL
    AND effective_at <= NOW()
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int INTO reservation_count
  FROM (
    SELECT reservation.plan_id
    FROM google_ads_automation_quota_reservations reservation
    WHERE reservation.grant_id = selected_policy.id
      AND reservation.quota_day = utc_day
    UNION
    SELECT plan.id
    FROM google_ads_action_plans plan
    WHERE plan.grant_id = selected_policy.id::text
      AND plan.status IN ('verified', 'partially_verified')
      AND plan.completed_at >= (utc_day AT TIME ZONE 'UTC')
      AND NOT EXISTS (
        SELECT 1
        FROM google_ads_automation_quota_reservations existing
        WHERE existing.plan_id = plan.id
      )
  ) used_actions;

  IF selected_policy.max_daily_actions IS NOT NULL
    AND reservation_count >= selected_policy.max_daily_actions THEN
    RETURN;
  END IF;

  INSERT INTO google_ads_automation_quota_reservations (
    plan_id, client_id, grant_id, quota_day
  ) VALUES (
    selected_plan.id, selected_plan.client_id, selected_policy.id, utc_day
  ) ON CONFLICT (plan_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE google_ads_action_plans
  SET status = 'executing', claimed_at = NOW()
  WHERE id = selected_plan.id
    AND client_id = selected_plan.client_id
    AND status = 'planned'
  RETURNING *;
END;
$$;

COMMENT ON TABLE google_ads_automation_quota_reservations IS
  'One immutable UTC-day attempt quota reservation for each claimed automatic Google Ads plan.';
COMMENT ON FUNCTION claim_google_ads_automatic_plan(UUID, UUID, UUID) IS
  'Serializes claims on the policy row and reserves quota before an automatic plan can execute.';

COMMIT;
