# Deployment guide

## 1. Requirements
Node.js ≥ 18.18 (22 LTS recommended), MongoDB 6+ (Atlas or self-hosted; a replica set is recommended for backups), and an SMTP account for production e-mail. For Vercel, use a private Vercel Blob store for uploaded files; serverless local files are not durable.

## 2. Docker (single host)
```bash
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
export APP_URL=https://placement.example.edu      # also used as the CORS origin by docker-compose.yml
docker compose up -d --build
docker compose exec app node scripts/syncIndexes.js
docker compose exec app node scripts/createSuperAdmin.js "Admin Name" admin@example.edu 'LongStrongPassword!'
```
`docker-compose.yml` runs `mongo:7` and the app (API + built React UI on port 5000) with named volumes for the database and uploaded files. See `docker-compose.override.example.yml` for SMTP and port overrides. Put a TLS reverse proxy in front.

## 3. Without Docker
```bash
cd frontend && npm ci && npm run build            # creates frontend/dist
cd ../backend && npm ci --omit=dev
cp .env.example .env                               # fill in production values (below)
node scripts/syncIndexes.js
node scripts/createSuperAdmin.js "Admin Name" admin@example.edu 'LongStrongPassword!'
NODE_ENV=production node src/server.js             # run under systemd / pm2
```
Alternatively host `frontend/dist` on a static host/CDN and set `VITE_API_BASE_URL` at build time plus `SERVE_FRONTEND=false` and a matching `CORS_ORIGINS`.

## 4. Vercel frontend + backend

Deploy the frontend and API as **two Vercel projects** from the same Git repository. The frontend is a Vite static site. The backend runs as Vercel Node.js Functions and uses MongoDB Atlas plus a private Vercel Blob store.

### Backend project

1. Import the repository in Vercel and set **Root Directory** to `backend`. Use the **Other** framework preset, `npm ci` as the install command, and leave the output directory empty. `backend/vercel.json` rewrites `/api/v1/*` to the Express dispatcher at `backend/api/dispatch.js`; `backend/api/cron.js` handles scheduled maintenance.
2. Create a **private** Vercel Blob store and connect it to this backend project. Vercel should provide OIDC credentials automatically; alternatively set `BLOB_READ_WRITE_TOKEN` as a backend environment variable.
3. Set these backend environment variables in Vercel (Production and any Preview environment you intend to use):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Full MongoDB Atlas URI for the production database |
| `JWT_SECRET` | A newly generated random secret of at least 32 characters |
| `APP_URL` | Frontend Vercel origin, e.g. `https://cpms.vercel.app` |
| `CORS_ORIGINS` | The exact frontend origin; comma-separate any custom domains |
| `STORAGE_DRIVER` | `vercel-blob` |
| `CRON_SECRET` | A separate random secret; Vercel sends it as the scheduled request's bearer token |
| `JOBS_ENABLED` | `false`; serverless instances must not start interval timers |
| `EXPOSE_DEV_TOKENS` | `false` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Configure a real SMTP provider so queued e-mails can be delivered |

`MONGO_MAX_POOL_SIZE` defaults to 5 on Vercel. Keep `BLOB_READ_WRITE_TOKEN` secret if using a token instead of Vercel OIDC. Do not put backend secrets in the frontend project or in Git.

Vercel Functions impose a request-body size limit. The app defaults offer-document and CSV imports to 4 MB on Vercel (5 MB locally) to leave room for multipart form data; keep these limits below the platform's request limit.

The scheduled endpoint processes queued e-mails, offer maintenance, and expired sessions/tokens. The included schedule runs daily at 03:00 UTC, which is compatible with Vercel Hobby's once-per-day cron limit. Hobby scheduling is approximate (up to 59 minutes late); this is not suitable for time-sensitive e-mail delivery. If the account supports more frequent cron schedules, change the expression in `backend/vercel.json` (for example `*/5 * * * *` on a plan that permits it) and redeploy. The `/api/cron` endpoint requires `CRON_SECRET`.

### Frontend project

1. Create a second Vercel project from the same repository, with **Root Directory** set to `frontend`. Use the Vite preset, build command `npm run build`, and output directory `dist`.
2. `frontend/vercel.json` proxies `/api/v1/*` requests to the backend project before applying the SPA fallback. If you use a different backend domain, update that rewrite destination and redeploy.
3. Set `APP_URL` on the backend project to this frontend's production origin. Browser requests remain same-origin through Vercel's proxy, so the frontend does not need `VITE_API_BASE_URL`.

