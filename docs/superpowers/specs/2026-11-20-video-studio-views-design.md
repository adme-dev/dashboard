# Video Studio view cleanup

The user authorized a focused cleanup of Video Studio, especially switching from
Storyboard to other screens, while the native ReelMotion export is being proven.
Implementation choices below are the agent's calls under that authorization.

Observed production: Storyboard opens inside the narrow inspector below repeated
status and summary chrome. Its own 65svh scroll area is nested inside another
scroll area. Portrait preview has a 520px minimum inside a much shorter workspace,
so the full picture cannot be inspected without scrolling.

## Approach

Use a first-class Storyboard workspace alongside Preview, Library and History.
Keep the inspector for selection, production and review controls. Preserve the
same mounted storyboard while switching views so local shot selection, copy
review and draft state remain intact. Preserve the existing preview mount too.
The alternative of expanding the inspector only for Storyboard makes the whole
layout jump; a separate modal hides the timeline. The workspace approach reuses
the existing bounded editor shell and lets the timeline remain available.

Fit the preview to the available workspace width and height with its authored
aspect ratio, including portrait, square and landscape. Do not change export
pixels, timeline content or render policy. Each active pane owns scrolling;
returning to a view must not inherit another view's scroll position. Navigation
must work below lg and with the inspector collapsed. Switching views must never
save, generate, render, publish or apply a storyboard.

Keep Nuxt UI v4 controls, semantic dark-mode colours and keyboard-accessible tabs.
No form fields, provider setup or rendering architecture change in this pass.
