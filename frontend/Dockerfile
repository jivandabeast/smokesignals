# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
# Runs `tsc -b && vite build` once, producing /app/dist. This stage is only
# executed when the image is built (locally or in CI) — NOT at container start.
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the source and produce the production bundle.
COPY . .
RUN npm run build

# ---------- Stage 2: dev image ----------
# Used only when SMOKESIGNALS_ENV=development (via docker-compose.override.yml).
# Bind mount at /app + anonymous volume at /app/node_modules give live reload.
FROM node:20-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------- Stage 3: production runtime ----------
# Ships ONLY the pre-built static files + a tiny static server. No Node build
# tools, no source, no dev deps. Fast, small, and no runtime `vite build`.
FROM node:20-alpine AS prod
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist
EXPOSE 5173
# `-s` = SPA mode (serve index.html for unknown routes so React Router works)
# `-l 5173` = listen port
CMD ["serve", "-s", "dist", "-l", "5173"]
