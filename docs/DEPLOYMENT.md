# Deployment guide

## 1. Requirements
Node.js ≥ 18.18 (22 LTS recommended), MongoDB 6+ (Atlas or self-hosted; a replica set is recommended for backups), an SMTP account, HTTPS termination (nginx, Caddy, cloud load balancer) and persistent disk for `STORAGE_DIR`.

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

## 4. Production environment variables
| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV=production` | yes | enables production guards |
| `MONGODB_URI` | yes | include credentials / TLS options |
| `JWT_SECRET` | yes | ≥ 32 random chars; the app refuses to start with the default |
| `APP_URL` | yes | public URL used in e-mail links |
| `CORS_ORIGINS` | if UI on another origin | comma-separated allow-list |
| `SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM` | for e-mail | without SMTP, mails stay queued/logged |
| `EXPOSE_DEV_TOKENS` | **must be false** | returns reset/verify tokens in API responses for development only; production start fails if true |
| `STORAGE_DIR` | yes | persistent, private, backed up |
| `JOBS_ENABLED` | one instance only | e-mail queue, offer expiry, cleanup |
| `SESSION_TTL_HOURS`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES`, `BCRYPT_ROUNDS`, `RATE_LIMIT_*` | optional | defaults are sensible; policies in the admin UI can override session/lockout values |
| `MAX_RESUME_MB`, `MAX_OFFER_DOC_MB`, `MAX_IMPORT_MB` | optional | upload limits |

## 5. Hardening checklist
* HTTPS only; HSTS at the proxy; set the proxy so the app sees the real client IP (`trust proxy` is configured for one hop).
* Never run `npm run seed` / `seed:reset` against production (it refuses without `--force-production`).
* MongoDB: auth enabled, network-restricted, TLS, least-privilege app user.
* Keep `.env` out of version control; rotate `JWT_SECRET` to sign everyone out.
* Antivirus scanning of uploads can be added at the storage service boundary if your policy requires it.

## 6. Backups & restore
* `npm run backup` (in `backend`) writes JSON dumps of all collections to `./backups`; prefer `mongodump`/Atlas snapshots for production, plus a copy of `STORAGE_DIR` (resumes, photos, offer letters).
* Test a restore into a scratch database before relying on backups.

## 7. Operations
* Liveness: `GET /api/v1/health` (503 when DB is down). Super Admin → *System* shows health, queue depth and failed e-mails.
* Logs: structured to stdout (HTTP access log + app events); ship them with your platform's collector.
* Scaling: stateless API (sessions in MongoDB). Run N instances behind a load balancer, with `JOBS_ENABLED=true` on exactly one; use shared storage (or an S3-compatible driver behind `storage.service.js`) for uploads.
* Upgrades: build → `syncIndexes` → rolling restart. No destructive migrations are required for v1.
