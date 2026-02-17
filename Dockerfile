FROM node:22-slim AS deps

WORKDIR /app

# Install backend dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Install frontend dependencies
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm ci --prefix frontend

# Build stage
FROM deps AS build

WORKDIR /app

# Copy prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy backend source and compile
COPY tsconfig.json ./
COPY src ./src/
RUN npx tsc
RUN cp src/docs/openapi.json dist/docs/openapi.json

# Copy frontend source and build
# Vite bakes VITE_* env vars into the bundle at build time
ARG VITE_STYTCH_PUBLIC_TOKEN
ARG VITE_WALLETCONNECT_PROJECT_ID
ARG VITE_ZERODEV_PROJECT_ID
ARG VITE_SENTRY_DSN
ARG VITE_API_URL
COPY frontend ./frontend/
RUN cd frontend && npx vite build

# Production stage
FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./

USER node

# Regenerate Prisma client for this image's OpenSSL version
RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
