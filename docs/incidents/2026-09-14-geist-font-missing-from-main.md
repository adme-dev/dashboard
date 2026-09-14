# Geist font omitted from the current release branch

On 14 September 2026 the user reported that XeroFlow's font had disappeared again and asked whether an old branch was being uploaded.

The live Cloudflare Pages production deployment was `d4ab6ec6-5394-4dad-b645-f3ef11570ba1`, source `56c66ea9836c2611b5dbc01d86feff60d222cd9f`, on `agency-dashboard`. Fresh remote main was `e48bcd4cfb2ca257dc516f5ea62e44a4a18305e5`. The in-progress booking work was based on that exact main and had not been uploaded.

The source mismatch was a missing integration: `d230c53a6c84d779cd94e6e06f915fa2bea1c6a2` had self-hosted Geist on `fix/geist-font-loading-production`, but that commit was absent from main. Current main configured a local font provider and declared Geist in its CSS stack without supplying an `@font-face` or font file. An unauthenticated Chrome visit to app.xeroflow.io redirected to the sign-in page, where the computed font stack named Geist, but `document.fonts` was empty, no font request occurred and loading Geist returned zero faces. A CSS family name alone was insufficient evidence of a loaded font.

The repair starts from freshly fetched current main and restores only the font declaration, the 29,288-byte Latin variable WOFF2, its SIL Open Font License, and the font regression test. It preserves the existing weight range 100–900 and `font-display: swap`. There is no external font-service dependency and no change to site typography choices.

The historical font branch also contains ten subsequent marquee/CTA changes. They are not part of this repair and must not be blindly merged or deleted as obsolete. Reconcile them separately with the user's current marketing requirements. The dirty root checkout also contains related changes and remains untouched.

Release acceptance must verify: current-main ancestry, guarded agency-dashboard target, green required checks, an actual loaded Geist face and successful WOFF2 request in the live browser, and the established QR SVG export. Record the final merge/source and deployment ID below after verification. The booking work and full Page Studio roadmap remain separate unfinished work.
