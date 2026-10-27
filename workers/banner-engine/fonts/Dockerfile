# The accepted previous image is retained unchanged; preparation verifies this ID.
FROM xeroflow-banner-engine:font-base-1fbdad626b0f
USER 0
RUN mkdir -p /usr/share/fonts/truetype/banner /usr/share/doc/banner-engine/fonts/source-sans-3 && chmod 0555 /usr/share/fonts /usr/share/fonts/truetype /usr/share/fonts/truetype/banner /usr/share/doc/banner-engine/fonts /usr/share/doc/banner-engine/fonts/source-sans-3
COPY --chmod=0444 SourceSans3-Bold.ttf /usr/share/fonts/truetype/banner/SourceSans3-Bold.ttf
COPY --chmod=0444 LICENSE.md /usr/share/doc/banner-engine/fonts/source-sans-3/LICENSE.md
USER 65532:65532
