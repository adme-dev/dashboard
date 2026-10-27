# Generated build context contains only checksum-verified official CLIs/notices/font.
FROM --platform=linux/amd64 debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8
COPY --chmod=0555 bin/ /opt/banner-engine/
COPY notices/ /usr/share/doc/banner-engine/
COPY fonts/ /usr/share/fonts/truetype/banner/
ENV HOME=/tmp XDG_CONFIG_HOME=/tmp/config XDG_CACHE_HOME=/tmp/cache PHOTOCRAFT_CONFIG_DIR=/tmp/photocraft VECTORCRAFT_CONFIG_DIR=/tmp/vectorcraft VECTORCRAFT_NO_PREFS=1
USER 65532:65532
WORKDIR /tmp
