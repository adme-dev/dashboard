-- Guided onboarding only. No staff grants, provider connection, tag install or publication.
BEGIN;
INSERT INTO assistant_role_skills(workflow_key) VALUES ('marketing_tracking_onboarding')
ON CONFLICT (workflow_key) DO NOTHING;
INSERT INTO assistant_role_skill_versions(workflow_key,version,label,description,prompt,enabled,bindings,audit_reason)
VALUES ('marketing_tracking_onboarding',1,'New client tracking setup',
  'Assess client tracking, request the first GTM mapping and follow independently reviewed pixel installation and publication.',
  'Identify the exact client and call get_client_tracking_onboarding for the canonical guide and stored setup status. Follow its prerequisites: an authorised operator creates any missing tracking site, and an owner/admin completes Google OAuth and supplies the exact connection UUID and container path. Record current host/platform/form/conversion ownership and consent evidence. For an unbound site, propose_gtm_container_binding with initialMapping: true creates a local request only; a separate owner/admin reviews and executes it. Once mapped, inspect inventory and propose_gtm_xeroflow_installation only where justified. Compiling the installation and publishing its exact version require separate independent reviews. Native DriveAgent accepted enquiries retain native server routing. Never request secrets, install arbitrary scripts, grant permissions or fabricate enquiries. Report connection needed, awaiting approval, compiled, published and tag verified separately from actual browser event receipt and provider conversion delivery. Inspect executing/unknown outcomes; never retry blindly. Stop at the exact missing permission, consent, connection or evidence and name who must act.',
  TRUE,'{"allRoles":false,"roleIds":[],"systemRoles":[],"permissionGroups":["MEDIA_BUYING","MARKETING_MANAGEMENT"]}'::jsonb,
  'Add reviewed marketing tracking onboarding guidance without granting access')
ON CONFLICT (workflow_key,version) DO NOTHING;
INSERT INTO assistant_role_skill_publications(workflow_key,version_id,workflow_revision,reason)
SELECT w.workflow_key,v.id,1,'Initial tracking onboarding guide publication; grants remain unchanged'
FROM assistant_role_skills w JOIN assistant_role_skill_versions v ON v.workflow_key=w.workflow_key AND v.version=1
WHERE w.workflow_key='marketing_tracking_onboarding' AND w.revision=0 AND w.active_version_id IS NULL
ON CONFLICT (workflow_key,workflow_revision) DO NOTHING;
UPDATE assistant_role_skills w SET active_version_id=v.id,revision=1
FROM assistant_role_skill_versions v
WHERE w.workflow_key='marketing_tracking_onboarding' AND v.workflow_key=w.workflow_key AND v.version=1
  AND w.revision=0 AND w.active_version_id IS NULL;
COMMIT;