The frontend's `vercel.json` rewrites client-side routes to `index.html`. Check the API at `https://<backend-project>.vercel.app/api/v1/health`.

### Database and first admin

In MongoDB Atlas, allow network access from the Vercel backend. Vercel Hobby does not provide a fixed outbound IP by default; use a supported static-egress/network option where available. Avoid opening Atlas to `0.0.0.0/0` for a production database.

Run `npm run sync-indexes` and `node scripts/createSuperAdmin.js "Admin Name" admin@example.edu 'LongStrongPassword!'` from a trusted local environment configured with the production database URI. Do not run `seed:reset` against production. Existing files in the old local `backend/storage` are not copied automatically; migrate any files still referenced in MongoDB to the private Blob store before switching `STORAGE_DRIVER`.

## 5. Free Render API with MongoDB Atlas

The root `render.yaml` defines a free Render web service. Create the Blueprint from this repository and set `MONGODB_URI` to the Atlas URI for the `campus_placement` database. Render generates `JWT_SECRET`. Application records and uploaded files (resumes, photos, and offer documents) are stored in MongoDB; files use the `cpmsFiles` GridFS bucket.

Free Render services can spin down when idle, so the first request after inactivity may take a while. The free plan does not provide an exclusive fixed outbound IP. Atlas therefore cannot use a narrow IP allowlist for this deployment unless the API is moved to a host/plan with fixed egress. Allowing `0.0.0.0/0` would make the database reachable from any IP and is not recommended for real student records; only consider it for a temporary demo with a dedicated, least-privilege database user and a strong generated password. Do not share the MongoDB URI.

After the service is live, point the frontend's `/api/v1/*` rewrite in `frontend/vercel.json` at its Render URL and redeploy the frontend. Verify `/health` and `/api/v1/health` before trying account login.

## 6. Production environment variables
| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | enables production guards |
| `MONGODB_URI` | yes | include credentials / TLS options |
| `JWT_SECRET` | yes | ≥ 32 random chars; the app refuses to start with the default |
| `APP_URL` | yes | public URL used in e-mail links |
| `CORS_ORIGINS` | if UI on another origin | comma-separated allow-list |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM` | for e-mail | without SMTP, mails stay queued/logged |
| `EXPOSE_DEV_TOKENS` | **must be false** | returns reset/verify tokens in API responses for development only; production start fails if true |
| `STORAGE_DRIVER` | optional | `mongodb` stores private file contents in MongoDB GridFS; `vercel-blob` uses a private Blob store; `local` is for development |
| `CRON_SECRET` | Vercel: yes | protects the scheduled maintenance endpoint |
| `JOBS_ENABLED` | Vercel: `false` | interval timers do not run reliably in serverless functions |
| `MONGO_MAX_POOL_SIZE` | optional | defaults to 5 on Vercel and 20 elsewhere |
| `SESSION_TTL_HOURS`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES`, `BCRYPT_ROUNDS`, `RATE_LIMIT_*` | optional | defaults are sensible; policies in the admin UI can override session/lockout values |
| `MAX_RESUME_MB`, `MAX_OFFER_DOC_MB`, `MAX_IMPORT_MB` | optional | upload limits |

## 7. Hardening checklist
* HTTPS only; HSTS at the proxy; set the proxy so the app sees the real client IP (`trust proxy` is configured for one hop).
* Never run `npm run seed` / `seed:reset` against production (it refuses without `--force-production`).
* MongoDB: auth enabled, network-restricted, TLS, least-privilege app user.
* Keep `.env` out of version control; rotate `JWT_SECRET` to sign everyone out.
* Antivirus scanning of uploads can be added at the storage service boundary if your policy requires it.

## 8. Backups & restore
* `npm run backup` (in `backend`) writes JSON dumps of all collections to `./backups`; prefer mongodump/Atlas snapshots for production. Back up Vercel Blob files separately.
* Test a restore into a scratch database before relying on backups.

## 9. Operations
* Liveness: `GET /api/v1/health` (503 when DB is down). Super Admin → *System* shows health, queue depth and failed e-mails.
* Logs: structured to stdout (HTTP access log + app events); ship them with your platform's collector.
* Scaling: API functions are stateless; sessions are stored in MongoDB and private uploads in Vercel Blob. Scheduled maintenance runs through the protected Vercel Cron endpoint.
* Upgrades: build → `syncIndexes` → rolling restart. No destructive migrations are required for v1.
