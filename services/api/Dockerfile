# syntax=docker/dockerfile:1
# Build context is the repository root, so the image can include data/seed.
#   docker build -f services/api/Dockerfile .
FROM node:24-alpine AS deps
WORKDIR /app/services/api
COPY services/api/package.json services/api/package-lock.json ./
# Install scripts only fetch test tooling (in-memory MongoDB, esbuild for tsx); the build uses tsc.
RUN npm ci --ignore-scripts

FROM deps AS build
COPY services/api/tsconfig.json services/api/tsconfig.build.json ./
COPY services/api/src ./src
RUN npx tsc -p tsconfig.build.json

FROM node:24-alpine AS run
WORKDIR /app/services/api
ENV NODE_ENV=production PORT=4000
COPY services/api/package.json services/api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/services/api/dist ./dist
COPY services/api/data ./data
COPY data/seed /app/data/seed
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4000/ready >/dev/null || exit 1
CMD ["node", "dist/server.js"]
