-- ============================================
-- 199 · Support Intake Rework — 4 support brief templates
-- Reworks: it-support, support-ticket, bug-report, change-request
-- Full field-set rewrite (DELETE+INSERT) — safe while brief_field_values = 0.
-- + template-flag UPDATEs (require_client_link on the two client-facing forms).
-- Idempotent guard: aborts if any brief field-values exist.
--
-- Goal: structured intake + accountability so the C5 brief-gatekeeper + support
-- copilots can route. Every form now carries request_type / affected_system /
-- urgency / priority (with SLA) and an acct_* accountability block. Bug Report is
-- aligned to the Bugs Queue "gold standard" (severity + source + reporter/owner).
-- Monday auto-routing, Bugs-Queue activation and ticket ingestion are DEFERRED.
--
-- Spec: docs/superpowers/research/2026-06-24-monday-support-boards.md §6, §7
-- Field types/operators verified against brief_template_fields CHECK constraint
-- and app/components/briefs/BriefFormRenderer.vue (conditional eval).
-- ============================================

DO $$ BEGIN
  IF (SELECT COUNT(*) FROM brief_field_values) <> 0 THEN
    RAISE EXCEPTION '199 aborted: brief_field_values is not empty — switch to additive mode';
  END IF;
END $$;


-- ============================================================
-- REWORK 1: it-support (IT Support Request) — category it-request
-- Internal IT/tooling helpdesk. Target board (deferred): Tickets 8414310963.
-- 8 → 11 fields. Drops freetext preferred_contact (-> notes); adds request_type,
-- affected_system, urgency, screenshots, acct_impact, acct_accountable_owner.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='it-support';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Request
    (tmpl_id,'subject','Subject','text','e.g. Cannot log into Xero',NULL,true,'[]'::jsonb,NULL,1,'IT Support Request','Request','full',1),
    (tmpl_id,'request_type','Request Type','dropdown',NULL,NULL,true,
     '[{"label":"Issue / Something is broken","value":"issue"},{"label":"Question / How do I…","value":"question"},{"label":"Access Request","value":"access_request"},{"label":"Hardware","value":"hardware"},{"label":"Software / App","value":"software"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'IT Support Request','Request','half',2),
    (tmpl_id,'affected_system','Affected System','dropdown',NULL,'Which tool or device is involved?',true,
     '[{"label":"XeroFlow Dashboard","value":"xeroflow_dashboard"},{"label":"Monday.com","value":"monday"},{"label":"Google Workspace","value":"google_workspace"},{"label":"Meta Business Suite","value":"meta_business"},{"label":"Slack","value":"slack"},{"label":"Xero","value":"xero"},{"label":"Hardware / Laptop","value":"hardware"},{"label":"Printer","value":"printer"},{"label":"Network / Wi-Fi","value":"network"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'IT Support Request','Request','half',3),
    (tmpl_id,'urgency','Urgency','dropdown',NULL,'How much is this blocking you right now?',true,
     '[{"label":"Blocking all my work","value":"blocking_all"},{"label":"Blocking me on this task","value":"blocking_task"},{"label":"Workaround available","value":"workaround"},{"label":"Low impact","value":"low_impact"}]'::jsonb,
     NULL,1,'IT Support Request','Request','half',4),
    -- Priority
    (tmpl_id,'priority','Priority','radio',NULL,'Sets the response target — Critical: same business day · High: 3 business days · Medium: 7 days · Low: 14 days.',true,
     '[{"label":"Critical","value":"critical"},{"label":"High","value":"high"},{"label":"Medium","value":"medium"},{"label":"Low","value":"low"}]'::jsonb,
     NULL,1,'IT Support Request','Priority','full',5),
    -- Details
    (tmpl_id,'description','Description','richtext','What is happening? Include any error messages and what you already tried.',NULL,true,'[]'::jsonb,NULL,1,'IT Support Request','Details','full',6),
    -- Environment
    (tmpl_id,'device_type','Device Type','dropdown',NULL,NULL,false,
     '[{"label":"Mac","value":"mac"},{"label":"Windows PC","value":"windows"},{"label":"iPhone","value":"iphone"},{"label":"Android","value":"android"},{"label":"iPad / Tablet","value":"tablet"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'IT Support Request','Environment','half',7),
    (tmpl_id,'operating_system','Operating System','dropdown',NULL,NULL,false,
     '[{"label":"macOS","value":"macos"},{"label":"Windows 11","value":"win11"},{"label":"Windows 10","value":"win10"},{"label":"iOS","value":"ios"},{"label":"iPadOS","value":"ipados"},{"label":"Android","value":"android"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'IT Support Request','Environment','half',8),
    -- Evidence
    (tmpl_id,'screenshots','Screenshots / Attachments','files',NULL,'Screenshots, a screen recording, or error logs.',false,'[]'::jsonb,NULL,1,'IT Support Request','Evidence','full',9),
    -- Accountability
    (tmpl_id,'acct_impact','Business Impact','dropdown',NULL,'What is the business impact if this is not fixed?',true,
     '[{"label":"Revenue impact","value":"revenue"},{"label":"Client-visible","value":"client_visible"},{"label":"Deadline at risk","value":"deadline"},{"label":"Internal only","value":"internal"}]'::jsonb,
     NULL,1,'IT Support Request','Accountability','half',10),
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'IT owner responsible for resolving this — left blank, the gatekeeper auto-assigns.',false,'[]'::jsonb,NULL,1,'IT Support Request','Accountability','half',11)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  description='Internal IT and tooling help — issue, access, hardware or software request with priority, business impact and an accountable owner.'
WHERE slug='it-support';


-- ============================================================
-- REWORK 2: support-ticket (Support Ticket) — category support
-- Client-facing queue. Target board (deferred): Support 555246939.
-- 6 → 12 fields. Replaces generic "category" with the real 10-value request_type
-- taxonomy; adds client, urgency, url_affected, oem_approval_required, acct_* block.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='support-ticket';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Ticket
    (tmpl_id,'subject','Subject','text','e.g. SOLD car still showing on website',NULL,true,'[]'::jsonb,NULL,1,'Support Ticket','Ticket','full',1),
    (tmpl_id,'request_type','Request Type','dropdown',NULL,'What kind of request is this? Drives routing and the support copilot.',true,
     '[{"label":"Website content update","value":"website_content_update"},{"label":"Stock feed / inventory issue","value":"stock_feed_issue"},{"label":"Website fault / bug","value":"website_bug"},{"label":"Technical integration","value":"technical_integration"},{"label":"OEM-driven update","value":"oem_update"},{"label":"New website / major project","value":"new_website_project"},{"label":"Third-party / vendor","value":"third_party_vendor"},{"label":"Billing / account query","value":"billing_query"},{"label":"Internal / ADME","value":"internal_adme"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'Support Ticket','Ticket','half',2),
    (tmpl_id,'client','Client','client',NULL,'Which client is this for? Routes the ticket to the right account manager.',true,'[]'::jsonb,NULL,1,'Support Ticket','Ticket','half',3),
    (tmpl_id,'urgency','Urgency','dropdown',NULL,'How urgent is this for the client?',true,
     '[{"label":"Blocking — site/asset down","value":"blocking_all"},{"label":"Blocking this task","value":"blocking_task"},{"label":"Workaround available","value":"workaround"},{"label":"Low impact","value":"low_impact"}]'::jsonb,
     NULL,1,'Support Ticket','Ticket','half',4),
    -- Priority
    (tmpl_id,'priority','Priority','radio',NULL,'Sets the response target — Critical: same business day · High: 3 business days · Medium: 7 days · Low: 14 days.',true,
     '[{"label":"Critical","value":"critical"},{"label":"High","value":"high"},{"label":"Medium","value":"medium"},{"label":"Low","value":"low"}]'::jsonb,
     NULL,1,'Support Ticket','Priority','full',5),
    -- Details
    (tmpl_id,'description','Description','richtext','What needs doing, and any background we need.',NULL,true,'[]'::jsonb,NULL,1,'Support Ticket','Details','full',6),
    (tmpl_id,'url_affected','URL / Location','url','https://','URL of the affected page or asset.',false,'[]'::jsonb,NULL,1,'Support Ticket','Details','half',7),
    (tmpl_id,'steps_to_reproduce','Steps to Reproduce','textarea','1. Go to…  2. Click…  3. See…','If reporting a fault, list the steps to see it.',false,'[]'::jsonb,NULL,1,'Support Ticket','Details','full',8),
    -- OEM
    (tmpl_id,'oem_approval_required','OEM Sign-off Required?','radio',NULL,'Does this need OEM / brand sign-off before going live?',false,
     '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
     NULL,1,'Support Ticket','OEM','half',9),
    -- Accountability
    (tmpl_id,'acct_impact','Business Impact','dropdown',NULL,'What is the impact if this is not actioned?',true,
     '[{"label":"Client-facing site down","value":"site_down"},{"label":"Content error live","value":"content_error"},{"label":"Client deadline at risk","value":"deadline"},{"label":"Low impact","value":"low_impact"}]'::jsonb,
     NULL,1,'Support Ticket','Accountability','half',10),
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Account owner responsible — left blank, the gatekeeper auto-assigns.',false,'[]'::jsonb,NULL,1,'Support Ticket','Accountability','half',11),
    -- Evidence
    (tmpl_id,'attachments','Attachments','files',NULL,'Screenshots, files or references.',false,'[]'::jsonb,NULL,1,'Support Ticket','Evidence','full',12)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  require_client_link=true,
  description='Client support ticket — typed request, client, urgency, priority/SLA and an accountable owner. Routes to the support queue.'
WHERE slug='support-ticket';


-- ============================================================
-- REWORK 3: bug-report (Bug Report) — category support
-- Aligned to the Bugs Queue "gold standard" (board 8932270571, deferred).
-- 10 → 15 fields. Renames project_name→bug_summary, system_affected→affected_system,
-- browser_device→browser+device_type; adds source, user_role_at_time, acct_reporter,
-- acct_accountable_owner; url_of_issue + screenshots now required.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='bug-report';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Issue
    (tmpl_id,'bug_summary','Bug Summary','text','Short description of the bug',NULL,true,'[]'::jsonb,NULL,1,'Bug Report','Issue','full',1),
    (tmpl_id,'severity','Severity','dropdown',NULL,'Maps to the Bugs Queue Priority column.',true,
     '[{"label":"Critical — system down or data loss","value":"critical"},{"label":"High — major feature broken","value":"high"},{"label":"Medium — impaired, workaround exists","value":"medium"},{"label":"Low — cosmetic / minor","value":"low"}]'::jsonb,
     NULL,1,'Bug Report','Issue','half',2),
    (tmpl_id,'affected_system','Affected System','dropdown',NULL,NULL,true,
     '[{"label":"XeroFlow Dashboard","value":"xeroflow_dashboard"},{"label":"Monday.com","value":"monday"},{"label":"Ad Platform (Meta / Google)","value":"ad_platform"},{"label":"Xero","value":"xero"},{"label":"Client Website","value":"client_website"},{"label":"Email / Marketing Automation","value":"email"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'Bug Report','Issue','half',3),
    (tmpl_id,'source','Source','dropdown',NULL,'Where did this bug come from? Maps to the Bugs Queue Source column.',true,
     '[{"label":"Client-reported","value":"client"},{"label":"Internal-reported","value":"internal"},{"label":"OEM-reported","value":"oem"},{"label":"QA","value":"qa"},{"label":"Alpha / Beta","value":"alpha_beta"}]'::jsonb,
     NULL,1,'Bug Report','Issue','half',4),
    (tmpl_id,'url_of_issue','URL / Location of Issue','url','https://','Link to the exact page or screen where the bug occurs.',true,'[]'::jsonb,NULL,1,'Bug Report','Issue','half',5),
    -- Details
    (tmpl_id,'steps_to_reproduce','Steps to Reproduce','richtext','1. Go to…  2. Click…  3. See error…',NULL,true,'[]'::jsonb,NULL,1,'Bug Report','Details','full',6),
    (tmpl_id,'expected_behaviour','Expected Behaviour','textarea','What should happen?',NULL,true,'[]'::jsonb,NULL,1,'Bug Report','Details','half',7),
    (tmpl_id,'actual_behaviour','Actual Behaviour','textarea','What actually happens?',NULL,true,'[]'::jsonb,NULL,1,'Bug Report','Details','half',8),
    -- Environment
    (tmpl_id,'browser','Browser','dropdown',NULL,NULL,false,
     '[{"label":"Chrome","value":"chrome"},{"label":"Safari","value":"safari"},{"label":"Firefox","value":"firefox"},{"label":"Edge","value":"edge"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'Bug Report','Environment','half',9),
    (tmpl_id,'device_type','Device Type','dropdown',NULL,NULL,false,
     '[{"label":"Desktop","value":"desktop"},{"label":"Mobile","value":"mobile"},{"label":"Tablet","value":"tablet"}]'::jsonb,
     NULL,1,'Bug Report','Environment','half',10),
    (tmpl_id,'user_role_at_time','User Role at the Time','dropdown',NULL,'What role was the user in when it happened?',false,
     '[{"label":"Owner","value":"owner"},{"label":"Admin","value":"admin"},{"label":"Staff","value":"staff"},{"label":"Viewer","value":"viewer"},{"label":"Client","value":"client"}]'::jsonb,
     NULL,1,'Bug Report','Environment','half',11),
    -- Evidence
    (tmpl_id,'screenshots','Screenshots / Recording','files',NULL,'Screenshot or screen recording of the bug. Maps to the Bugs Queue evidence column.',true,'[]'::jsonb,NULL,1,'Bug Report','Evidence','full',12),
    -- Accountability
    (tmpl_id,'acct_reporter','Reporter','user',NULL,'Who reported this. Defaults to you.',false,'[]'::jsonb,NULL,1,'Bug Report','Accountability','half',13),
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Developer / owner who will fix it — left blank, the gatekeeper assigns the dev queue.',false,'[]'::jsonb,NULL,1,'Bug Report','Accountability','half',14),
    -- Other
    (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,'Frequency, impact, workarounds, anything else.',false,'[]'::jsonb,NULL,1,'Bug Report','Other','full',15)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  description='Structured bug report aligned to the Bugs Queue — severity, affected system, source, reproduction steps, evidence and reporter/owner.'
WHERE slug='bug-report';


-- ============================================================
-- REWORK 4: change-request (Change Request) — category support
-- Target board (deferred): Support / Work Requests. requires_approval already true.
-- 9 → 15 fields. Renames project_name→change_request_title, change_type→type_of_change,
-- description→description_of_change, affected_url→url_location; adds urgency,
-- estimated_effort and the acct_approval_required sign-off gate + acct_approver/owner.
-- ============================================================
DO $$ DECLARE tmpl_id UUID; BEGIN
  SELECT id INTO tmpl_id FROM brief_templates WHERE slug='change-request';
  IF tmpl_id IS NULL THEN RETURN; END IF;
  DELETE FROM brief_template_fields WHERE template_id=tmpl_id;
  INSERT INTO brief_template_fields
    (template_id, field_key, field_label, field_type, placeholder, help_text,
     is_required, options, conditional_logic, step_number, step_title, section, width, sort_order)
  VALUES
    -- Request
    (tmpl_id,'change_request_title','Change Request Title','text','e.g. Update homepage hero banner',NULL,true,'[]'::jsonb,NULL,1,'Change Request','Request','full',1),
    (tmpl_id,'type_of_change','Type of Change','dropdown',NULL,NULL,true,
     '[{"label":"Website content","value":"website_content"},{"label":"Website design","value":"website_design"},{"label":"Ad campaign","value":"ad_campaign"},{"label":"Landing page","value":"landing_page"},{"label":"Integration / feed","value":"integration_feed"},{"label":"Platform config","value":"platform_config"},{"label":"SEO","value":"seo"},{"label":"Process change","value":"process"},{"label":"Other","value":"other"}]'::jsonb,
     NULL,1,'Change Request','Request','half',2),
    (tmpl_id,'client','Client','client',NULL,'Which client this change is for.',true,'[]'::jsonb,NULL,1,'Change Request','Request','half',3),
    -- Details
    (tmpl_id,'description_of_change','Description of Change','richtext','What needs to change and why?',NULL,true,'[]'::jsonb,NULL,1,'Change Request','Details','full',4),
    (tmpl_id,'current_state','Current State','richtext','How does it look / work now?',NULL,true,'[]'::jsonb,NULL,1,'Change Request','Details','half',5),
    (tmpl_id,'desired_state','Desired State','richtext','How should it look / work after?',NULL,true,'[]'::jsonb,NULL,1,'Change Request','Details','half',6),
    (tmpl_id,'url_location','URL / Location','url','https://',NULL,false,'[]'::jsonb,NULL,1,'Change Request','Details','full',7),
    -- Priority
    (tmpl_id,'urgency','Urgency','dropdown',NULL,'How time-sensitive is this change?',true,
     '[{"label":"Blocking work","value":"blocking_all"},{"label":"Needed this task","value":"blocking_task"},{"label":"Workaround available","value":"workaround"},{"label":"Low impact","value":"low_impact"}]'::jsonb,
     NULL,1,'Change Request','Priority','half',8),
    (tmpl_id,'priority','Priority','dropdown',NULL,'Sets the target turnaround — Critical: same business day · High: 3 business days · Medium: 7 days · Low: 14 days.',true,
     '[{"label":"Critical","value":"critical"},{"label":"High","value":"high"},{"label":"Medium","value":"medium"},{"label":"Low","value":"low"}]'::jsonb,
     NULL,1,'Change Request','Priority','half',9),
    (tmpl_id,'estimated_effort','Estimated Effort','dropdown',NULL,'Rough size to help us schedule.',false,
     '[{"label":"< 1 hour","value":"lt_1h"},{"label":"1–4 hours","value":"1_4h"},{"label":"1 day","value":"1_day"},{"label":"2–5 days","value":"2_5_days"},{"label":"> 1 week","value":"gt_1week"}]'::jsonb,
     NULL,1,'Change Request','Priority','half',10),
    -- Accountability
    (tmpl_id,'acct_approval_required','Sign-off Required Before Work?','radio',NULL,'If Yes, the gatekeeper holds this on Hold until the approver responds — work does not start.',true,
     '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"}]'::jsonb,
     NULL,1,'Change Request','Accountability','half',11),
    (tmpl_id,'acct_approver','Approver','user',NULL,'Who signs this off. Required when sign-off is needed.',false,'[]'::jsonb,
     '{"fieldKey":"acct_approval_required","operator":"equals","value":"yes","action":"require"}'::jsonb,
     1,'Change Request','Accountability','half',12),
    (tmpl_id,'acct_accountable_owner','Accountable Owner','user',NULL,'Owner responsible for delivering the change — left blank, the gatekeeper auto-assigns.',false,'[]'::jsonb,NULL,1,'Change Request','Accountability','half',13),
    -- Files
    (tmpl_id,'supporting_files','Supporting Files','files',NULL,'Screenshots, mockups, reference docs.',false,'[]'::jsonb,NULL,1,'Change Request','Files','full',14),
    (tmpl_id,'additional_notes','Additional Notes','richtext',NULL,NULL,false,'[]'::jsonb,NULL,1,'Change Request','Other','full',15)
  ON CONFLICT (template_id, field_key) DO NOTHING;
END $$;

UPDATE brief_templates SET
  require_client_link=true,
  description='Change request with current/desired state, type, priority/SLA and an explicit sign-off gate before work starts.'
WHERE slug='change-request';
