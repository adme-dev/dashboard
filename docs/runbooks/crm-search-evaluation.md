# CRM Search Evaluation Runbook

Production evaluation remains fail closed: replace the synthetic sealed envelope only through the approved Task 18 import ceremony.

1. An independent approver supplies the opaque AES-256-GCM envelope; never check plaintext holdout labels or a key into source.
2. Provision only the dedicated Cloudflare secret binding `CRM_SEARCH_SEALED_HOLDOUT_KEYRING`. Service, confirmation, analytics, cron, and resource-approval keys cannot substitute.
3. Import the exact approved bytes to the private R2 key `crm-search/evaluation/holdouts/holdout-v1.json`.
4. Read the object back and verify its exact object SHA-256, envelope/key version, authenticated decryption, 360-query canonical JSON shape, recursive privacy contract, and decrypted judgement SHA-256.
5. Record the readback evidence in the signed `resource_provision` approval artifact. Only after all checks match may a reviewed manifest change `productionReady` to `true`.

Task 18 performs no import or secret provisioning. The checked-in manifest stays `productionReady: false`; Task 19 or a later explicitly approved release performs the external ceremony. Evaluation runner identity must remain distinct from implementation and fixture authors.
