# Rendered team previews and automatic posters — 23 November 2026

## Requested outcome

Team saved viewers and external client links show rendered MP4 video with a still
poster. The internal page must be clearly distinguished from the link sent to a
client. Posters should be automatic, with a designer override.

The supplied examples are Northern GAC `89b0e5e3-0428-4a0a-85a2-70d906c7707c`
and We Buy Any Cars Brisbane `4fa8d6cc-5ce4-420d-9a9b-0241d18b4b65`.
The separate Frankston MG TheBrief import remains paused and was not imported.

## Previous developer review and preserved behavior

Reviewed the **Check shared video playback** chat and the renderer fix in PR #883,
including the `domcontentloaded` / actual-asset-readiness repair. The container,
CPU/rollout work and subsequently pinned render image (PR #949) remain intact.
Reviewed earlier HTML5/native-video revisions and the rollback in PR #879.
A local HTML5 playback experiment was discarded before release: it addressed the
wrong surface once rendered MP4 was confirmed as the requested playback mode.
No HTML builder, animation/audio clock or render worker change is included.

The mismatch was in routing: `/creative/banner-studio/view/:id` still mounted
`BannerSavedPreview` (HTML5), whereas `/share/banner/:token` mounted the rendered
MP4 player. The team page now reuses that same player, content-addressed render
jobs, preparation/retry flow, video delivery and poster rendering.

## Access and sharing

New project-scoped video status/preparation, MP4 GET/HEAD and image routes use the
existing snapshot project/client authorization before reading jobs or media.
They do not create a public link or bypass client access. Stable font delivery
and source/canvas render hashing are retained, allowing the same rendered file to
be reused between team and client views. Expired/revoked client capabilities keep
their existing checks. Stored objects and private job errors are not exposed.

The page says **Team preview · Sign-in required** and provides **Share with client**.
That opens the existing sharing dialog to create or copy an expiring external
client link. Its descriptions distinguish team sign-in from the client link.
Creating/copying a link does not send a message to anyone.

## Automatic posters

The selector evaluates a bounded 121-frame sample per layout, favouring visible
native copy, substantial imagery and settled holds, with penalties near scene
boundaries and for absent main imagery. It does not optically assess blur or read
text embedded in footage. A finite saved `posterTime` always takes priority.
Automatic frame clears the override; the choice follows later saved artwork
changes. Cache selector revision 5 regenerates prior midpoint posters.

For the supplied saved revisions, GAC chooses 3.675 seconds (after its offer pulse)
and We Buy Any Cars chooses 13.313 seconds (final mascot/contact panel) in all three
sizes. These are derived choices, not writes to the designer's timeline.

## Verification

Focused tests cover the common MP4 player, existing public-link behavior,
authenticated team status/media paths, rejection before cached reads, source job
reuse, automatic/overridden frame choice, and the team label/sharing button.
With locked dependencies on Node 24.18.0, 732 tests pass and one optional
test is skipped across banner/render/player, project-access and deployment-guard
coverage. Changed source and tests pass lint. Full repository typecheck/CI are
not claimed clean. Production deployment and live checks follow release. Private snapshots, rejected experimental patches and UI captures are
kept outside Git. The colleague's shared analytics work and gallery fix are
preserved; artwork timing has not been rewritten.

Actual Safari/iPhone playback and producer approval remain distinct from Chrome
verification. Unsupported render formats retain their explicit status and do not
fall back to HTML5 animation.
