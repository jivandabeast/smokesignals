# AGENTS.md

Notes for autonomous / AI contributors working on SmokeSignals. If you're a human, this doubles as an opinionated architecture tour.

## TL;DR

- Python 3.12 FastAPI backend, React 18 + TypeScript Vite frontend.
- **All configuration is env-driven**, prefixed `SMOKESIGNALS_`.
- **Run everything in Docker.** Never assume host has Python/Node — always use `docker compose exec {backend,frontend} …` to run commands.
- **Do not commit** anything under `uploads/`, `pgdata/`, `dist/`, `dev-dist/`, `node_modules/`, `__pycache__/`, `.venv/`, or `.env`. The root `.gitignore` covers these.
- **Multi-arch images** are published by CI. Match the image names in `docker-compose.yml` if you rename.

## Repository layout

```
backend/          FastAPI app (see backend/app/)
frontend/         Vite + React + TS PWA (see frontend/src/)
.github/workflows/ CI (multi-arch Docker image build)
docker-compose.yml
.env.example       Every configurable variable is documented here
```

Detailed per-file map lives in the "Project layout" section of the [README](./README.md).

## Running the app

```bash
cp .env.example .env
docker compose up -d          # pulls DockerHub images
# OR
docker compose build          # build locally, tag with the DockerHub name
docker compose up -d
```

Frontend: http://localhost:5173 · Backend: http://localhost:8000/api

If you touch `frontend/package.json`, you MUST renew the anonymous `node_modules` volume:

```bash
docker compose build frontend
docker compose up -d --force-recreate --renew-anon-volumes frontend
```

Same for `backend/pyproject.toml`:

```bash
docker compose build backend
docker compose up -d backend
```

## Design principles (please respect these)

1. **Privacy by default.** `User.location_opt_in` defaults to `false`. The backend strips `latitude`/`longitude` if the flag is off, even if the client sends them. Do not add a client-only privacy gate.
2. **Server owns the truth about audiences.** Never rely on the client to fan out notifications. When adding a new "share to X" feature, compute recipients server-side in the router.
3. **Admin bootstrap is a one-shot.** `GET /api/auth/bootstrap-status` reports whether an admin exists, and `POST /api/auth/register-admin` refuses when one does. Keep both endpoints in sync when adding roles.
4. **Extensible activity types.** They live in the `activity_types` table, not an enum. If you find yourself hardcoding a slug, stop and use the row lookup.
5. **Mobile-first UI.** Every touch target should be at least 44×44 CSS px. Bottom nav is for the 5 most-used flows only. Secondary destinations go behind the header drawer.
6. **Silent success is a bug.** If a request is partially ignored by the server (e.g., location stripped because opt-in is off), surface that state to the user in the response or a follow-up call.

## Auth model

Two paths, both terminate at the same `deps.get_current_user`:

- **Local**: bcrypt_sha256 in `security.py` + HS256 JWT in `Authorization: Bearer …`.
- **Cloudflare Access** (optional): `Cf-Access-Jwt-Assertion` header verified in `cloudflare.py`. First-sight emails auto-provision a `User` row with a null `hashed_password`.

Admins additionally pass `deps.get_admin_user`. Prefer that dependency over checking `user.is_admin` inline.

Password hashing uses `bcrypt_sha256`. `bcrypt` is still configured as a legacy verifier so existing hashes work, and `security.needs_rehash()` opportunistically upgrades them on next login. Do not remove the legacy verifier without a migration.

## Database

- Async SQLAlchemy 2.0, `AsyncSession`. Get one via the `Depends(get_db)` pattern.
- Tables are created on startup by `main.py` via `Base.metadata.create_all`. Alembic is available in the deps if you want migrations for production; add a migration whenever you change columns and make the create_all a no-op.
- Use `select(Model).where(...)` / `session.execute(...)` — no legacy `session.query()`.
- All FK relationships use `ondelete="CASCADE"` where the child is worthless without the parent.

## Notifications

Two layers, always in sync:

1. **`Notification` rows** in the DB — power the bell + `/notifications` page.
2. **Web Push** via `push.py` — best-effort delivery to registered browser subs. `push.py` prunes 404/410 responses.

New notification types: add a `Notification.kind` literal, insert rows in the router that generates the event, and (optionally) fan out a push. Don't skip the DB row — it's what makes the bell reliable when push fails.

## Web Push / VAPID

- Public key is exposed via `GET /api/config`. Frontend passes it to `pushManager.subscribe`.
- Private key stays server-side, used to sign VAPID JWTs in `push.py`.
- The frontend shows an in-app banner (`Layout.tsx`) asking to enable notifications when `Notification.permission === 'default'`. Never call `Notification.requestPermission()` outside a user gesture — iOS Safari requires it, and other browsers penalize hard-asks.

