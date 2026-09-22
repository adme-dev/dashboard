-- A checkpoint contains one environment-scoped authoring graph. Reserve its site
-- while adoption is pending, managed, or blocked; blocked frozen data must not
-- be bypassed by adopting a different environment. Legacy scopes reserve none.
-- Existing conflicts deliberately fail this migration unchanged. Reconciliation
-- requires an explicit operator decision; never delete or pick an implicit winner.
CREATE UNIQUE INDEX page_studio_cms_one_authoring_scope
 ON page_studio_cms_scopes(tenant_id,client_id,site_id)
 WHERE state IN ('freezing','importing','managed','blocked');
