-- 128: allow the 'ga4' anomaly type (Task 3.2 GA4 analyser)
ALTER TABLE anomalies DROP CONSTRAINT IF EXISTS anomalies_type_check;
ALTER TABLE anomalies ADD CONSTRAINT anomalies_type_check
  CHECK (type = ANY (ARRAY[
    'profitability','revenue','expenses','cashflow','receivables',
    'budget','adspend','clients','transactions','ga4'
  ]));
