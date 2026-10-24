# Campus Placement Management System (CPMS)

A complete, working placement platform for a college: **students**, **recruiters**, the **Training & Placement Officer (TPO)** and a **Super Admin** work on the same verified data — from registration and eligibility to interviews, offers and reports.

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + React Router (plain CSS, responsive, accessible) |
| Backend | Node.js 22 (ESM), Express 4, Mongoose 8, zod validation |
| Database | MongoDB (also runs on MongoDB-compatible servers such as FerretDB) |
| Auth | JWT + server-side revocable sessions, bcrypt, lockout, rate limiting |
| Files | Private local storage, streamed only through authorised routes |
| Tests | 44 unit + 62 API integration tests (`node:test` + supertest), plus optional Playwright UI tests |

Every part of the specification (30-part product document + PRD v1.0) is implemented — see [`docs/COVERAGE_MATRIX.md`](docs/COVERAGE_MATRIX.md) for a requirement-by-requirement map to code and tests.

## Quick start (local, 5 minutes)

Prerequisites: **Node 18.18+** (22 recommended) and a **MongoDB** you can reach (local install, Docker, or Atlas).

```bash
# 1. Backend
cd backend
cp .env.example .env            # edit MONGODB_URI if needed; JWT_SECRET is fine for local use
npm install
npm run seed:reset              # demo data (DROPS the database named in MONGODB_URI)
npm run dev                     # API on http://localhost:5000

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev                     # UI on http://localhost:5173 (proxies /api to :5000)
```

If MongoDB is not running, the development API stays available and retries the database connection every 5 seconds. API requests return a clear `503` until MongoDB is reachable; start MongoDB locally or update `MONGODB_URI` in `backend/.env`.

Open http://localhost:5173 and log in with a demo account:

| Role | E-mail | Password |
|---|---|---|
| Super Admin | admin@college.edu | Admin@12345 |
| TPO | tpo@college.edu | Tpo@12345 |
| Student (verified, has an offer) | student1@college.edu … student10@college.edu | Student@123 |
| Recruiter (ABC Technologies, owner) | hr@abc-tech.com | Recruiter@123 |
| Recruiter (same company, "recruiter" role) | recruiter2@abc-tech.com | Recruiter@123 |
| Recruiter (Delta Analytics) | hr@delta-analytics.com | Recruiter@123 |
| Recruiter (company still pending verification) | hr@zeta-systems.com | Recruiter@123 |

> These passwords are for **local demos only**. Never seed a production database (the seed script refuses unless forced) — create the first admin with `node scripts/createSuperAdmin.js "Full Name" email 'Password'` instead.

### One-command alternative (Docker)

```bash
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
docker compose up --build         # app + MongoDB, UI and API on http://localhost:5000
# optional demo data:  docker compose exec app node scripts/seed.js --reset --force-production
docker compose exec app node scripts/createSuperAdmin.js "Your Name" admin@college.edu 'StrongPassw0rd!'
```

## Project layout

```
cpms/
├─ backend/            Express API  (src/, scripts/, tests/)
│  ├─ src/models        22 Mongoose collections
│  ├─ src/services      business rules (eligibility, status machine, offers, policies, analytics…)
│  ├─ src/routes        REST endpoints under /api/v1
│  ├─ src/middleware    auth/RBAC, validation, sanitising, rate limit, uploads
│  ├─ scripts/          seed, create-admin, sync-indexes, backup
│  └─ tests/            unit + integration
├─ frontend/           React app (src/pages/{common,student,recruiter,admin})
├─ e2e/                optional Playwright browser tests
├─ docs/               architecture, DB schema, API, test plan, acceptance checklist, manuals, deployment
├─ Dockerfile, docker-compose.yml
```

## Everyday commands

| Where | Command | What it does |
|---|---|---|
| backend | `npm run dev` / `npm start` | run the API (watch mode / plain) |
| backend | `npm test` | unit tests (no database needed) + integration tests (need MongoDB, see below) |
| backend | `npm run test:unit` | pure-logic tests only |
| backend | `MONGODB_URI_TEST=mongodb://127.0.0.1:27017/cpms_test npm run test:integration` | API tests against a **throw-away** DB (name must contain "test") |
| backend | `npm run seed:reset` | reset DB + demo data |
| backend | `node scripts/createSuperAdmin.js "Name" email 'Password'` | create the first Super Admin (also `npm run create-admin -- "Name" email 'Password'`) |
| backend | `npm run sync-indexes` | build/verify indexes (use in production deploys) |
| backend | `npm run backup` | JSON backup of all collections to `./backups` |
| frontend | `npm run dev` / `npm run build` | dev server / production build into `dist/` |

If the frontend is built (`frontend/dist`), the backend serves it at `/` too — one process, one port (set `SERVE_FRONTEND=false` to disable).

## Documentation

| Document | Purpose |
|---|---|
| [docs/PRD_SRS_SUMMARY.md](docs/PRD_SRS_SUMMARY.md) | Product scope, roles, functional & non-functional requirements |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, request flow, security design, key decisions |
| [docs/DATABASE.md](docs/DATABASE.md) | Collections, fields, indexes, relationships |
| [docs/API.md](docs/API.md) | Every endpoint with role, body and notes |
| [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md) | Eligibility engine, status machine, policies, metric definitions |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | Test strategy and case list |
| [docs/ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md) | Release checklist from the specification |
| [docs/COVERAGE_MATRIX.md](docs/COVERAGE_MATRIX.md) | Spec part → implementation → test |
| [docs/USER_MANUAL.md](docs/USER_MANUAL.md) | Step-by-step guides for each role |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Production setup, backup/restore, hardening |
| [docs/ROADMAP.md](docs/ROADMAP.md) | P0 / P1 / P2 priorities and ideas beyond v1 |






git add .
git commit -m "update "
git branch -M main
git push origin main