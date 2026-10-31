# Banner Studio slides

Slides group absolute timeline intervals inside each layout. They do not replace layout sizes or the existing animation engine. `ArtboardState.slides` records identity, name, duration and optional fade-after settings. `Layer.slideId` assigns artwork to a scene; unowned layers may span the sequence.

The Slides sidebar and timeline strip share commands. New, duplicate, delete, reorder, duration, rename and loop changes replace complete validated artboards within one canvas undo action. All-layout edits require matching sequence names and durations; otherwise the designer chooses Single edit. Structural changes are held while another collaborator is present because the current realtime protocol broadcasts layer operations, not atomic sequence replacements.

Existing imports are unchanged on open. Only unambiguous cuts between clipped presence windows are inferred; overlapping clips remain one scene. Boundaries materialize on the first timing/structural edit so moving or removing the final object from a scene cannot erase its identity. New TheBrief packages carry validated explicit slides and layer ownership. Source slide transitions remain unsupported by the offline converter and are still held; authoring a native fade does not broaden source-import fidelity claims.

Duration changes map keyframes, named animation clips, motion-path tween times, explicit entrance/exit times and legacy timing aliases together. Reorder moves whole scene intervals. Duplicates retain assets, receive fresh layer identities and independent content links, and remap masks to their copied targets. Shared artwork is retained. Deletion clears dangling mask targets. Ownership controls move an object to one slide or the entire sequence. New elements go into the chosen slide. Timing controls cannot push scene-owned artwork beyond its boundaries.

Fade-through-background transitions are locked native rectangle layers with opacity keyframes at the cut. They use the ordinary editor, HTML, GIF and MP4 renderer, leave source artwork keyframes intact and do not extend total duration. Short adjacent slides clamp fade duration. They are regenerated on sequence edits and hidden from the editable timeline rows. Supported transitions are cut and fade through background; this is not an overlapping crossfade. New layouts preserve slide metadata and timing through proportional scaling; multi-slide sequences bypass AI resizing, whose current contract does not preserve scene identity.

PNG and JPG exports offer a slide selector, defaulting to the current slide. Their static poster excludes other scenes, audio and transition overlays. HTML, GIF and MP4 retain the full timed sequence.

Limits: 50 slides, 0.1 second minimum per slide, 300 seconds per sequence, 0 (forever) or 1–1000 total plays. Failed validation leaves every source artboard untouched. Saved canvas JSON and existing version snapshots retain the full slide structure; no database migration is required.

Validation lives in `test/banner/slides*.test.ts`, the TheBrief conversion/package tests and existing timeline/playback suites. Browser QA uses a local three-layout test copy for destructive cases; production originals are only selected, scrubbed and played.

Timeline blocks describe the actual changing properties and their direction (Fade in/out, Move left/right/up/down, Scale up/down, Rotate, Motion path). Mixed properties have combined labels; repeated changes use neutral property names such as Move vertically. Imported samples are not assigned guessed preset names. Authored named effects and known presets retain their labels.
