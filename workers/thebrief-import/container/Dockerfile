FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
RUN npm install --no-audit --no-fund happy-dom@20.10.6 acorn@8.17.0 sharp@0.34.5 zod@4.4.3 tsx@4.23.0 && npm pkg set type=module
COPY scripts/thebrief/ scripts/thebrief/
COPY app/utils/thebrief-import.ts app/utils/thebrief-import.ts
COPY shared/bannerImageFilters.mjs shared/bannerTextColor.mjs shared/bannerImageBackground.mjs shared/
COPY workers/thebrief-import/container/server.mjs workers/thebrief-import/container/server.mjs
ENV THEBRIEF_IMPORT_SERVER=1
EXPOSE 8080
CMD ["node", "--import", "tsx", "workers/thebrief-import/container/server.mjs"]
