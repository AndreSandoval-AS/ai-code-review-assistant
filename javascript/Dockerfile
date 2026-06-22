# syntax=docker/dockerfile:1
#
# Multi-stage build for the PR / Code Review Assistant.
# Result: a self-contained image with the embedding model weights baked in, so
# the only thing a user needs on their machine is Docker — no Node, no Python.

# ---- deps: resolve and install node_modules ---------------------------------
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json ./
# No lockfile is committed for this course prototype; install resolves the ranges.
RUN npm install --no-audit --no-fund

# ---- runtime: app + pre-baked model cache -----------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
# Fixed cache path shared by the build-time pre-download and runtime embedding.
ENV HF_CACHE_DIR=/app/.hf-cache

# libgomp1 is required by onnxruntime-node (the engine behind Transformers.js).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY data ./data
COPY eval ./eval

# Bake the embedding model weights into the image (one-time network fetch here;
# runtime stays offline-capable).
RUN npm run predownload

# Default entrypoint runs the CLI; args after `docker compose run app ...` are
# forwarded to it. The `eval` compose service overrides this.
ENTRYPOINT ["npm", "run", "start", "--silent", "--"]
