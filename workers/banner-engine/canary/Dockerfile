# Both references are immutable AMD64 manifests, resolved from official Docker Hub.
FROM --platform=linux/amd64 node:24.18.0-alpine@sha256:4ba75f835bb8802193e4c114572113d4b26f95f6f094f4b5229d2a77773e0afc AS node
FROM --platform=linux/amd64 docker:29.2.0-dind@sha256:99aa88f75d8d401c30e395db1d2e679a89ff0be9b415f020b8e2383c517e1fda
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/lib/libstdc++.so.6* /usr/lib/
COPY --from=node /usr/lib/libgcc_s.so.1 /usr/lib/
COPY --from=node /usr/local/LICENSE /usr/local/share/doc/node/LICENSE
COPY --chmod=0444 inner.tar package.json /opt/canary/
COPY --chmod=0444 fixtures/ /opt/canary/fixtures/
COPY --chmod=0444 pins.mjs policy.mjs supervisor.mjs /opt/canary/
# COPY chmod above affects only files; restore directory traversal explicitly.
RUN chmod 0555 /opt/canary /opt/canary/fixtures
USER root
ENV DOCKER_HOST=unix:///var/run/docker.sock DOCKER_TLS_CERTDIR=""
EXPOSE 8080
ENTRYPOINT ["node", "/opt/canary/supervisor.mjs"]
