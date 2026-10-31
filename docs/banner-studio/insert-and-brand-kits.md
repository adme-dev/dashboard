# Insert media and project brand kits

Banner Studio selects an unambiguous kit when a project opens. Selection does not apply styling to existing layers.

## Kit matching

Selection order is an explicit `brand-kit:<id>` project tag, a unique client default, the project name, the client name, then a unique exact managed font asset reference. Name matching uses complete words and the MotorStack source brand identifier or kit name. Unknown and ambiguous matches remain unselected. Only agency kits and the current client's kits qualify.

A manual kit choice takes priority for that project during the current app session. The Brand sidebar and text inspector share this choice. Opening the font picker defaults to the Brand tab when a kit is selected. The editor loads the kit's managed font faces, including their declared weights; an unavailable managed face cannot silently fall back to another font. New text and buttons use the selected kit's heading font. Existing artwork changes only after an explicit font or kit application.

This uses kits already imported through the existing MotorStack connection. It does not add scheduled provider synchronisation or automatically replace existing campaign assets when MotorStack changes.

## Media and crop

Insert offers upload, images, videos, audio, text, buttons, shapes, masks and the existing MotorStack browser. Upload adds media to the library; choosing a library item inserts it into the current slide. Videos retain their video type and audio becomes an audio layer. New media uses the current slide's duration without an automatic exit animation.

Image properties include Replace image, Crop & fill, fit mode, corner radius and Fill canvas. Replacement follows the layout editing scope and retains geometry and animation. It clears the previous source's crop on linked replacements. A crop-only edit affects the current layout because frame aspect ratios can differ.

Crop uses a source-image frame with pointer and keyboard controls. Corner handles retain the current crop ratio. Arrow keys adjust by 0.5% of the source dimensions; Shift adjusts by 5%. Cancel changes nothing; Apply creates one undoable edit. Changing the selected image or layout closes stale crop/replacement dialogs. Locked layers cannot start or apply either operation.

## Verification

- Vitest covers conservative brand matching, exact managed font selection, unavailable fonts, media types, crop bounds/aspect ratio and linked replacement undo/redo.
- Browser checks use an isolated copy of the GEELY Deer Park design: auto-selected Geely Auto Australia, GEELY 500/600 and Inter 400 font choices, exact managed face application, media upload, image/video/audio insertion, playback, crop dragging, keyboard adjustment, cancel, apply, undo and replacement.
- Production verification is read-only: matching kit, Insert navigation and existing QR Codes navigation. Test artwork is never saved to a live campaign.
