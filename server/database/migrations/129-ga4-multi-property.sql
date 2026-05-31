-- 129: multi-property-per-client correctness for ga4_daily_channel
-- All GA4 properties sit under a single OAuth connection, so the old unique key
-- (connection_id, metric_date, channel_group) collapsed every property's rows
-- for a given date+channel into one — losing all but one property. Include
-- property_id so each property persists; client_id-grouped aggregations
-- (funnel/blended/anomaly) then roll up across a client's properties for free.
ALTER TABLE ga4_daily_channel
  DROP CONSTRAINT IF EXISTS ga4_daily_channel_connection_id_metric_date_channel_group_key;
ALTER TABLE ga4_daily_channel
  ADD CONSTRAINT ga4_daily_channel_conn_prop_date_channel_key
  UNIQUE (connection_id, property_id, metric_date, channel_group);
