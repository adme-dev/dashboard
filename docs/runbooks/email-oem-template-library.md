# OEM email template library

Use `/agency/email?tab=templates` for the email template library. The tab remains selected after refresh.

## Collections and ownership

- **Official OEM / Make** contains source frameworks and historical source references. Recorded provenance describes where a file came from; it does not certify a current offer or campaign approval.
- **XeroFlow defaults** contains reusable agency designs.
- **Client templates / Make** contains independent customised copies. Staff choose an authorised client; shared defaults are available only with the existing shared-template capability.
- Historical campaigns remain **Drafts**. Drafts retain their category and make. Search matches make, provider, category and client; the OEM make filter combines with the client selection.

Choose **Create client copy** on an OEM original. The copy keeps recorded source information, gains its own lineage, and opens for editing after it is saved. The original remains unchanged. Saving a new copy replaces the copy URL with the saved template URL, so a refresh reopens the saved copy. **Edit original** is an explicit separate action.

## Import and restore

1. Choose **Import template** and select an authorised client or shared default.
2. Upload or paste HTML, a native XeroFlow document, or a version 1 XeroFlow template backup. The single-template limit is 512 KB.
3. Choose a category and **Draft** or **Reusable template**. A backup restores name, subject, preview text, kind and category; client identifiers are deliberately excluded and require a fresh assignment.
4. Review the sandboxed preview before saving. Changing content or settings invalidates the preview.
5. Save. If the response is lost, retry in the same dialog: the request key is reused and the server reconciles the same writer-scoped template identity. Reusing a key for different content or ownership fails with a conflict. Legacy API callers without a request key retain the ordinary create semantics.

HTML imports are editable HTML blocks. They do not transfer Sesimi's native field editor. Third-party import sanitization removes style sheets and active content; the editor's separate display sanitizer preserves the established native/OEM style sheets while stripping active browser markup. Review imported rendering before reuse.

## Source details and portability

**Template details** shows provider, make, retrieval date, source asset, recorded original-file hash and review notes. Supported source portal links exclude credentials, query parameters and fragments. Import/save/copy/export retain only the defined provenance fields. Imported approval claims are not trusted.

**Export JSON** produces a versioned single-template backup with design and template settings. It omits row ownership and internal import receipts. Restore it through Import template and choose the target client. This is single-template portability, not a substitute for database or object-storage disaster recovery.

Before sending any imported campaign, review dealership identity/address, dates, offers, legal copy, links, sender identity and unsubscribe configuration. Source references with fixed historical content are not send-ready campaigns. Updating an OEM design means importing a new reviewed source version; do not overwrite the retained original or client copies automatically.

## Verification

The enterprise hardening gate covers source/copy identity, client scope, native backup restoration, make/provider discovery, loading failures, saved-copy URL adoption, bounded names, draft categories, active HTML removal and import retry reconciliation. Production acceptance must additionally exercise the real library, copy/save/reopen, backup preview, concurrent import retry and immediate deletion using disposable verification records. Do not send an email or fabricate a subscriber event to obtain proof.
