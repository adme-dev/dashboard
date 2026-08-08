DROP INDEX IF EXISTS lakebase_pilot.crm_search_documents_client_idx;
DROP INDEX IF EXISTS lakebase_pilot.crm_search_documents_gin_idx;
DROP INDEX IF EXISTS lakebase_pilot.crm_search_documents_bm25_idx;
CREATE INDEX crm_search_documents_client_idx ON lakebase_pilot.crm_search_documents (client_id);
CREATE INDEX crm_search_documents_gin_idx ON lakebase_pilot.crm_search_documents USING gin (search_vector);
CREATE INDEX crm_search_documents_bm25_idx ON lakebase_pilot.crm_search_documents USING lakebase_bm25 (search_vector)
  WITH (default_limit = 50, prefilter = true);
