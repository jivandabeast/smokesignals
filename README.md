# SmokeSignals

A tiny social PWA for signaling to your friends what you're up to right now — having a beer, taking a smoke, grabbing a coffee — and letting them join you.

Built as:

- **Backend** — Python 3.12, FastAPI, SQLAlchemy (async), PostgreSQL. Runs in the `backend/` folder.
- **Frontend** — Vite + React 18 + TypeScript, `vite-plugin-pwa` for the service worker, Leaflet + `leaflet.markercluster` for maps, Recharts for stats. Runs in the `frontend/` folder.
- **Orchestration** — a single `docker-compose.yml` that runs Postgres, the API, and the PWA together. Multi-arch (`linux/amd64` + `linux/arm64`) images are published to DockerHub by CI on every push to `main`.

## Features

- One-tap **activity posting** (beer, smoke, coffee, ...) with optional geolocation.
- **Extensible activity types**: admins can add/remove/enable/reorder them from the Admin panel.
- **Friend requests + circles** (groups). A friend can belong to many circles. When you post, you pick which circle(s) receive the signal (or share with all friends).
- **Web Push notifications** through the service worker whenever a friend signals or interacts with you. A gentle in-app banner asks for permission the first time.
- **History**, a **Leaflet map** with marker clustering and stack-detection, and a **stats** dashboard (by type, weekday, hour, streak).
- **Auto-labeled places**: once you name a place, future signals within a small radius reuse the same label automatically.
- **Profile pictures**, nicknames, and contact platforms (phone/Signal/Telegram/WhatsApp) so your friends know how to call.
- **Admin bootstrap**: on the very first run, the app prompts to create the initial admin user. Admins get a drawer entry into the panel from the header on any screen size.
- **Optional Cloudflare Zero Trust** JWT verification. When enabled, the backend caches Cloudflare's JWKS (`/cdn-cgi/access/certs`) for 24 hours to avoid slamming their edge.
- **Docker deployment** with an environment flag (`SMOKESIGNALS_ENV`) that toggles hot-reload of both the API (`uvicorn --reload`) and the PWA (`vite` dev server) for local development.

## Quick start

### Option A — Pull pre-built images (recommended for end users)

```bash
cp .env.example .env
docker compose up -d
```

Compose will pull `jivandabeast/smokesignals-backend:latest` and `jivandabeast/smokesignals-frontend:latest` from DockerHub. Visit http://localhost:5173. If no admin exists yet the app will prompt you to create the first admin user.

Pin to a specific version by setting `IMAGE_TAG=<git-sha>` in `.env` — every commit merged to `main` publishes both `:latest` and `:<sha>` tags.

### Option B — Build from source (recommended for development)

```bash
cp .env.example .env
docker compose build
docker compose up
```

The local build reuses the DockerHub image name, so subsequent `docker compose up` calls prefer your local build until you `docker compose pull`.

### Development flag

`SMOKESIGNALS_ENV=development` (the default in `.env.example`) does two things:

- Backend container runs `uvicorn app.main:app --reload` so the API restarts when you save Python files. Your source is bind-mounted into `/app/app`.
- Frontend container runs `vite --host` for HMR. Your source is bind-mounted into `/app` (with an anonymous volume for `node_modules`).

Set `SMOKESIGNALS_ENV=production` to switch to a plain uvicorn + `vite build && vite preview` and skip the bind mounts.

> **Gotcha:** If you add a new dependency to `frontend/package.json`, rebuild **and** renew the anonymous `node_modules` volume:
>
> ```bash
> docker compose build frontend
> docker compose up -d --force-recreate --renew-anon-volumes frontend
> ```

### Cloudflare Zero Trust (optional)

If you sit the app behind a Cloudflare Access application:

```
SMOKESIGNALS_CLOUDFLARE_ACCESS_ENABLED=true
SMOKESIGNALS_CLOUDFLARE_TEAM_DOMAIN=myteam            # or myteam.cloudflareaccess.com
SMOKESIGNALS_CLOUDFLARE_AUDIENCE=<AUD from the CF Access app>
```