## Maps

- Leaflet + `react-leaflet` for the map surface.
- Marker clustering uses `leaflet.markercluster`. Because that package predates the `exports` field, we import the shipped file directly:
  ```ts
  import 'leaflet.markercluster/dist/leaflet.markercluster-src.js'
  ```
  Its CSS is imported from `styles.css`, not from `main.tsx` (Vite's CSS loader resolves it fine, but the JS resolver doesn't).
- Same-coordinate stacks are collapsed into count-badged markers before being handed to the cluster group. That prevents unclickable overlaps.

## Place labels

`GET /api/activities/nearby-label?lat=..&lon=..&accuracy=..` returns a suggested label from the user's own history if there's a signal within `max(120m, min(500m, accuracy))`. The Post page pre-fills the label field with this. Radius adapts to the browser's reported accuracy — mobile GPS narrows it, desktop Wi-Fi widens it.

If you extend the schema to first-class Places, keep this endpoint as the read model so the UI doesn't have to change.

## CI / images

- `.github/workflows/docker-image.yml` builds `linux/amd64` on `ubuntu-latest` and `linux/arm64` natively on `ubuntu-24.04-arm` (no QEMU).
- Uses the **push-by-digest → merge** pattern to produce clean multi-arch manifests.
- Publishes `:latest` and `:<git-sha>` to `jivandabeast/smokesignals-{backend,frontend}` on every push to `main`.
- Requires GitHub secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`.

## Common tasks (recipes)

### Add a new API route

1. Add the route to a router under `backend/app/routers/`. If it's a new domain, create a new router module and include it in `main.py`.
2. Add / update the response schema in `schemas.py`.
3. Add a matching typed helper in `frontend/src/api.ts` if the shape is non-trivial, and types in `frontend/src/types.ts`.
4. If auth-gated: use `Depends(get_current_user)` (or `get_admin_user`). Never re-implement auth in the route body.
5. Update any relevant page under `frontend/src/pages/`.

### Add a new activity type

Don't — the admin panel does this at runtime. If you want a new default seeded on first run, edit the list in `main.py::seed_activity_types` (but existing installs won't retroactively see it).

### Add a new frontend dependency

```bash
docker compose exec frontend npm install <package>
# then rebuild the image and renew the anon volume:
docker compose build frontend
docker compose up -d --force-recreate --renew-anon-volumes frontend
```

Commit both `package.json` and `package-lock.json`. **Never** commit `node_modules/`.

### Add a new backend dependency

Edit `backend/pyproject.toml`, then:

```bash
docker compose build backend
docker compose up -d backend
```

If the dependency has native modules (e.g., cryptography, psycopg2), verify the build succeeds on both amd64 and arm64 — CI will fail loudly if it doesn't.

### Run the linter / type-checker

There is no configured lint step yet. If you're introducing one, put:

- Python: `ruff` (already in deps) → `docker compose exec backend ruff check .`
- TypeScript: `tsc --noEmit` → `docker compose exec frontend npx tsc --noEmit`

Add whichever you use to `.trae/rules/project_rules.md` so future agents pick it up.

## Things to be careful about

- **The `node_modules` anonymous volume is sticky.** Building a new image alone won't refresh dependencies — you need `--renew-anon-volumes`. This bites everyone once.
- **CORS + credentials.** `SMOKESIGNALS_CORS_ORIGINS=*` is convenient in dev but incompatible with cookies. We use `Authorization: Bearer …` instead of cookies specifically to keep this simple. Don't switch to cookie auth without wiring proper origin handling.
- **Push notification payloads are unencrypted at the OS layer.** Assume any content you send lands in a system notification log. Keep it short and non-sensitive.
- **Emoji icons in PWA manifest.** The PNGs in `frontend/public/icons/` are placeholders. If you regenerate them, keep both 192 and 512, and update `manifest` in `vite.config.ts` if you add sizes.
- **Location accuracy varies wildly.** Mobile GPS ≈ 5–30 m, desktop Wi-Fi triangulation ≈ 100–2000 m, VPN'd desktop ≈ tens of km. Any feature that consumes coords must be resilient to noise (e.g., cap the label-reuse radius, cluster on the map, don't display raw coords with false precision).

## When in doubt

- Read `README.md`.
- Grep for the feature you're touching — the codebase is small enough that ripgrep is faster than remembering.
- Prefer editing existing files over creating new ones.
- Don't commit unless the user asks.
