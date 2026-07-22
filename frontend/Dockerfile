# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build ----------
# Runs `tsc -b && vite build` once, producing /app/dist. This stage is only
# executed when the image is built (locally or in CI) — NOT at container start.
FROM node:20-alpine AS build
WORKDIR /app

# Install deps first for better layer caching. We use `npm install` (not `npm ci`)
# so builds work even without a lockfile; if a lockfile is present it's honored.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy the rest of the source and produce the production bundle.
COPY . .
RUN npm run build

# ---------- Stage 2: dev image ----------
# Used only when SMOKESIGNALS_ENV=development (via docker-compose.override.yml).
# Bind mount at /app + anonymous volume at /app/node_modules give live reload.
FROM node:20-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------- Stage 3: production runtime ----------
# Serves the built SPA with an nginx that also proxies /api/* to the backend
# service. This makes the deployment self-contained: browsers only need to
# reach the frontend container, and both HTML/asset loads AND API/upload
# requests are handled from the same origin (no CORS, no separate proxy).
FROM nginx:1.27-alpine AS prod
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173
CMD ["nginx", "-g", "daemon off;"]
