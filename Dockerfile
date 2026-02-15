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

# Copy frontend source and build
# Vite bakes VITE_* env vars into the bundle at build time
ARG VITE_STYTCH_PUBLIC_TOKEN
ARG VITE_WALLETCONNECT_PROJECT_ID
ARG VITE_ZERODEV_PROJECT_ID
ARG VITE_SENTRY_DSN
ARG VITE_API_URL
COPY frontend ./frontend/
RUN npm run build --prefix frontend

# Production stage
FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Regenerate Prisma client for this image's OpenSSL version
RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