The backend will accept requests bearing either a `Cf-Access-Jwt-Assertion` header (Cloudflare injects this) or the same JWT as a `Bearer` token. On first sight of a new email, a local user is created automatically. Certificates are pulled from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` and cached in-memory for 24 hours (configurable via `SMOKESIGNALS_CLOUDFLARE_CERT_CACHE_SECONDS`).

You can also call `POST /api/auth/cf-exchange?cf_access_jwt=<jwt>` to trade the CF token for a local session token.

### Web Push (optional)

Generate a VAPID keypair once and drop it in `.env`:

```bash
docker compose exec frontend npx web-push generate-vapid-keys
```

Then set `SMOKESIGNALS_VAPID_PUBLIC_KEY`, `SMOKESIGNALS_VAPID_PRIVATE_KEY`, and `SMOKESIGNALS_VAPID_CONTACT_EMAIL`, and restart the backend. Users will see an in-app banner asking to enable notifications the next time they load the page (the banner remembers a "not now" for a week).

## Project layout

```
backend/
  app/
    main.py            FastAPI app, lifespan, defaults seeding
    config.py          pydantic settings (all env-prefixed with SMOKESIGNALS_)
    database.py        async SQLAlchemy engine + get_db
    models.py          ORM models
    schemas.py         Pydantic API schemas
    security.py        bcrypt_sha256 + local JWT (bcrypt kept as legacy verifier)
    cloudflare.py      JWKS fetch + 24h cache + JWT verification
    deps.py            get_current_user / get_admin_user
    push.py            web-push dispatch with dead-subscription pruning
    routers/
      auth.py          register, login, admin bootstrap, cf-exchange, /me
      users.py         search, update, avatar upload
      friends.py       friend requests, accept/decline, listing
      circles.py       CRUD + membership
      activity_types.py  admin-managed extensible types (list open)
      activities.py    post activity, feed, mine, delete, stats, nearby-label
      notifications.py list, mark read
      push.py          VAPID pub key + (un)subscribe
      admin.py         admin user management
frontend/
  src/
    main.tsx          entry, mounts AuthProvider + Router
    App.tsx           top-level routing incl. bootstrap-admin gate
    auth.tsx          auth context
    api.ts            fetch wrapper (bearer token, JSON, upload)
    push.ts           silent + explicit subscription helpers
    sw.ts             custom service worker (push + notificationclick)
    styles.css        mobile-first dark theme + banner + drawer
    components/
      Layout.tsx      header + tab bar + FAB + drawer + push banner
      ActivityCard.tsx
    pages/
      Login.tsx  Register.tsx  BootstrapAdmin.tsx
      Feed.tsx  Post.tsx  Notifications.tsx
      Friends.tsx  Circles.tsx
      History.tsx  MapView.tsx  Stats.tsx  Profile.tsx  Admin.tsx
  public/icons/       PWA icons + SVG source
.github/workflows/
  docker-image.yml    Multi-arch (amd64 + arm64) build → push-by-digest → merge
docker-compose.yml
.env.example
AGENTS.md            Notes for agentic contributors / future you
```

## What "sending the signal" does

1. The user picks an activity tile and (optionally) a note, location, and target circle(s).
2. The backend persists an `Activity` row (timestamp is added by the DB). If the user has opted into location, `latitude`, `longitude`, and `place_label` are stored too.
3. The audience is computed:
   - If circles are chosen, the union of their members is used.
   - Otherwise, all accepted friends are used.
4. A `Notification` row is inserted for every recipient (so it shows up in the in-app bell) and, if VAPID keys are configured, a Web Push is dispatched to each of that user's registered browser subscriptions.
5. Recipients see the signal in their feed and can tap through to your profile to call you back on your preferred platform.

## CI / releases

`.github/workflows/docker-image.yml` builds both images natively for each architecture (no QEMU) using `ubuntu-latest` (amd64) and `ubuntu-24.04-arm` (arm64) runners, pushes each single-arch layer by digest, and then merges them into a single multi-arch manifest tagged `:latest` + `:<git-sha>`.

You need two GitHub Actions secrets in the repo settings:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN` — a DockerHub Personal Access Token with Read/Write scope.

## Notes

- The backend auto-creates tables on startup via `Base.metadata.create_all` and seeds a starter set of activity types (beer, wine, cocktail, coffee, smoke, vape). If you'd rather use Alembic, `alembic` is already in the dependency list.
- Uploads live in the `uploads` docker volume and are served under `/uploads/*`.
- Long lists (feed, notifications) simply poll every 20–30 seconds; if you want realtime, wiring a WebSocket into `app/routers/notifications.py` is straightforward.
- Passwords are hashed with **`bcrypt_sha256`**, which HMAC-SHA256-pre-hashes the password to a 32-byte input before running bcrypt. This sidesteps bcrypt's 72-byte password limit while keeping the same at-rest security properties. Legacy `bcrypt` hashes still verify and are transparently upgraded on next login.
